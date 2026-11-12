-- NFS-e substitution through a new DPS referencing an authorized NFS-e.

alter table nfse_invoices add column if not exists substitutes_invoice_id uuid references nfse_invoices(id);
alter table nfse_invoices add column if not exists substituted_by_invoice_id uuid references nfse_invoices(id);
alter table nfse_invoices add column if not exists substitution_reason_code text
 check(substitution_reason_code in ('01','02','03','04','05','99'));
alter table nfse_invoices add column if not exists substitution_reason text;
alter table nfse_invoices add column if not exists substituted_at timestamptz;

create index if not exists nfse_invoices_substitutes_idx on nfse_invoices(substitutes_invoice_id);
create unique index if not exists nfse_one_active_substitution_per_invoice
 on nfse_invoices(substitutes_invoice_id)
 where substitutes_invoice_id is not null and status in
 ('draft','queued','signing','transmitting','unknown','reconciling','authorized','persistence_pending');

create or replace function enqueue_nfse_issue(p_invoice uuid) returns nfse_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
declare n nfse_invoices; original nfse_invoices; s text; v bigint; j nfse_jobs; substitution jsonb;
begin
 select * into n from nfse_invoices where id=p_invoice for update;
 if n.id is null or not has_module('nfse') or not is_nfse_operator() or not can_access_nfse_issuer(n.issuer_id) then raise exception 'invoice_not_found' using errcode='42501'; end if;
 if n.status='queued' then select * into j from nfse_jobs where invoice_id=n.id and kind='issue'; return j; end if;
 if n.status<>'draft' then raise exception 'invoice_not_issuable'; end if;
 if active_nfse_certificate(n) is null then raise exception 'active_certificate_or_representation_required'; end if;
 if n.substitutes_invoice_id is not null then
  select * into original from nfse_invoices where id=n.substitutes_invoice_id for update;
  if original.id is null or original.office_id<>n.office_id or original.issuer_id<>n.issuer_id
   or original.environment<>n.environment or original.status<>'authorized'
   or original.official_key is null or original.official_key!~'^[0-9]{50}$'
   or original.substituted_by_invoice_id is not null then raise exception 'invoice_not_substitutable'; end if;
  if n.substitution_reason_code not in ('01','02','03','04','05','99')
   or char_length(trim(coalesce(n.substitution_reason,''))) not between 15 and 255 then raise exception 'invalid_substitution_reason'; end if;
  if exists(select 1 from nfse_invoices x where x.substitutes_invoice_id=original.id and x.id<>n.id
   and x.status in ('draft','queued','signing','transmitting','unknown','reconciling','authorized','persistence_pending'))
   then raise exception 'substitution_already_in_progress'; end if;
  substitution:=jsonb_build_object('invoiceId',original.id,'accessKey',original.official_key,
   'reasonCode',n.substitution_reason_code,'reason',trim(n.substitution_reason));
 end if;
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
   'authorization',jsonb_build_object('representationId',i.representation_id,'requestedBy',i.requested_by),
   'substitution',substitution
  ) where i.id=n.id;
 if n.representation_id is not null then
  insert into nfse_representation_audit(office_id,representation_id,issuer_id,actor_id,action,metadata)
  values(n.office_id,n.representation_id,n.issuer_id,auth.uid(),'issuance_requested',jsonb_build_object('invoiceId',n.id,'substitutesInvoiceId',n.substitutes_invoice_id));
 end if;
 insert into nfse_jobs(office_id,invoice_id,kind) values(n.office_id,n.id,'issue') returning * into j;
 return j;
end $$;
revoke all on function enqueue_nfse_issue(uuid) from public,anon;
grant execute on function enqueue_nfse_issue(uuid) to authenticated;

create or replace function nfse_worker_finish_job(
 p_job uuid,p_worker text,p_fence bigint,p_result text,p_response_hash text,p_http_status int,
 p_safe_details jsonb,p_official_key text,
 p_xml_path text,p_xml_hash text,p_xml_size bigint,
 p_pdf_path text,p_pdf_hash text,p_pdf_size bigint
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare j nfse_jobs; replacement nfse_invoices;
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 select * into j from nfse_jobs where id=p_job and status='claimed' and claimed_by=p_worker and fence_token=p_fence for update;
 if j.id is null then raise exception 'stale_worker_fence' using errcode='40001'; end if;
 insert into nfse_attempts(office_id,invoice_id,job_id,classification,response_hash,http_status,safe_details)
 values(j.office_id,j.invoice_id,j.id,p_result,p_response_hash,p_http_status,coalesce(p_safe_details,'{}'::jsonb));
 if p_xml_path is not null then insert into nfse_files(office_id,invoice_id,kind,storage_path,sha256,size_bytes) values(j.office_id,j.invoice_id,'official_xml',p_xml_path,p_xml_hash,p_xml_size); end if;
 if p_pdf_path is not null then insert into nfse_files(office_id,invoice_id,kind,storage_path,sha256,size_bytes) values(j.office_id,j.invoice_id,'official_pdf',p_pdf_path,p_pdf_hash,p_pdf_size); end if;
 update nfse_invoices set status=case when p_result='cancelled' then 'technical_failure' else p_result end,
  official_key=coalesce(p_official_key,official_key) where id=j.invoice_id returning * into replacement;
 if p_result='authorized' and replacement.substitutes_invoice_id is not null then
  update nfse_invoices set status='cancelled',cancelled_at=now(),substituted_at=now(),substituted_by_invoice_id=replacement.id
   where id=replacement.substitutes_invoice_id and status='authorized' and office_id=replacement.office_id and issuer_id=replacement.issuer_id;
  if not found then raise exception 'substitution_source_state_changed' using errcode='40001'; end if;
 end if;
 if j.kind='issue' and p_result in ('unknown','reconciling') then
  update nfse_jobs set status='done',lease_until=null,completed_at=now() where id=j.id;
  insert into nfse_jobs(office_id,invoice_id,kind,status,available_at) values(j.office_id,j.invoice_id,'reconcile','queued',now()+interval '30 seconds')
  on conflict(invoice_id,kind) do update set status='queued',available_at=excluded.available_at,claimed_by=null,lease_until=null,post_started_at=null,completed_at=null;
 else
  update nfse_jobs set status=case when p_result='reconciling' then 'queued' else 'done' end,
   available_at=case when p_result='reconciling' then now()+interval '30 seconds' else available_at end,
   lease_until=null,completed_at=case when p_result='reconciling' then null else now() end where id=j.id;
 end if;
end $$;
revoke all on function nfse_worker_finish_job(uuid,text,bigint,text,text,int,jsonb,text,text,text,bigint,text,text,bigint) from public,anon,authenticated;
grant execute on function nfse_worker_finish_job(uuid,text,bigint,text,text,int,jsonb,text,text,text,bigint,text,text,bigint) to service_role;
