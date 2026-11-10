-- The national DPS identifier uses the federal registration type, not tpAmb.
-- The currently supported issuer scenario is CNPJ, whose registration type is 2.
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
 insert into nfse_sequences(office_id,issuer_id,environment,series,next_number) values(n.office_id,n.issuer_id,n.environment,s,2)
 on conflict(issuer_id,environment,series) do update set next_number=nfse_sequences.next_number+1 returning next_number-1 into v;
 update nfse_invoices i set series=s,dps_number=v,
  dps_id='DPS'||(select municipality_ibge from nfse_issuers where id=i.issuer_id)||'2'||(select tax_id from nfse_issuers where id=i.issuer_id)||lpad(s,5,'0')||lpad(v::text,15,'0'),
  status='queued',snapshot=jsonb_build_object(
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

comment on function enqueue_nfse_issue(uuid) is 'Queues a DPS whose Id uses federal registration type 2 for the supported CNPJ issuer scenario.';
