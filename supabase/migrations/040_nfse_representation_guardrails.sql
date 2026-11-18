-- A representation declared inside Helians is not proof that Receita Federal
-- has granted access.  A definitive E0718 response must quarantine the grant
-- so the same certificate is not submitted repeatedly for the same issuer.

create or replace function verify_nfse_representation_from_attempt() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 inv nfse_invoices;
 error_0718 boolean:=false;
begin
 select * into inv from nfse_invoices where id=new.invoice_id;
 if inv.id is null or inv.representation_id is null then return new; end if;

 select exists(
  select 1
  from jsonb_array_elements(
   case
    when jsonb_typeof(new.safe_details->'erros')='array' then new.safe_details->'erros'
    when jsonb_typeof(new.safe_details->'errors')='array' then new.safe_details->'errors'
    else '[]'::jsonb
   end
  ) error
  where upper(coalesce(error->>'Codigo',error->>'codigo',error->>'Code',error->>'code',''))='E0718'
 ) into error_0718;

 if error_0718 then
  update nfse_representations set
   status='verification_failed',
   last_verification_error='E0718 - A Receita Federal não encontrou procuração eletrônica ou representação legal vigente para o titular do certificado.',
   updated_at=now()
  where id=inv.representation_id and status in ('pending','active','suspended');
  if found then
   insert into nfse_representation_audit(
    office_id,representation_id,issuer_id,actor_id,action,metadata
   ) values(
    inv.office_id,inv.representation_id,inv.issuer_id,inv.created_by,'verification_failed',
    jsonb_build_object('invoiceId',inv.id,'attemptId',new.id,'code','E0718')
   );
  end if;
  return new;
 end if;

 if new.classification not in ('authorized','simulated_authorized') then return new; end if;
 update nfse_representations set
  government_verified_at=case when new.classification='authorized' then now() else government_verified_at end,
  last_verification_error=null,
  status=case when new.classification='authorized' then 'active' else status end,
  updated_at=now()
 where id=inv.representation_id;
 if new.classification='authorized' and not exists(
  select 1 from nfse_representation_audit
  where representation_id=inv.representation_id and action='government_verified'
 ) then
  insert into nfse_representation_audit(office_id,representation_id,issuer_id,actor_id,action,metadata)
  values(inv.office_id,inv.representation_id,inv.issuer_id,inv.created_by,'government_verified',jsonb_build_object('invoiceId',inv.id));
 end if;
 return new;
end $$;

-- Quarantine representations for E0718 attempts that predate this trigger.
update nfse_representations representation set
 status='verification_failed',
 last_verification_error='E0718 - A Receita Federal não encontrou procuração eletrônica ou representação legal vigente para o titular do certificado.',
 updated_at=now()
where representation.status='active' and exists(
 select 1
 from nfse_invoices invoice
 join nfse_attempts attempt on attempt.invoice_id=invoice.id
 cross join lateral jsonb_array_elements(
  case
   when jsonb_typeof(attempt.safe_details->'erros')='array' then attempt.safe_details->'erros'
   when jsonb_typeof(attempt.safe_details->'errors')='array' then attempt.safe_details->'errors'
   else '[]'::jsonb
  end
 ) error
 where invoice.representation_id=representation.id
  and upper(coalesce(error->>'Codigo',error->>'codigo',error->>'Code',error->>'code',''))='E0718'
);

comment on function verify_nfse_representation_from_attempt() is
 'Verifies successful represented emissions and quarantines a representation after definitive SEFIN E0718 rejection.';
