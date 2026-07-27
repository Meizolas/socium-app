-- Guarda o modelo fiscal identificado pelo n8n para filtros e relatórios.
alter table public.documents
  add column if not exists document_type text not null default 'GUIA';

update public.documents
set document_type = case
  when upper(coalesce(final_name, original_name)) like 'DAS %' then 'DAS'
  when upper(coalesce(final_name, original_name)) like 'DARF %' then 'DARF'
  when upper(coalesce(final_name, original_name)) like 'DAE %' then 'DAE'
  when upper(coalesce(final_name, original_name)) like 'DAM %' then 'DAM'
  when upper(coalesce(final_name, original_name)) like 'GPS %' then 'GPS'
  when upper(coalesce(final_name, original_name)) like 'FGTS %' then 'FGTS'
  else document_type
end;

create index if not exists documents_office_type_idx
  on public.documents(office_id, document_type);
