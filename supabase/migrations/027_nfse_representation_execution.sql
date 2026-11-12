-- Selects the signing authority when a draft is created and carries it to the worker.

create or replace function select_nfse_representation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor_role text;
begin
 new.requested_by:=coalesce(new.requested_by,new.created_by);
 if exists(select 1 from nfse_certificates c where c.issuer_id=new.issuer_id and c.office_id=new.office_id
   and c.status='active' and c.not_before<=now() and c.not_after>now()) then
  new.representation_id:=null;
  return new;
 end if;
 select role into actor_role from profiles where id=new.created_by and office_id=new.office_id;
 select r.id into new.representation_id
 from nfse_representations r join nfse_certificates c on c.id=r.certificate_id
 where r.office_id=new.office_id and r.issuer_id=new.issuer_id and r.status='active'
  and r.valid_from<=now() and (r.valid_until is null or r.valid_until>now())
  and c.status='active' and c.not_before<=now() and c.not_after>now()
  and ((actor_role='client' and r.allow_client_issuance) or (actor_role<>'client' and r.allow_office_issuance))
 order by r.updated_at desc limit 1;
 return new;
end $$;

drop trigger if exists select_nfse_representation_on_invoice on nfse_invoices;
create trigger select_nfse_representation_on_invoice before insert on nfse_invoices
for each row execute function select_nfse_representation();

create or replace function can_access_nfse_issuer_for_profile(p_profile uuid,p_issuer uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from profiles p where p.id=p_profile and (
  (p.role='client' and exists(select 1 from helians_accounts h where h.auth_user_id=p.id and h.issuer_id=p_issuer and h.status='active'))
  or (p.role in ('admin','operator') and (
   not exists(select 1 from nfse_profile_issuer_access a where a.profile_id=p.id)
   or exists(select 1 from nfse_profile_issuer_access a where a.profile_id=p.id and a.issuer_id=p_issuer and a.allowed)
  ))
 ))
$$;
revoke all on function can_access_nfse_issuer_for_profile(uuid,uuid) from public,anon,authenticated;
grant execute on function can_access_nfse_issuer_for_profile(uuid,uuid) to service_role;

create or replace function enqueue_nfse_issue(p_invoice uuid) returns nfse_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
declare n nfse_invoices; s text; v bigint; j nfse_jobs;
begin
 select * into n from nfse_invoices where id=p_invoice for update;
 if n.id is null or not has_module('nfse') or not is_nfse_operator() or not can_access_nfse_issuer(n.issuer_id) then raise exception 'invoice_not_found' using errcode='42501'; end if;
 if n.status='queued' then select * into j from nfse_jobs where invoice_id=n.id and kind='issue'; return j; end if;
 if n.status<>'draft' then raise exception 'invoice_not_issuable'; end if;
 if active_nfse_certificate(n) is null then raise exception 'active_certificate_or_representation_required'; end if;
 select dps_series into s from nfse_issuers where id=n.issuer_id and office_id=n.office_id and enabled;
 if s is null then raise exception 'issuer_not_ready'; end if;
 insert into nfse_sequences(office_id,issuer_id,environment,series,next_number) values(n.office_id,n.issuer_id,n.environment,s,2)
 on conflict(issuer_id,environment,series) do update set next_number=nfse_sequences.next_number+1 returning next_number-1 into v;
 update nfse_invoices i set series=s,dps_number=v,
  dps_id='DPS'||(select municipality_ibge from nfse_issuers where id=i.issuer_id)||'2'||(select tax_id from nfse_issuers where id=i.issuer_id)||lpad(s,5,'0')||lpad(v::text,15,'0'),
  status='queued',snapshot=jsonb_build_object(
   'version','national-dps-1.01','issuer',(select to_jsonb(x)-'created_at' from nfse_issuers x where x.id=i.issuer_id),
   'taker',(select to_jsonb(x)-'created_at' from nfse_takers x where x.id=i.taker_id),
   'service',(select to_jsonb(x)-'created_at' from nfse_service_profiles x where x.id=i.service_profile_id),
   'invoice',jsonb_build_object('competence',i.competence,'amount',i.amount,'description',i.description,'environment',i.environment,'series',s,'number',v,'unconditionalDiscount',i.unconditional_discount,'conditionalDiscount',i.conditional_discount,'operation',i.operation,'taxation',i.taxation),
   'authorization',jsonb_build_object('representationId',i.representation_id,'requestedBy',i.requested_by)
  ) where i.id=n.id;
 if n.representation_id is not null then
  insert into nfse_representation_audit(office_id,representation_id,issuer_id,actor_id,action,metadata)
  values(n.office_id,n.representation_id,n.issuer_id,auth.uid(),'issuance_requested',jsonb_build_object('invoiceId',n.id));
 end if;
 insert into nfse_jobs(office_id,invoice_id,kind) values(n.office_id,n.id,'issue') returning * into j;
 return j;
