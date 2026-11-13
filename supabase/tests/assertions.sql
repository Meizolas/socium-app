do $$begin
 if not exists(select 1 from pg_type where typname='app_module') then raise exception 'app_module ausente';end if;
 if not exists(select 1 from pg_policies where tablename='nfse_invoices') then raise exception 'RLS fiscal ausente';end if;
 if has_function_privilege('authenticated','claim_nfse_jobs(text,integer)','execute') then raise exception 'claim exposto a usuário';end if;
 if not has_function_privilege('service_role','claim_nfse_jobs(text,integer)','execute') then raise exception 'worker sem claim';end if;
 if exists(select 1 from storage.buckets where id in('nfse-custody','nfse-documents') and public) then raise exception 'bucket fiscal público';end if;
 if has_function_privilege('anon','enqueue_nfse_issue(uuid)','execute') then raise exception 'enqueue fiscal exposto a anon';end if;
 if not has_function_privilege('authenticated','enqueue_nfse_issue(uuid)','execute') then raise exception 'enqueue fiscal indisponível ao usuário autenticado';end if;
 if has_function_privilege('anon','enqueue_nfse_reconciliation(uuid)','execute') then raise exception 'reconciliação exposta a anon';end if;
 if not is_valid_br_tax_id('52998224725') or not is_valid_br_tax_id('11222333000181') then raise exception 'valid CPF/CNPJ rejected';end if;
 if is_valid_br_tax_id('11111111111') or is_valid_br_tax_id('11222333000182') then raise exception 'invalid CPF/CNPJ accepted';end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='nfse_certificates'
  and column_name='issuer_id' and is_nullable<>'YES') then raise exception 'identity-first certificate still requires issuer';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='nfse_certificates'
  and column_name='custody_aad_id' and is_nullable='NO') then raise exception 'stable custody AAD missing';end if;
 if has_function_privilege('authenticated','activate_self_registered_identity_certificate(uuid,uuid,text,text,text,text,text,timestamptz,timestamptz)','execute')
  then raise exception 'identity activation exposed to browser';end if;
 if not has_function_privilege('service_role','activate_self_registered_identity_certificate(uuid,uuid,text,text,text,text,text,timestamptz,timestamptz)','execute')
  then raise exception 'identity activation unavailable to service role';end if;
 if not has_function_privilege('authenticated','complete_self_service_representation(text,text,text,text,text,text,text,text,text,uuid)','execute')
  then raise exception 'representation onboarding unavailable';end if;
 if exists(select 1 from information_schema.tables where table_schema='public' and table_name in
  ('certificate_auth_challenges','certificate_auth_bindings','certificate_auth_exchanges'))
  then raise exception 'removed certificate-login tables still exist';end if;
end$$;
