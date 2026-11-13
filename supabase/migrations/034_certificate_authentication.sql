-- One-time mTLS certificate authentication. The TLS gateway validates the
-- ICP-Brasil chain; these tables bind the proven legal identity to an account.

create table certificate_auth_challenges(
 id uuid primary key default gen_random_uuid(),
 token_hash text not null unique check(token_hash~'^[0-9a-f]{64}$'),
 requested_by uuid references auth.users on delete cascade,
 expires_at timestamptz not null,
 consumed_at timestamptz,
 created_at timestamptz not null default now(),
 check(expires_at>created_at)
);

create table certificate_auth_bindings(
 legal_entity_id uuid primary key references legal_entities on delete cascade,
 auth_user_id uuid not null unique references auth.users on delete cascade,
 fingerprint_sha256 text not null check(fingerprint_sha256~'^[0-9a-f]{64}$'),
 certificate_serial text not null,
 certificate_subject text not null,
 not_before timestamptz not null,
 not_after timestamptz not null,
 last_authenticated_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(not_after>not_before)
);

create table certificate_auth_exchanges(
 id uuid primary key default gen_random_uuid(),
 token_hash text not null unique check(token_hash~'^[0-9a-f]{64}$'),
 auth_user_id uuid not null references auth.users on delete cascade,
 expires_at timestamptz not null,
 consumed_at timestamptz,
 created_at timestamptz not null default now(),
 check(expires_at>created_at)
);

create index certificate_auth_challenges_expiry_idx on certificate_auth_challenges(expires_at);
create index certificate_auth_exchanges_expiry_idx on certificate_auth_exchanges(expires_at);