end $$;
revoke all on function enqueue_nfse_issue(uuid) from public,anon;
grant execute on function enqueue_nfse_issue(uuid) to authenticated;

create or replace function nfse_worker_load_job(p_job uuid,p_worker text,p_fence bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j nfse_jobs; n nfse_invoices; cert nfse_certificates;
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 select * into j from nfse_jobs where id=p_job and status='claimed' and claimed_by=p_worker
   and fence_token=p_fence and lease_until>now();
 if j.id is null then raise exception 'stale_worker_fence' using errcode='40001'; end if;
 select i.* into n from nfse_invoices i where i.id=j.invoice_id;
 if n.id is null then return null; end if;
 if j.kind='issue' and not exists(
   select 1 from profiles p join office_modules m on m.office_id=p.office_id and m.module='nfse' and m.status='active'
   where p.id=n.created_by and p.office_id=n.office_id and p.role in ('admin','operator','client')
    and ((p.role='client' and exists(select 1 from helians_accounts h where h.auth_user_id=p.id and h.issuer_id=n.issuer_id and h.status='active'))
      or (p.role<>'client' and (not exists(select 1 from nfse_profile_issuer_access a where a.profile_id=p.id)
       or exists(select 1 from nfse_profile_issuer_access a where a.profile_id=p.id and a.issuer_id=n.issuer_id and a.allowed))))
 ) then return null; end if;
 if j.kind='reconcile' and n.status not in ('unknown','reconciling','persistence_pending') then return null; end if;
 select c.* into cert from nfse_certificates c where c.id=active_nfse_certificate(n);
 if cert.id is null then return null; end if;
 return to_jsonb(n)||jsonb_build_object(
  'custody_reference',cert.custody_reference,
  'custody_aad_issuer_id',cert.issuer_id,
  'signing_certificate_id',cert.id
 );
end $$;
revoke all on function nfse_worker_load_job(uuid,text,bigint) from public,anon,authenticated;
grant execute on function nfse_worker_load_job(uuid,text,bigint) to service_role;

comment on function nfse_worker_load_job(uuid,text,bigint) is 'Returns a fenced fiscal snapshot and either the issuer certificate or an explicitly authorized representative certificate.';

create or replace function verify_nfse_representation_from_attempt() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare inv nfse_invoices;
begin
 if new.classification not in ('authorized','simulated_authorized') then return new; end if;
 select * into inv from nfse_invoices where id=new.invoice_id;
 if inv.representation_id is null then return new; end if;
 update nfse_representations set government_verified_at=case when new.classification='authorized' then now() else government_verified_at end,
  last_verification_error=null,updated_at=now() where id=inv.representation_id;
 if new.classification='authorized' and not exists(
  select 1 from nfse_representation_audit where representation_id=inv.representation_id and action='government_verified'
 ) then
  insert into nfse_representation_audit(office_id,representation_id,issuer_id,actor_id,action,metadata)
  values(inv.office_id,inv.representation_id,inv.issuer_id,inv.created_by,'government_verified',jsonb_build_object('invoiceId',inv.id));
 end if;
 return new;
end $$;

drop trigger if exists verify_nfse_representation_after_attempt on nfse_attempts;
create trigger verify_nfse_representation_after_attempt after insert on nfse_attempts
for each row execute function verify_nfse_representation_from_attempt();
