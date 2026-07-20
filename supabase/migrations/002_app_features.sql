-- Recursos de aplicação e reforços de segurança.
-- Pode ser executada novamente sem duplicar tabelas, funções ou policies.

create table if not exists public.office_settings (
  office_id uuid primary key references public.offices(id) on delete cascade,
  default_competence text,
  max_upload_mb integer not null default 20 check (max_upload_mb between 1 and 100),
  notification_email boolean not null default true,
  notification_whatsapp boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  sidebar_collapsed boolean not null default false,
  selected_competence text,
  notifications_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  alert_id uuid references public.alerts(id) on delete set null,
  title text not null,
  message text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_office_created_idx
  on public.notifications (office_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc) where read_at is null;
create index if not exists documents_office_created_idx
  on public.documents (office_id, created_at desc);
create index if not exists processings_office_status_idx
  on public.processings (office_id, status, updated_at desc);
create index if not exists clients_office_active_idx
  on public.clients (office_id, active, legal_name);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents
for each row execute function public.set_updated_at();
drop trigger if exists processings_set_updated_at on public.processings;
create trigger processings_set_updated_at before update on public.processings
for each row execute function public.set_updated_at();
drop trigger if exists office_settings_set_updated_at on public.office_settings;
create trigger office_settings_set_updated_at before update on public.office_settings
for each row execute function public.set_updated_at();
drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at before update on public.user_preferences
for each row execute function public.set_updated_at();

alter table public.office_settings enable row level security;
alter table public.user_preferences enable row level security;
alter table public.notifications enable row level security;

drop policy if exists office_settings_isolation on public.office_settings;
create policy office_settings_isolation on public.office_settings
for all to authenticated
using (office_id = public.current_office())
with check (office_id = public.current_office());

drop policy if exists own_user_preferences on public.user_preferences;
create policy own_user_preferences on public.user_preferences
for all to authenticated
using (user_id = auth.uid() and office_id = public.current_office())
with check (user_id = auth.uid() and office_id = public.current_office());

drop policy if exists notification_isolation on public.notifications;
create policy notification_isolation on public.notifications
for all to authenticated
using (
  office_id = public.current_office()
  and (user_id is null or user_id = auth.uid())
)
with check (
  office_id = public.current_office()
  and (user_id is null or user_id = auth.uid())
);

-- Arquivos devem usar o caminho: <office_id>/<nome-do-arquivo>.
drop policy if exists office_storage_select on storage.objects;
create policy office_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'das-documents'
  and (storage.foldername(name))[1] = public.current_office()::text
);

drop policy if exists office_storage_insert on storage.objects;
create policy office_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'das-documents'
  and (storage.foldername(name))[1] = public.current_office()::text
);

drop policy if exists office_storage_update on storage.objects;
create policy office_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'das-documents'
  and (storage.foldername(name))[1] = public.current_office()::text
)
with check (
  bucket_id = 'das-documents'
  and (storage.foldername(name))[1] = public.current_office()::text
);

drop policy if exists office_storage_delete on storage.objects;
create policy office_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'das-documents'
  and (storage.foldername(name))[1] = public.current_office()::text
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.office_settings to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;