create or replace function consume_certificate_auth_challenge(p_hash text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare requester uuid;
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 update certificate_auth_challenges set consumed_at=now()
 where token_hash=p_hash and consumed_at is null and expires_at>now()
 returning requested_by into requester;
 if not found then raise exception 'certificate_challenge_invalid' using errcode='28000'; end if;
 return requester;
end $$;

create or replace function activate_certificate_identity(
 p_auth_user uuid,p_requested_by uuid,p_tax_id text,p_canonical_name text,
 p_fingerprint text,p_serial text,p_subject text,p_not_before timestamptz,p_not_after timestamptz,
 p_exchange_hash text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
 entity_id uuid;
 target_office uuid;
 profile_office uuid;
 bound_user uuid;
 account_user uuid;
 normalized text:=regexp_replace(coalesce(p_tax_id,''),'[^0-9]','','g');
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 if p_auth_user is null or not is_valid_br_tax_id(normalized)
  or coalesce(p_fingerprint,'')!~'^[0-9a-f]{64}$'
  or coalesce(p_exchange_hash,'')!~'^[0-9a-f]{64}$'
  or p_not_before is null or p_not_after is null
  or p_not_before>now() or p_not_after<=now()
 then raise exception 'certificate_identity_invalid'; end if;
 if p_requested_by is not null and p_requested_by<>p_auth_user
 then raise exception 'certificate_user_mismatch' using errcode='42501'; end if;

 insert into legal_entities(tax_id,entity_type,canonical_name,identity_verified_at,identity_verification_method)
 values(normalized,case when length(normalized)=11 then 'individual' else 'company' end,
  nullif(trim(p_canonical_name),''),now(),'certificate')
 on conflict(tax_id) do update set
  canonical_name=coalesce(legal_entities.canonical_name,excluded.canonical_name),
  identity_verified_at=now(),identity_verification_method='certificate',updated_at=now()
 returning id into entity_id;
 perform pg_advisory_xact_lock(hashtextextended(entity_id::text,0));

 select auth_user_id into bound_user from certificate_auth_bindings where legal_entity_id=entity_id;
 if bound_user is not null and bound_user<>p_auth_user
 then raise exception 'certificate_identity_already_bound' using errcode='23505'; end if;
 select auth_user_id into account_user from helians_accounts where login_tax_id=normalized and status<>'revoked';
 if account_user is not null and account_user<>p_auth_user
 then raise exception 'certificate_login_already_bound' using errcode='23505'; end if;
 select office_id into profile_office from profiles where id=p_auth_user;

 if p_requested_by is not null then
  if profile_office is null or not exists(
   select 1 from office_legal_entity_links where office_id=profile_office
    and legal_entity_id=entity_id and relationship='managed'
    and status='pending' and source='self_registration'
  ) then raise exception 'certificate_does_not_match_claim' using errcode='42501'; end if;
  if exists(select 1 from office_legal_entity_links where legal_entity_id=entity_id
   and relationship='owner' and status='active' and office_id<>profile_office)
  then raise exception 'legal_entity_already_claimed' using errcode='23505'; end if;
  target_office:=profile_office;
 else
  select office_id into target_office from office_legal_entity_links
   where legal_entity_id=entity_id and relationship='owner' and status='active';
  if profile_office is not null and target_office is not null and profile_office<>target_office
  then raise exception 'certificate_account_office_mismatch' using errcode='42501'; end if;
  if target_office is null then target_office:=profile_office; end if;
  if target_office is null then
   insert into offices(name) values(coalesce(nullif(trim(p_canonical_name),''),normalized)) returning id into target_office;
  end if;
  if profile_office is null then
   insert into profiles(id,office_id,name,role,onboarding_step)
   values(p_auth_user,target_office,coalesce(nullif(trim(p_canonical_name),''),'Titular do certificado'),'admin','commercial_activation');
  end if;
 end if;

 insert into office_legal_entity_links(office_id,legal_entity_id,relationship,status,source,verified_at,created_by)
 values(target_office,entity_id,'owner','active','certificate',now(),p_auth_user)
 on conflict(office_id,legal_entity_id,relationship) do update set
  status='active',source='certificate',verified_at=now(),updated_at=now();
 update office_legal_entity_links set status='active',verified_at=now(),updated_at=now()
 where office_id=target_office and legal_entity_id=entity_id
  and relationship='managed' and source='self_registration';
 update onboarding_requests set identity_status='verified',updated_at=now()
 where auth_user_id=p_auth_user and legal_entity_id=entity_id and identity_status='pending';
 update profiles set onboarding_step='commercial_activation' where id=p_auth_user;

 insert into helians_accounts(auth_user_id,login_tax_id,account_type,recovery_email,status,activated_at)
 select p_auth_user,normalized,'office',email,'active',now() from auth.users where id=p_auth_user
 on conflict(auth_user_id) do update set
  login_tax_id=excluded.login_tax_id,status='active',activated_at=coalesce(helians_accounts.activated_at,now()),updated_at=now();
 insert into certificate_auth_bindings(
  legal_entity_id,auth_user_id,fingerprint_sha256,certificate_serial,certificate_subject,
  not_before,not_after,last_authenticated_at
 ) values(entity_id,p_auth_user,p_fingerprint,p_serial,p_subject,p_not_before,p_not_after,now())
 on conflict(legal_entity_id) do update set
  fingerprint_sha256=excluded.fingerprint_sha256,certificate_serial=excluded.certificate_serial,
  certificate_subject=excluded.certificate_subject,not_before=excluded.not_before,
  not_after=excluded.not_after,last_authenticated_at=now(),updated_at=now();
 if not exists(select 1 from office_modules where office_id=target_office)
  and not exists(select 1 from offer_interests where office_id=target_office and status='pending') then
  insert into offer_interests(office_id,profile_id,offer) values(target_office,p_auth_user,'nfse');
 end if;
 insert into certificate_auth_exchanges(token_hash,auth_user_id,expires_at)
 values(p_exchange_hash,p_auth_user,now()+interval '2 minutes');
 return target_office;
end $$;

create or replace function consume_certificate_auth_exchange(p_hash text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare target_user uuid;
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 update certificate_auth_exchanges set consumed_at=now()
 where token_hash=p_hash and consumed_at is null and expires_at>now()
 returning auth_user_id into target_user;
 if not found then raise exception 'certificate_exchange_invalid' using errcode='28000'; end if;
 return target_user;
end $$;

alter table certificate_auth_challenges enable row level security;
alter table certificate_auth_bindings enable row level security;
alter table certificate_auth_exchanges enable row level security;
revoke all on table certificate_auth_challenges,certificate_auth_bindings,certificate_auth_exchanges from public,anon,authenticated;
revoke all on function consume_certificate_auth_challenge(text) from public,anon,authenticated;
revoke all on function activate_certificate_identity(uuid,uuid,text,text,text,text,text,timestamptz,timestamptz,text) from public,anon,authenticated;
revoke all on function consume_certificate_auth_exchange(text) from public,anon,authenticated;
grant execute on function consume_certificate_auth_challenge(text) to service_role;
grant execute on function activate_certificate_identity(uuid,uuid,text,text,text,text,text,timestamptz,timestamptz,text) to service_role;
grant execute on function consume_certificate_auth_exchange(text) to service_role;

comment on table certificate_auth_bindings is
 'Account identity proven through an ICP-Brasil client certificate validated by the dedicated mTLS gateway.';
