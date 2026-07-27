-- Mantém a identidade lida da própria guia mesmo quando o cliente não existe.
alter table public.documents
  add column if not exists extracted_legal_name text,
  add column if not exists extracted_short_name text;

create index if not exists documents_office_extracted_cnpj_idx
  on public.documents(office_id, extracted_cnpj);
