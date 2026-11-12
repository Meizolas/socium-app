-- Event 101101 is authored by the NFS-e issuer. SEFIN also requires the
-- signing certificate to have the same CNPJ base as that author (E0812/E0813).

create or replace function active_nfse_cancellation_certificate(p_invoice nfse_invoices)
returns uuid language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(
  (select c.id from nfse_certificates c join nfse_issuers i on i.id=p_invoice.issuer_id
   where c.office_id=p_invoice.office_id
    and c.status='active' and c.not_before<=now() and c.not_after>now()
    and left(regexp_replace(c.subject_tax_id,'[^0-9]','','g'),8)=left(i.tax_id,8)
   order by (c.issuer_id=p_invoice.issuer_id) desc,c.created_at desc limit 1),
  (select c.id from nfse_representations r
   join nfse_certificates c on c.id=r.certificate_id
   join nfse_issuers i on i.id=p_invoice.issuer_id
   where r.id=p_invoice.representation_id and r.issuer_id=p_invoice.issuer_id
    and r.office_id=p_invoice.office_id and r.status='active' and r.allow_cancellation
    and r.valid_from<=now() and (r.valid_until is null or r.valid_until>now())
    and c.status='active' and c.not_before<=now() and c.not_after>now()
    and left(regexp_replace(c.subject_tax_id,'[^0-9]','','g'),8)=left(i.tax_id,8)
   limit 1)
 )
$$;
revoke all on function active_nfse_cancellation_certificate(nfse_invoices) from public,anon,authenticated;
grant execute on function active_nfse_cancellation_certificate(nfse_invoices) to service_role;

comment on function active_nfse_cancellation_certificate(nfse_invoices) is
 'Selects only a certificate whose CNPJ base can legally author cancellation event 101101.';
