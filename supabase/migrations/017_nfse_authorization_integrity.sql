-- Fiscal authorization is deny-by-default. Browser clients can read their
-- authorized scope and request queue operations through narrow RPCs only.

create or replace function can_access_nfse_issuer(p_issuer uuid)
returns boolean language sql stable security definer
set search_path=public,pg_temp as $$
  select exists (
    select 1
      from profiles p
      join nfse_issuers i on i.office_id=p.office_id and i.id=p_issuer
     where p.id=auth.uid()
       and has_module('nfse')
       and (
         not exists(select 1 from nfse_profile_issuer_access r where r.profile_id=p.id)
         or exists(select 1 from nfse_profile_issuer_access r where r.profile_id=p.id and r.issuer_id=i.id and r.allowed)
       )
  )
$$;
revoke all on function can_access_nfse_issuer(uuid) from public,anon;
grant execute on function can_access_nfse_issuer(uuid) to authenticated;

create or replace function is_nfse_operator()
returns boolean language sql stable security definer
set search_path=public,pg_temp as $$
  select exists(select 1 from profiles where id=auth.uid() and role in ('admin','operator'))
$$;
revoke all on function is_nfse_operator() from public,anon;
grant execute on function is_nfse_operator() to authenticated;

alter table nfse_files drop constraint nfse_files_kind_check;
alter table nfse_files add constraint nfse_files_kind_check check(kind in ('signed_dps','official_xml','simulated_xml','raw_response'));
update nfse_files f set kind='simulated_xml'
where kind='official_xml' and exists(select 1 from nfse_attempts a where a.invoice_id=f.invoice_id and a.classification='simulated_authorized');

