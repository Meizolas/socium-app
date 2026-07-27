-- Permite distinguir alertas novos dos que o operador já visualizou.
alter table public.alerts
  add column if not exists read_at timestamptz;

create index if not exists alerts_office_unread_idx
  on public.alerts(office_id, created_at desc)
  where read_at is null and resolved_at is null;
