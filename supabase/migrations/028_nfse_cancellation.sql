-- Fiscal cancellation event (101101) for an authorized national NFS-e.

alter table nfse_invoices add column if not exists cancellation_status text
 check(cancellation_status in ('queued','processing','authorized','rejected','technical_failure','unknown'));
alter table nfse_invoices add column if not exists cancelled_at timestamptz;
alter table nfse_invoices add column if not exists cancellation_reason_code text;
alter table nfse_invoices add column if not exists cancellation_reason text;

alter table nfse_invoices drop constraint if exists nfse_invoices_status_check;
alter table nfse_invoices add constraint nfse_invoices_status_check check(status in
 ('draft','queued','signing','transmitting','unknown','reconciling','authorized','cancelled','rejected','technical_failure','persistence_pending'));
alter table nfse_jobs drop constraint if exists nfse_jobs_kind_check;
alter table nfse_jobs add constraint nfse_jobs_kind_check check(kind in ('issue','consult','reconcile','cancel'));
alter table nfse_files drop constraint if exists nfse_files_kind_check;
alter table nfse_files add constraint nfse_files_kind_check check(kind in
 ('signed_dps','official_xml','simulated_xml','official_pdf','simulated_pdf','raw_response','signed_event','official_event'));

create table nfse_cancellations(
 id uuid primary key default gen_random_uuid(),
 office_id uuid not null references offices on delete cascade,
 invoice_id uuid not null unique references nfse_invoices on delete cascade,
 reason_code text not null check(reason_code in ('1','2','9')),
 reason text not null check(char_length(reason) between 15 and 255),
 status text not null default 'queued' check(status in ('queued','processing','authorized','rejected','technical_failure','unknown')),
 requested_by uuid not null references profiles,
 request_hash text,response_hash text,http_status int,safe_details jsonb not null default '{}',
 official_event_path text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),authorized_at timestamptz
);
alter table nfse_cancellations enable row level security;
create policy nfse_cancellations_office on nfse_cancellations for select to authenticated
 using(office_id=current_office() and has_module('nfse'));

-- Existing active office representations gain the same cancellation capability
-- exposed by the new representation flow. Government authorization is still verified by SEFIN.
update nfse_representations set allow_cancellation=true,updated_at=now()
 where status='active' and allow_office_issuance and not allow_cancellation;

create or replace function active_nfse_cancellation_certificate(p_invoice nfse_invoices)
returns uuid language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(
  (select c.id from nfse_certificates c where c.issuer_id=p_invoice.issuer_id and c.office_id=p_invoice.office_id
   and c.status='active' and c.not_before<=now() and c.not_after>now() order by c.created_at desc limit 1),
  (select c.id from nfse_representations r join nfse_certificates c on c.id=r.certificate_id
   where r.id=p_invoice.representation_id and r.issuer_id=p_invoice.issuer_id and r.office_id=p_invoice.office_id
    and r.status='active' and r.allow_cancellation and r.valid_from<=now() and (r.valid_until is null or r.valid_until>now())
    and c.status='active' and c.not_before<=now() and c.not_after>now() limit 1)
 )
$$;
revoke all on function active_nfse_cancellation_certificate(nfse_invoices) from public,anon,authenticated;
grant execute on function active_nfse_cancellation_certificate(nfse_invoices) to service_role;

