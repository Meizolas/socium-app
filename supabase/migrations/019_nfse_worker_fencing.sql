alter table nfse_jobs
  add column fence_token bigint not null default 0,
  add column post_started_at timestamptz,
  add column completed_at timestamptz;

-- An expired lease after the POST boundary is never eligible for another POST.
-- It becomes unknown and is reconciled with the same DPS identifier.
create or replace function claim_nfse_jobs(worker text,batch int default 10) returns setof nfse_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update nfse_invoices i set status='unknown'
 from nfse_jobs j where j.invoice_id=i.id and j.kind='issue' and j.status='claimed'
   and j.lease_until<now() and j.post_started_at is not null and i.status in ('signing','transmitting','queued');
 update nfse_jobs set status='done',completed_at=now(),lease_until=null
 where kind='issue' and status='claimed' and lease_until<now() and post_started_at is not null;
 insert into nfse_jobs(office_id,invoice_id,kind,status,available_at)
 select i.office_id,i.id,'reconcile','queued',now() from nfse_invoices i
 where i.status='unknown' and i.dps_id is not null
 on conflict(invoice_id,kind) do nothing;
 return query
 update nfse_jobs j set status='claimed',claimed_by=worker,lease_until=now()+interval '60 seconds',attempts=attempts+1,fence_token=fence_token+1
 where j.id in(
   select id from nfse_jobs where (status='queued' and available_at<=now())
      or (status='claimed' and lease_until<now() and post_started_at is null)
   order by available_at,created_at for update skip locked limit least(greatest(batch,1),50)
 ) returning j.*;
end $$;
revoke all on function claim_nfse_jobs(text,int) from public,anon,authenticated;
grant execute on function claim_nfse_jobs(text,int) to service_role;

create or replace function mark_nfse_post_started(p_job uuid,p_worker text,p_fence bigint,p_request_hash text,p_storage_path text,p_size bigint)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare j nfse_jobs;
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 select * into j from nfse_jobs where id=p_job and status='claimed' and claimed_by=p_worker and fence_token=p_fence and lease_until>now() for update;
 if j.id is null then raise exception 'stale_worker_fence' using errcode='40001'; end if;
 insert into nfse_files(office_id,invoice_id,kind,storage_path,sha256,size_bytes) values(j.office_id,j.invoice_id,'signed_dps',p_storage_path,p_request_hash,p_size);
 insert into nfse_attempts(office_id,invoice_id,job_id,classification,request_hash,safe_details) values(j.office_id,j.invoice_id,j.id,'post_started',p_request_hash,jsonb_build_object('fence',p_fence));
 update nfse_jobs set post_started_at=now() where id=j.id;
 update nfse_invoices set status='transmitting' where id=j.invoice_id;
end $$;
revoke all on function mark_nfse_post_started(uuid,text,bigint,text,text,bigint) from public,anon,authenticated;
grant execute on function mark_nfse_post_started(uuid,text,bigint,text,text,bigint) to service_role;

create or replace function enqueue_nfse_issue(p_invoice uuid) returns nfse_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
declare n nfse_invoices; s text; v bigint; j nfse_jobs;
begin
 select * into n from nfse_invoices where id=p_invoice for update;
 if n.id is null or not has_module('nfse') or not is_nfse_operator() or not can_access_nfse_issuer(n.issuer_id) then raise exception 'invoice_not_found' using errcode='42501'; end if;
 if n.status='queued' then select * into j from nfse_jobs where invoice_id=n.id and kind='issue'; return j; end if;
 if n.status<>'draft' then raise exception 'invoice_not_issuable'; end if;
 if not exists(select 1 from nfse_certificates c where c.issuer_id=n.issuer_id and c.office_id=n.office_id and c.status='active' and c.not_before<=now() and c.not_after>now()) then raise exception 'active_certificate_required'; end if;
 select dps_series into s from nfse_issuers where id=n.issuer_id and office_id=n.office_id and enabled;
 if s is null then raise exception 'issuer_not_ready'; end if;
 insert into nfse_sequences(office_id,issuer_id,environment,series,next_number) values(n.office_id,n.issuer_id,2,s,2)
 on conflict(issuer_id,environment,series) do update set next_number=nfse_sequences.next_number+1 returning next_number-1 into v;
 update nfse_invoices i set series=s,dps_number=v,dps_id='DPS'||(select municipality_ibge from nfse_issuers where id=i.issuer_id)||'2'||(select tax_id from nfse_issuers where id=i.issuer_id)||lpad(s,5,'0')||lpad(v::text,15,'0'),status='queued',snapshot=jsonb_build_object(
  'version','national-dps-1.01','issuer',(select to_jsonb(x)-'created_at' from nfse_issuers x where x.id=i.issuer_id),
  'taker',(select to_jsonb(x)-'created_at' from nfse_takers x where x.id=i.taker_id),
  'service',(select to_jsonb(x)-'created_at' from nfse_service_profiles x where x.id=i.service_profile_id),
  'invoice',jsonb_build_object('competence',i.competence,'amount',i.amount,'description',i.description,'environment',i.environment,'series',s,'number',v,'unconditionalDiscount',i.unconditional_discount,'conditionalDiscount',i.conditional_discount,'operation',i.operation,'taxation',i.taxation)
 ) where i.id=n.id;
 insert into nfse_jobs(office_id,invoice_id,kind) values(n.office_id,n.id,'issue') returning * into j;
 return j;
end $$;
revoke all on function enqueue_nfse_issue(uuid) from public,anon;
grant execute on function enqueue_nfse_issue(uuid) to authenticated;
