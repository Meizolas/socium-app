do $$begin
 if not exists(select 1 from pg_type where typname='app_module') then raise exception 'app_module ausente';end if;
 if not exists(select 1 from pg_policies where tablename='nfse_invoices') then raise exception 'RLS fiscal ausente';end if;
 if has_function_privilege('authenticated','claim_nfse_jobs(text,integer)','execute') then raise exception 'claim exposto a usuário';end if;
 if not has_function_privilege('service_role','claim_nfse_jobs(text,integer)','execute') then raise exception 'worker sem claim';end if;
 if exists(select 1 from storage.buckets where id in('nfse-custody','nfse-documents') and public) then raise exception 'bucket fiscal público';end if;
 if has_function_privilege('anon','enqueue_nfse_issue(uuid)','execute') then raise exception 'enqueue fiscal exposto a anon';end if;
 if not has_function_privilege('authenticated','enqueue_nfse_issue(uuid)','execute') then raise exception 'enqueue fiscal indisponível ao usuário autenticado';end if;
 if has_function_privilege('anon','enqueue_nfse_reconciliation(uuid)','execute') then raise exception 'reconciliação exposta a anon';end if;
end$$;
