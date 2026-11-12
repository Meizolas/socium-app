-- Keeps cancellation failures auditable without leaving an authorized invoice
-- visually stuck in a cancellation state.

alter table nfse_invoices add column if not exists cancellation_error text;

-- Repairs jobs consumed by a worker deployed before cancellation support.
update nfse_cancellations c set status='technical_failure',updated_at=now(),
 safe_details=c.safe_details||jsonb_build_object('recovery','worker_version_mismatch')
from nfse_jobs j where j.invoice_id=c.invoice_id and j.kind='cancel'
 and j.status in ('done','failed','cancelled') and c.status in ('queued','processing');
update nfse_invoices i set cancellation_status=null,
 status=case when i.status='technical_failure' and i.official_key is not null then 'authorized' else i.status end,
 cancellation_error='O cancelamento não foi processado. A nota permanece autorizada e pode ser tentada novamente.'
from nfse_cancellations c where c.invoice_id=i.id and c.status='technical_failure'
 and i.cancellation_status in ('queued','processing');

drop function if exists nfse_worker_finish_cancellation(uuid,text,bigint,text,text,int,jsonb,text,text,bigint);
create or replace function nfse_worker_finish_cancellation(
 p_job uuid,p_worker text,p_fence bigint,p_result text,p_response_hash text,p_http_status int,
 p_safe_details jsonb,p_error text,p_event_path text,p_event_hash text,p_event_size bigint
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare j nfse_jobs;
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 select * into j from nfse_jobs where id=p_job and kind='cancel' and status='claimed'
  and claimed_by=p_worker and fence_token=p_fence for update;
 if j.id is null then raise exception 'stale_worker_fence' using errcode='40001'; end if;
 if p_event_path is not null then
  insert into nfse_files(office_id,invoice_id,kind,storage_path,sha256,size_bytes)
  values(j.office_id,j.invoice_id,'official_event',p_event_path,p_event_hash,p_event_size);
 end if;
 update nfse_cancellations set status=p_result,response_hash=p_response_hash,http_status=p_http_status,
  safe_details=coalesce(p_safe_details,'{}'),official_event_path=p_event_path,updated_at=now(),
  authorized_at=case when p_result='authorized' then now() else authorized_at end
 where invoice_id=j.invoice_id;
 update nfse_invoices set
  cancellation_status=case when p_result='authorized' then 'authorized' else null end,
  cancellation_error=case when p_result='authorized' then null else coalesce(nullif(trim(p_error),''),'O ambiente nacional não confirmou o cancelamento.') end,
  status=case when p_result='authorized' then 'cancelled' else status end,
  cancelled_at=case when p_result='authorized' then now() else cancelled_at end
 where id=j.invoice_id;
 update nfse_jobs set status='done',lease_until=null,completed_at=now() where id=j.id;
end $$;
revoke all on function nfse_worker_finish_cancellation(uuid,text,bigint,text,text,int,jsonb,text,text,text,bigint) from public,anon,authenticated;
grant execute on function nfse_worker_finish_cancellation(uuid,text,bigint,text,text,int,jsonb,text,text,text,bigint) to service_role;

-- A new attempt clears the previous user-facing failure.
create or replace function clear_nfse_cancellation_error() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.cancellation_status='queued' then new.cancellation_error:=null; end if;
 return new;
end $$;
drop trigger if exists clear_nfse_cancellation_error_on_queue on nfse_invoices;
create trigger clear_nfse_cancellation_error_on_queue before update of cancellation_status on nfse_invoices
for each row execute function clear_nfse_cancellation_error();

