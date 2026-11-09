create or replace function enqueue_nfse_issue(p_invoice uuid) returns nfse_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
declare n nfse_invoices; s text; v bigint; j nfse_jobs;
begin
 select * into n from nfse_invoices where id=p_invoice for update;
 if n.id is null or n.office_id<>current_office() or not has_module('nfse') then raise exception 'invoice_not_found' using errcode='42501'; end if;
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
 if n.id is null or n.office_id<>current_office() or not has_module('nfse') then raise exception 'invoice_not_found' using errcode='42501'; end if;
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

create or replace function claim_nfse_jobs(worker text,batch int default 10) returns setof nfse_jobs
language sql security definer set search_path=public,pg_temp as $$
 update nfse_jobs j set status='claimed',claimed_by=worker,lease_until=now()+interval '60 seconds',attempts=attempts+1
 where j.id in(select id from nfse_jobs where (status='queued' and available_at<=now()) or (status='claimed' and lease_until<now()) order by available_at,created_at for update skip locked limit least(greatest(batch,1),50)) returning j.*
$$;
revoke all on function claim_nfse_jobs(text,int) from public,anon,authenticated;
grant execute on function claim_nfse_jobs(text,int) to service_role;
