do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth; create schema if not exists storage;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table storage.buckets(id text primary key,name text not null,public boolean default false,file_size_limit bigint);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text not null,owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(regexp_replace(name,'/[^/]*$',''),'/')$$;
grant usage on schema auth,storage to anon,authenticated,service_role;
