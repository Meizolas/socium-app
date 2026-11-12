-- Helians identity and NFS-e electronic representation foundation.
-- Existing users and issuer-owned certificates remain fully compatible.

alter table profiles drop constraint if exists profiles_role_allowed;
alter table profiles add constraint profiles_role_allowed
 check(role in ('admin','operator','client')) not valid;

create table if not exists helians_accounts(
 auth_user_id uuid primary key references auth.users on delete cascade,
 login_tax_id text not null unique check(login_tax_id~'^[0-9]{11}([0-9]{3})?$'),
 account_type text not null check(account_type in ('office','client')),
 issuer_id uuid references nfse_issuers on delete cascade,
 recovery_email text,
 status text not null default 'active' check(status in ('invited','active','suspended','revoked')),
 activated_at timestamptz,
 created_by uuid references profiles,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((account_type='client' and issuer_id is not null) or account_type='office')
);

create unique index if not exists helians_one_client_account_per_issuer
 on helians_accounts(issuer_id) where account_type='client' and status<>'revoked';

-- Backfill office logins when onboarding already captured a valid CPF/CNPJ.
insert into helians_accounts(auth_user_id,login_tax_id,account_type,recovery_email,status,activated_at)
select distinct on (p.id) p.id,regexp_replace(r.office_tax_id,'[^0-9]','','g'),'office',u.email,'active',now()
from profiles p join auth.users u on u.id=p.id
join onboarding_requests r on r.auth_user_id=p.id and r.office_id=p.office_id
where p.role='admin' and length(regexp_replace(coalesce(r.office_tax_id,''),'[^0-9]','','g')) in (11,14)
order by p.id,r.updated_at desc
on conflict do nothing;

create table if not exists nfse_representations(
 id uuid primary key default gen_random_uuid(),
 office_id uuid not null references offices on delete cascade,
 issuer_id uuid not null references nfse_issuers on delete cascade,
 representative_profile_id uuid not null references profiles on delete cascade,
 certificate_id uuid not null references nfse_certificates,
 authorization_type text not null default 'electronic_power_of_attorney'
  check(authorization_type in ('electronic_power_of_attorney','legal_representative')),
 status text not null default 'active'
  check(status in ('pending','active','suspended','revoked','expired','verification_failed')),
 allow_office_issuance boolean not null default true,
 allow_client_issuance boolean not null default false,
 allow_cancellation boolean not null default false,
 valid_from timestamptz not null default now(),
 valid_until timestamptz,
 government_verified_at timestamptz,
 last_verification_error text,
 created_by uuid not null references profiles,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(valid_until is null or valid_until>valid_from)
);

create unique index if not exists nfse_one_current_representation
 on nfse_representations(issuer_id,representative_profile_id)
 where status in ('pending','active');

create table if not exists nfse_representation_audit(
 id bigint generated always as identity primary key,
 office_id uuid not null references offices on delete cascade,
 representation_id uuid references nfse_representations on delete set null,
 issuer_id uuid not null references nfse_issuers on delete cascade,
 actor_id uuid not null references profiles,
 action text not null check(action in (
  'created','updated','activated','selected','issuance_requested',
  'government_verified','verification_failed','suspended','revoked'
 )),
 metadata jsonb not null default '{}',
 created_at timestamptz not null default now()
);

alter table nfse_invoices add column if not exists representation_id uuid references nfse_representations;
alter table nfse_invoices add column if not exists requested_by uuid references profiles;
update nfse_invoices set requested_by=created_by where requested_by is null;

alter table helians_accounts enable row level security;
alter table nfse_representations enable row level security;
alter table nfse_representation_audit enable row level security;

drop policy if exists helians_account_self on helians_accounts;
create policy helians_account_self on helians_accounts for select to authenticated
 using(auth_user_id=auth.uid());
drop policy if exists nfse_representations_office on nfse_representations;
create policy nfse_representations_office on nfse_representations for select to authenticated
 using(office_id=current_office() and has_module('nfse'));
drop policy if exists nfse_representation_audit_office on nfse_representation_audit;
create policy nfse_representation_audit_office on nfse_representation_audit for select to authenticated
 using(office_id=current_office() and has_module('nfse'));

-- Client profiles are always deny-by-default and can only see their linked issuer.
create or replace function can_access_nfse_issuer(p_issuer uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(
  select 1 from profiles p
  where p.id=auth.uid()
    and (
      (p.role in ('admin','operator') and (
       not exists(select 1 from nfse_profile_issuer_access a where a.profile_id=p.id)
       or exists(select 1 from nfse_profile_issuer_access a where a.profile_id=p.id and a.issuer_id=p_issuer and a.allowed)
      ))
      or
      (p.role='client' and exists(
       select 1 from helians_accounts h
       where h.auth_user_id=p.id and h.account_type='client' and h.status='active' and h.issuer_id=p_issuer
      ))
    )
 )
$$;
revoke all on function can_access_nfse_issuer(uuid) from public,anon;
grant execute on function can_access_nfse_issuer(uuid) to authenticated;

create or replace function is_nfse_operator() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from profiles where id=auth.uid() and role in ('admin','operator','client'))
$$;
revoke all on function is_nfse_operator() from public,anon;
grant execute on function is_nfse_operator() to authenticated;

create or replace function active_nfse_certificate(p_invoice nfse_invoices)
returns uuid language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(
  (select c.id from nfse_certificates c
   where c.issuer_id=p_invoice.issuer_id and c.office_id=p_invoice.office_id
    and c.status='active' and c.not_before<=now() and c.not_after>now()
   order by c.created_at desc limit 1),
  (select c.id from nfse_representations r
   join nfse_certificates c on c.id=r.certificate_id
   join profiles actor on actor.id=p_invoice.created_by
   where r.id=p_invoice.representation_id and r.issuer_id=p_invoice.issuer_id
    and r.office_id=p_invoice.office_id and r.status='active'
    and r.valid_from<=now() and (r.valid_until is null or r.valid_until>now())
    and c.status='active' and c.not_before<=now() and c.not_after>now()
    and ((actor.role='client' and r.allow_client_issuance) or (actor.role<>'client' and r.allow_office_issuance))
   limit 1)
 )
$$;
revoke all on function active_nfse_certificate(nfse_invoices) from public,anon,authenticated;
grant execute on function active_nfse_certificate(nfse_invoices) to service_role;

comment on table helians_accounts is 'Maps a CPF/CNPJ login identifier to an internal authentication user without sharing credentials.';
comment on table nfse_representations is 'Explicit, auditable authorization for an office certificate to act for an NFS-e issuer.';
comment on column nfse_representations.allow_client_issuance is 'When true, the represented client may request issuance signed by the representative office certificate.';
