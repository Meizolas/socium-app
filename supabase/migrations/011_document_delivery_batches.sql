-- Agrupa documentos importados juntos para consolidar um e-mail por cliente.
alter table public.documents
  add column if not exists batch_id uuid,
  add column if not exists batch_size integer;

create index if not exists documents_office_batch_idx
  on public.documents(office_id, batch_id)
  where batch_id is not null;
