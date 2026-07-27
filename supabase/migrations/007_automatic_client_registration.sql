-- Diferencia clientes importados/manuais dos cadastros provisórios criados por uma guia.
alter table public.clients
  add column if not exists auto_created boolean not null default false;

create index if not exists clients_office_auto_created_idx
  on public.clients(office_id, auto_created)
  where auto_created = true;
