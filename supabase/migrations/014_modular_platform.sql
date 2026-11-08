create type app_module as enum ('documentos','nfse');
create type module_status as enum ('pending','active','suspended','revoked');
alter table profiles alter column role drop default;
alter table profiles add column onboarding_step text not null default 'account';
alter table profiles add constraint profiles_role_allowed check(role in ('admin','operator')) not valid;

create table office_modules(office_id uuid not null references offices on delete cascade,module app_module not null,status module_status not null default 'pending',activated_at timestamptz,activated_by uuid references auth.users,revoked_at timestamptz,reason text,primary key(office_id,module));
create table profile_module_access(profile_id uuid not null references profiles on delete cascade,module app_module not null,allowed boolean not null,created_at timestamptz not null default now(),created_by uuid references auth.users,primary key(profile_id,module));
create table offer_interests(id uuid primary key default gen_random_uuid(),office_id uuid not null references offices on delete cascade,profile_id uuid not null references profiles on delete cascade,offer text not null check(offer in ('documentos','nfse','completo')),status text not null default 'pending' check(status in ('pending','approved','rejected')),created_at timestamptz not null default now());
create unique index offer_interests_one_pending on offer_interests(office_id) where status='pending';
create table office_invitations(id uuid primary key default gen_random_uuid(),office_id uuid not null references offices on delete cascade,email_hash text not null,token_hash text not null unique,role text not null check(role in ('admin','operator')),expires_at timestamptz not null,accepted_at timestamptz,revoked_at timestamptz,invited_by uuid not null references profiles,created_at timestamptz not null default now());
create table onboarding_requests(id uuid primary key default gen_random_uuid(),auth_user_id uuid not null references auth.users,idempotency_key text not null,office_id uuid references offices,office_name text not null,office_tax_id text,offer text not null check(offer in ('documentos','nfse','completo')),status text not null default 'pending',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(auth_user_id,idempotency_key));

create or replace function complete_public_onboarding(p_name text,p_office_name text,p_tax_id text,p_offer text,p_key text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); o uuid; r onboarding_requests;
begin
 if u is null then raise exception 'authentication_required' using errcode='28000'; end if;
 if p_offer not in ('documentos','nfse','completo') or trim(p_name)='' or trim(p_office_name)='' then raise exception 'invalid_onboarding'; end if;
 insert into onboarding_requests(auth_user_id,idempotency_key,office_name,office_tax_id,offer) values(u,p_key,trim(p_office_name),nullif(regexp_replace(coalesce(p_tax_id,''),'[^[:alnum:]]','','g'),''),p_offer) on conflict(auth_user_id,idempotency_key) do update set updated_at=now() returning * into r;
 if r.office_id is not null then return r.office_id; end if;
 if exists(select 1 from profiles where id=u) then raise exception 'membership_already_exists'; end if;
 insert into offices(name) values(trim(p_office_name)) returning id into o;
 insert into profiles(id,office_id,name,role,onboarding_step) values(u,o,trim(p_name),'admin','commercial_activation');
 insert into offer_interests(office_id,profile_id,offer) values(o,u,p_offer);
 update onboarding_requests set office_id=o,status='completed',updated_at=now() where id=r.id;
 return o;
end $$;
revoke all on function complete_public_onboarding(text,text,text,text,text) from public,anon;
grant execute on function complete_public_onboarding(text,text,text,text,text) to authenticated;

create or replace function has_module(m app_module) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from profiles p join office_modules om on om.office_id=p.office_id and om.module=m and om.status='active' left join profile_module_access a on a.profile_id=p.id and a.module=m where p.id=auth.uid() and coalesce(a.allowed,true)) $$;
revoke all on function has_module(app_module) from public,anon;
grant execute on function has_module(app_module) to authenticated;

alter table office_modules enable row level security; alter table profile_module_access enable row level security; alter table offer_interests enable row level security; alter table office_invitations enable row level security; alter table onboarding_requests enable row level security;
create policy office_modules_read on office_modules for select to authenticated using(office_id=current_office());
create policy profile_module_read on profile_module_access for select to authenticated using(profile_id=auth.uid());
create policy offer_read on offer_interests for select to authenticated using(office_id=current_office());
create policy onboarding_read on onboarding_requests for select to authenticated using(auth_user_id=auth.uid());
drop policy if exists profile_isolation on profiles;
create policy profile_read on profiles for select to authenticated using(office_id=current_office());
comment on table office_modules is 'Somente a plataforma ativa módulos; oferta escolhida não concede acesso.';