create or replace function enqueue_nfse_cancellation(p_invoice uuid,p_reason_code text,p_reason text) returns nfse_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
declare n nfse_invoices; j nfse_jobs; c nfse_cancellations;
begin
 select * into n from nfse_invoices where id=p_invoice for update;
 if n.id is null or not has_module('nfse') or not is_nfse_operator() or not can_access_nfse_issuer(n.issuer_id)
  then raise exception 'invoice_not_found' using errcode='42501'; end if;
 if n.status='cancelled' or n.cancellation_status='authorized' then raise exception 'invoice_already_cancelled'; end if;
 if n.status<>'authorized' or n.official_key is null or n.official_key!~'^[0-9]{50}$' then raise exception 'invoice_not_cancellable'; end if;
 if p_reason_code not in ('1','2','9') or char_length(trim(coalesce(p_reason,''))) not between 15 and 255 then raise exception 'invalid_cancellation_reason'; end if;
 if active_nfse_cancellation_certificate(n) is null then raise exception 'cancellation_authorization_required'; end if;
 select * into c from nfse_cancellations where invoice_id=n.id;
 if c.id is not null and c.status in ('queued','processing') then select * into j from nfse_jobs where invoice_id=n.id and kind='cancel'; return j; end if;
 insert into nfse_cancellations(office_id,invoice_id,reason_code,reason,requested_by)
 values(n.office_id,n.id,p_reason_code,trim(p_reason),auth.uid())
 on conflict(invoice_id) do update set reason_code=excluded.reason_code,reason=excluded.reason,status='queued',requested_by=excluded.requested_by,updated_at=now(),request_hash=null,response_hash=null,http_status=null,safe_details='{}',official_event_path=null
 returning * into c;
 update nfse_invoices set cancellation_status='queued',cancellation_reason_code=p_reason_code,cancellation_reason=trim(p_reason) where id=n.id;
 insert into nfse_jobs(office_id,invoice_id,kind,status,available_at,claimed_by,lease_until,post_started_at,completed_at)
 values(n.office_id,n.id,'cancel','queued',now(),null,null,null,null)
 on conflict(invoice_id,kind) do update set status='queued',available_at=now(),claimed_by=null,lease_until=null,post_started_at=null,completed_at=null
 returning * into j;
 return j;
end $$;
revoke all on function enqueue_nfse_cancellation(uuid,text,text) from public,anon;
grant execute on function enqueue_nfse_cancellation(uuid,text,text) to authenticated;

create or replace function mark_nfse_cancellation_post_started(p_job uuid,p_worker text,p_fence bigint,p_request_hash text,p_storage_path text,p_size bigint)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare j nfse_jobs;
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 select * into j from nfse_jobs where id=p_job and kind='cancel' and status='claimed' and claimed_by=p_worker and fence_token=p_fence and lease_until>now() for update;
 if j.id is null then raise exception 'stale_worker_fence' using errcode='40001'; end if;
 insert into nfse_files(office_id,invoice_id,kind,storage_path,sha256,size_bytes) values(j.office_id,j.invoice_id,'signed_event',p_storage_path,p_request_hash,p_size);
 update nfse_jobs set post_started_at=now() where id=j.id;
 update nfse_cancellations set status='processing',request_hash=p_request_hash,updated_at=now() where invoice_id=j.invoice_id;
 update nfse_invoices set cancellation_status='processing' where id=j.invoice_id;
end $$;
revoke all on function mark_nfse_cancellation_post_started(uuid,text,bigint,text,text,bigint) from public,anon,authenticated;
grant execute on function mark_nfse_cancellation_post_started(uuid,text,bigint,text,text,bigint) to service_role;

create or replace function nfse_worker_finish_cancellation(p_job uuid,p_worker text,p_fence bigint,p_result text,p_response_hash text,p_http_status int,p_safe_details jsonb,p_event_path text,p_event_hash text,p_event_size bigint)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare j nfse_jobs;
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 select * into j from nfse_jobs where id=p_job and kind='cancel' and status='claimed' and claimed_by=p_worker and fence_token=p_fence for update;
 if j.id is null then raise exception 'stale_worker_fence' using errcode='40001'; end if;
 if p_event_path is not null then insert into nfse_files(office_id,invoice_id,kind,storage_path,sha256,size_bytes) values(j.office_id,j.invoice_id,'official_event',p_event_path,p_event_hash,p_event_size); end if;
 update nfse_cancellations set status=p_result,response_hash=p_response_hash,http_status=p_http_status,safe_details=coalesce(p_safe_details,'{}'),official_event_path=p_event_path,updated_at=now(),authorized_at=case when p_result='authorized' then now() else authorized_at end where invoice_id=j.invoice_id;
 update nfse_invoices set cancellation_status=p_result,status=case when p_result='authorized' then 'cancelled' else status end,cancelled_at=case when p_result='authorized' then now() else cancelled_at end where id=j.invoice_id;
 update nfse_jobs set status='done',lease_until=null,completed_at=now() where id=j.id;
end $$;
revoke all on function nfse_worker_finish_cancellation(uuid,text,bigint,text,text,int,jsonb,text,text,bigint) from public,anon,authenticated;
grant execute on function nfse_worker_finish_cancellation(uuid,text,bigint,text,text,int,jsonb,text,text,bigint) to service_role;

