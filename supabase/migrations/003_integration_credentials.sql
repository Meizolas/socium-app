create table if not exists public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  provider text not null check (provider in ('evolution','gmail')),
  config jsonb not null default '{}',
  encrypted_secret text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (office_id, provider)
);
alter table public.integration_credentials enable row level security;
drop policy if exists integration_credentials_isolation on public.integration_credentials;
create policy integration_credentials_isolation on public.integration_credentials
for all to authenticated using (office_id=public.current_office()) with check (office_id=public.current_office());
drop trigger if exists integration_credentials_set_updated_at on public.integration_credentials;
create trigger integration_credentials_set_updated_at before update on public.integration_credentials
for each row execute function public.set_updated_at();
-- Não conceder SELECT ao frontend: credenciais são acessadas somente pela API do servidor.
