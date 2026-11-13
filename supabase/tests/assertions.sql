do $$begin
 if not exists(select 1 from pg_type where typname='app_module') then raise exception 'app_module ausente';end if;
 if not exists(select 1 from pg_policies where tablename='nfse_invoices') then raise exception 'RLS fiscal ausente';end if;
 if has_function_privilege('authenticated','claim_nfse_jobs(text,integer)','execute') then raise exception 'claim exposto a usuário';end if;
 if not has_function_privilege('service_role','claim_nfse_jobs(text,integer)','execute') then raise exception 'worker sem claim';end if;
 if exists(select 1 from storage.buckets where id in('nfse-custody','nfse-documents') and public) then raise exception 'bucket fiscal público';end if;
 if has_function_privilege('anon','enqueue_nfse_issue(uuid)','execute') then raise exception 'enqueue fiscal exposto a anon';end if;
 if not has_function_privilege('authenticated','enqueue_nfse_issue(uuid)','execute') then raise exception 'enqueue fiscal indisponível ao usuário autenticado';end if;
 if has_function_privilege('anon','enqueue_nfse_reconciliation(uuid)','execute') then raise exception 'reconciliação exposta a anon';end if;
 if has_function_privilege('authenticated','consume_certificate_auth_challenge(text)','execute') then raise exception 'certificate challenge exposed';end if;
 if has_function_privilege('authenticated','consume_certificate_auth_exchange(text)','execute') then raise exception 'certificate exchange exposed';end if;
 if not has_function_privilege('service_role','consume_certificate_auth_challenge(text)','execute') then raise exception 'backend cannot consume certificate challenge';end if;
 if not is_valid_br_tax_id('52998224725') or not is_valid_br_tax_id('11222333000181') then raise exception 'valid CPF/CNPJ rejected';end if;
 if is_valid_br_tax_id('11111111111') or is_valid_br_tax_id('11222333000182') then raise exception 'invalid CPF/CNPJ accepted';end if;
end$$;