create or replace function replace_nfse_certificate(
 p_office uuid,p_issuer uuid,p_provider text,p_reference text,p_key_version text,
 p_fingerprint text,p_subject_tax_id text,p_not_before timestamptz,p_not_after timestamptz
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare new_id uuid;
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 if not exists(select 1 from nfse_issuers where id=p_issuer and office_id=p_office) then raise exception 'issuer_not_found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_issuer::text,0));
 insert into nfse_certificates(office_id,issuer_id,custody_provider,custody_reference,key_version,fingerprint_sha256,subject_tax_id,not_before,not_after,status)
 values(p_office,p_issuer,p_provider,p_reference,p_key_version,p_fingerprint,p_subject_tax_id,p_not_before,p_not_after,'replaced') returning id into new_id;
 update nfse_certificates set status='replaced' where issuer_id=p_issuer and status='active';
 update nfse_certificates set status='active' where id=new_id;
 return new_id;
end $$;
revoke all on function replace_nfse_certificate(uuid,uuid,text,text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function replace_nfse_certificate(uuid,uuid,text,text,text,text,text,timestamptz,timestamptz) to service_role;

-- Cross-tenant/cross-issuer links are rejected by the database, not only API code.
alter table nfse_issuers add constraint nfse_issuers_office_id_id_key unique(office_id,id);
alter table nfse_takers add constraint nfse_takers_office_issuer_id_key unique(office_id,issuer_id,id);
alter table nfse_service_profiles add constraint nfse_services_office_issuer_id_key unique(office_id,issuer_id,id);
alter table nfse_invoices
  add constraint nfse_invoice_issuer_scope_fk foreign key(office_id,issuer_id) references nfse_issuers(office_id,id),
  add constraint nfse_invoice_taker_scope_fk foreign key(office_id,issuer_id,taker_id) references nfse_takers(office_id,issuer_id,id),
  add constraint nfse_invoice_service_scope_fk foreign key(office_id,issuer_id,service_profile_id) references nfse_service_profiles(office_id,issuer_id,id);
alter table nfse_certificates
  add constraint nfse_certificate_issuer_scope_fk foreign key(office_id,issuer_id) references nfse_issuers(office_id,id);

do $$ declare t text; begin
  foreach t in array array['nfse_issuers','nfse_service_profiles','nfse_takers','nfse_certificates','nfse_sequences','nfse_invoices','nfse_jobs','nfse_attempts','nfse_files'] loop
    execute format('drop policy if exists isolate_%I on %I',t,t);
    execute format('revoke all on %I from authenticated',t);
    execute format('grant select on %I to authenticated',t);
  end loop;
end $$;

create policy nfse_issuer_read on nfse_issuers for select to authenticated
using(can_access_nfse_issuer(id));
create policy nfse_service_read on nfse_service_profiles for select to authenticated
using(can_access_nfse_issuer(issuer_id));
create policy nfse_taker_read on nfse_takers for select to authenticated
using(can_access_nfse_issuer(issuer_id));
create policy nfse_certificate_read on nfse_certificates for select to authenticated
using(can_access_nfse_issuer(issuer_id));
create policy nfse_sequence_read on nfse_sequences for select to authenticated
using(can_access_nfse_issuer(issuer_id));
create policy nfse_invoice_read on nfse_invoices for select to authenticated
using(can_access_nfse_issuer(issuer_id));
create policy nfse_job_read on nfse_jobs for select to authenticated
using(exists(select 1 from nfse_invoices i where i.id=invoice_id and can_access_nfse_issuer(i.issuer_id)));
create policy nfse_attempt_read on nfse_attempts for select to authenticated
using(exists(select 1 from nfse_invoices i where i.id=invoice_id and can_access_nfse_issuer(i.issuer_id)));
create policy nfse_file_read on nfse_files for select to authenticated
using(exists(select 1 from nfse_invoices i where i.id=invoice_id and can_access_nfse_issuer(i.issuer_id)));

create or replace function enqueue_nfse_issue(p_invoice uuid) returns nfse_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
declare n nfse_invoices; s text; v bigint; j nfse_jobs;
begin
 select * into n from nfse_invoices where id=p_invoice for update;
 if n.id is null or not has_module('nfse') or not is_nfse_operator() or not can_access_nfse_issuer(n.issuer_id)
 then raise exception 'invoice_not_found' using errcode='42501'; end if;
 if n.status='queued' then select * into j from nfse_jobs where invoice_id=n.id and kind='issue'; return j; end if;
 if n.status<>'draft' then raise exception 'invoice_not_issuable'; end if;
 if not exists(select 1 from nfse_certificates c where c.issuer_id=n.issuer_id and c.office_id=n.office_id and c.status='active' and c.not_before<=now() and c.not_after>now()) then raise exception 'active_certificate_required'; end if;
 select dps_series into s from nfse_issuers where id=n.issuer_id and office_id=n.office_id and enabled;
 if s is null then raise exception 'issuer_not_ready'; end if;
 insert into nfse_sequences(office_id,issuer_id,environment,series,next_number) values(n.office_id,n.issuer_id,2,s,2)
 on conflict(issuer_id,environment,series) do update set next_number=nfse_sequences.next_number+1 returning next_number-1 into v;
 update nfse_invoices i set series=s,dps_number=v,status='queued',snapshot=jsonb_build_object(
  'issuer',(select to_jsonb(x)-'created_at' from nfse_issuers x where x.id=i.issuer_id),
  'taker',(select to_jsonb(x)-'created_at' from nfse_takers x where x.id=i.taker_id),
  'service',(select to_jsonb(x)-'created_at' from nfse_service_profiles x where x.id=i.service_profile_id),
  'invoice',jsonb_build_object('competence',i.competence,'amount',i.amount,'description',i.description,'environment',i.environment,'series',s,'number',v)
 ) where i.id=n.id;
 insert into nfse_jobs(office_id,invoice_id,kind) values(n.office_id,n.id,'issue') returning * into j;
 return j;
end $$;
revoke all on function enqueue_nfse_issue(uuid) from public,anon;
grant execute on function enqueue_nfse_issue(uuid) to authenticated;

create or replace function enqueue_nfse_reconciliation(p_invoice uuid) returns nfse_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
declare n nfse_invoices; j nfse_jobs;
begin
 select * into n from nfse_invoices where id=p_invoice for update;
 if n.id is null or not has_module('nfse') or not is_nfse_operator() or not can_access_nfse_issuer(n.issuer_id)
 then raise exception 'invoice_not_found' using errcode='42501'; end if;
 if n.status not in ('unknown','reconciling','persistence_pending') or n.dps_id is null then raise exception 'invoice_not_reconcilable'; end if;
 update nfse_invoices set status='reconciling' where id=n.id;
 insert into nfse_jobs(office_id,invoice_id,kind,status,available_at) values(n.office_id,n.id,'reconcile','queued',now())
 on conflict(invoice_id,kind) do update set status='queued',available_at=now(),claimed_by=null,lease_until=null where nfse_jobs.status<>'claimed'
 returning * into j;
 if j.id is null then raise exception 'reconciliation_already_claimed'; end if;
 return j;
end $$;
revoke all on function enqueue_nfse_reconciliation(uuid) from public,anon;
grant execute on function enqueue_nfse_reconciliation(uuid) to authenticated;
