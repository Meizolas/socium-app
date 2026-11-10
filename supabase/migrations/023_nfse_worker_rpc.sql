-- Private HTTPS boundary for workers that cannot join the database network.
-- All functions are service_role-only and keep claiming/fencing in Postgres.

create or replace function nfse_worker_health() returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 return true;
end $$;
revoke all on function nfse_worker_health() from public,anon,authenticated;
grant execute on function nfse_worker_health() to service_role;

create or replace function nfse_worker_claim_jobs(p_worker text,p_batch int default 10)
returns setof nfse_jobs
language sql security definer set search_path=public,pg_temp as $$
 select * from claim_nfse_jobs(p_worker,least(greatest(p_batch,1),50));
$$;
revoke all on function nfse_worker_claim_jobs(text,int) from public,anon,authenticated;
grant execute on function nfse_worker_claim_jobs(text,int) to service_role;

create or replace function nfse_worker_load_job(p_job uuid,p_worker text,p_fence bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j nfse_jobs; n nfse_invoices; custody text;
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 select * into j from nfse_jobs where id=p_job and status='claimed' and claimed_by=p_worker
   and fence_token=p_fence and lease_until>now();
 if j.id is null then raise exception 'stale_worker_fence' using errcode='40001'; end if;
 select i.* into n from nfse_invoices i where i.id=j.invoice_id;
 if n.id is null then return null; end if;
 if j.kind='issue' and not exists(
   select 1 from profiles p join office_modules m on m.office_id=p.office_id and m.module='nfse' and m.status='active'
   where p.id=n.created_by and p.office_id=n.office_id and p.role in ('admin','operator')
     and (not exists(select 1 from nfse_profile_issuer_access r where r.profile_id=p.id)
       or exists(select 1 from nfse_profile_issuer_access r where r.profile_id=p.id and r.issuer_id=n.issuer_id and r.allowed))
 ) then return null; end if;
 if j.kind='reconcile' and n.status not in ('unknown','reconciling','persistence_pending') then return null; end if;
 select c.custody_reference into custody from nfse_certificates c
  where c.issuer_id=n.issuer_id and c.office_id=n.office_id and c.status='active'
    and c.not_before<=now() and c.not_after>now() order by c.created_at desc limit 1;
 if custody is null then return null; end if;
 return to_jsonb(n)||jsonb_build_object('custody_reference',custody);
end $$;
revoke all on function nfse_worker_load_job(uuid,text,bigint) from public,anon,authenticated;
grant execute on function nfse_worker_load_job(uuid,text,bigint) to service_role;

create or replace function nfse_worker_finish_job(
 p_job uuid,p_worker text,p_fence bigint,p_result text,p_response_hash text,p_http_status int,
 p_safe_details jsonb,p_official_key text,
 p_xml_path text,p_xml_hash text,p_xml_size bigint,
 p_pdf_path text,p_pdf_hash text,p_pdf_size bigint
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare j nfse_jobs;
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 select * into j from nfse_jobs where id=p_job and status='claimed' and claimed_by=p_worker
   and fence_token=p_fence for update;
 if j.id is null then raise exception 'stale_worker_fence' using errcode='40001'; end if;
 insert into nfse_attempts(office_id,invoice_id,job_id,classification,response_hash,http_status,safe_details)
 values(j.office_id,j.invoice_id,j.id,p_result,p_response_hash,p_http_status,coalesce(p_safe_details,'{}'::jsonb));
 if p_xml_path is not null then
  insert into nfse_files(office_id,invoice_id,kind,storage_path,sha256,size_bytes)
  values(j.office_id,j.invoice_id,'official_xml',p_xml_path,p_xml_hash,p_xml_size);
 end if;
 if p_pdf_path is not null then
  insert into nfse_files(office_id,invoice_id,kind,storage_path,sha256,size_bytes)
  values(j.office_id,j.invoice_id,'official_pdf',p_pdf_path,p_pdf_hash,p_pdf_size);
 end if;
 update nfse_invoices set status=case when p_result='cancelled' then 'technical_failure' else p_result end,
  official_key=coalesce(p_official_key,official_key) where id=j.invoice_id;
 if j.kind='issue' and p_result in ('unknown','reconciling') then
  update nfse_jobs set status='done',lease_until=null,completed_at=now() where id=j.id;
  insert into nfse_jobs(office_id,invoice_id,kind,status,available_at)
  values(j.office_id,j.invoice_id,'reconcile','queued',now()+interval '30 seconds')
  on conflict(invoice_id,kind) do update set status='queued',available_at=excluded.available_at,
   claimed_by=null,lease_until=null,post_started_at=null,completed_at=null;
 else
  update nfse_jobs set status=case when p_result='reconciling' then 'queued' else 'done' end,
   available_at=case when p_result='reconciling' then now()+interval '30 seconds' else available_at end,
   lease_until=null,completed_at=case when p_result='reconciling' then null else now() end
  where id=j.id;
 end if;
end $$;
revoke all on function nfse_worker_finish_job(uuid,text,bigint,text,text,int,jsonb,text,text,text,bigint,text,text,bigint) from public,anon,authenticated;
grant execute on function nfse_worker_finish_job(uuid,text,bigint,text,text,int,jsonb,text,text,text,bigint,text,text,bigint) to service_role;

comment on function nfse_worker_load_job(uuid,text,bigint) is 'Fenced service-role boundary for an HTTPS worker; returns only an already claimed fiscal snapshot and custody reference.';
comment on function nfse_worker_claim_jobs(text,int) is 'Unambiguous service-role RPC facade for the fenced queue claim operation.';
