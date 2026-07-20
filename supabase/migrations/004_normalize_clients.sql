-- Padroniza CNPJ para comparação confiável entre PDF, importação e cadastro manual.
update public.clients
set cnpj=regexp_replace(cnpj,'[^0-9]','','g')
where length(regexp_replace(cnpj,'[^0-9]','','g'))=14
  and cnpj<>regexp_replace(cnpj,'[^0-9]','','g');

alter table public.clients drop constraint if exists clients_cnpj_format;
alter table public.clients add constraint clients_cnpj_format check (cnpj ~ '^[0-9]{14}$');