-- A cancelled event is never blindly retransmitted after the government POST boundary.
create or replace function claim_nfse_jobs(worker text,batch int default 10) returns setof nfse_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update nfse_invoices i set status='unknown' from nfse_jobs j where j.invoice_id=i.id and j.kind='issue' and j.status='claimed' and j.lease_until<now() and j.post_started_at is not null and i.status in ('signing','transmitting','queued');
 update nfse_jobs set status='done',completed_at=now(),lease_until=null where kind='issue' and status='claimed' and lease_until<now() and post_started_at is not null;
 insert into nfse_jobs(office_id,invoice_id,kind,status,available_at) select i.office_id,i.id,'reconcile','queued',now() from nfse_invoices i where i.status='unknown' and i.dps_id is not null on conflict(invoice_id,kind) do nothing;
 update nfse_cancellations c set status='unknown',updated_at=now() from nfse_jobs j where j.invoice_id=c.invoice_id and j.kind='cancel' and j.status='claimed' and j.lease_until<now() and j.post_started_at is not null;
 update nfse_invoices i set cancellation_status='unknown' from nfse_jobs j where j.invoice_id=i.id and j.kind='cancel' and j.status='claimed' and j.lease_until<now() and j.post_started_at is not null;
 update nfse_jobs set status='done',completed_at=now(),lease_until=null where kind='cancel' and status='claimed' and lease_until<now() and post_started_at is not null;
 return query update nfse_jobs j set status='claimed',claimed_by=worker,lease_until=now()+interval '60 seconds',attempts=attempts+1,fence_token=fence_token+1 where j.id in(select id from nfse_jobs where (status='queued' and available_at<=now()) or (status='claimed' and lease_until<now() and post_started_at is null) order by available_at,created_at for update skip locked limit least(greatest(batch,1),50)) returning j.*;
end $$;
revoke all on function claim_nfse_jobs(text,int) from public,anon,authenticated;
grant execute on function claim_nfse_jobs(text,int) to service_role;

create or replace function nfse_worker_load_job(p_job uuid,p_worker text,p_fence bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j nfse_jobs; n nfse_invoices; cert nfse_certificates; cancellation nfse_cancellations;
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 select * into j from nfse_jobs where id=p_job and status='claimed' and claimed_by=p_worker and fence_token=p_fence and lease_until>now();
 if j.id is null then raise exception 'stale_worker_fence' using errcode='40001'; end if;
 select * into n from nfse_invoices where id=j.invoice_id; if n.id is null then return null; end if;
 if j.kind in ('issue','cancel') and not exists(
  select 1 from profiles p join office_modules m on m.office_id=p.office_id and m.module='nfse' and m.status='active'
  where p.id=n.created_by and p.office_id=n.office_id and p.role in ('admin','operator','client')
   and ((p.role='client' and exists(select 1 from helians_accounts h where h.auth_user_id=p.id and h.issuer_id=n.issuer_id and h.status='active'))
    or (p.role<>'client' and (not exists(select 1 from nfse_profile_issuer_access a where a.profile_id=p.id)
     or exists(select 1 from nfse_profile_issuer_access a where a.profile_id=p.id and a.issuer_id=n.issuer_id and a.allowed))))
 ) then return null; end if;
 if j.kind='reconcile' and n.status not in ('unknown','reconciling','persistence_pending') then return null; end if;
 if j.kind='cancel' then
  select * into cancellation from nfse_cancellations where invoice_id=n.id and status in ('queued','processing'); if cancellation.id is null or n.status<>'authorized' then return null; end if;
  select * into cert from nfse_certificates where id=active_nfse_cancellation_certificate(n);
 else select * into cert from nfse_certificates where id=active_nfse_certificate(n); end if;
 if cert.id is null then return null; end if;
 return to_jsonb(n)||jsonb_build_object('custody_reference',cert.custody_reference,'custody_aad_issuer_id',cert.issuer_id,'signing_certificate_id',cert.id,'signing_subject_tax_id',cert.subject_tax_id,'cancellation',case when cancellation.id is null then null else to_jsonb(cancellation) end);
end $$;
revoke all on function nfse_worker_load_job(uuid,text,bigint) from public,anon,authenticated;
grant execute on function nfse_worker_load_job(uuid,text,bigint) to service_role;

