-- A certificate-verified company owner may prepare its fiscal issuer before
-- commercial activation. This does not enable the NFS-e module or emission.

create table if not exists nfse_onboarding_setups(
 office_id uuid not null references offices on delete cascade,
 legal_entity_id uuid not null references legal_entities on delete cascade,
 issuer_id uuid references nfse_issuers on delete set null,
 status text not null default 'pending'
  check(status in ('pending','fiscal_ready','certificate_ready')),
 completed_by uuid references auth.users,
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(office_id,legal_entity_id)
);

create unique index if not exists nfse_onboarding_setup_issuer_idx
 on nfse_onboarding_setups(issuer_id) where issuer_id is not null;

create or replace function complete_verified_owner_nfse_setup(
 p_legal_entity uuid,p_legal_name text,p_municipal_registration text,
 p_municipality_ibge text,p_tax_regime text,p_dps_series text,
 p_simple_option text,p_simple_regime text,p_special_regime text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
 u uuid:=auth.uid();
 o uuid;
 entity legal_entities;
 issuer_id uuid;
begin
 if u is null then raise exception 'authentication_required' using errcode='28000'; end if;
 select office_id into o from profiles
  where id=u and role='admin' and onboarding_step='commercial_activation';
 select * into entity from legal_entities where id=p_legal_entity for update;
 if o is null or entity.id is null or entity.entity_type<>'company'
  or entity.identity_verified_at is null
  or not exists(select 1 from office_legal_entity_links l
   where l.office_id=o and l.legal_entity_id=entity.id
    and l.relationship='owner' and l.status='active' and l.source='certificate')
 then raise exception 'verified_company_owner_required' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_legal_name,''))) not between 2 and 200
  or coalesce(p_municipal_registration,'')!~'^[[:alnum:]./ -]{0,40}$'
  or coalesce(p_municipality_ibge,'')!~'^[0-9]{7}$'
  or char_length(trim(coalesce(p_tax_regime,''))) not between 2 and 80
  or coalesce(p_dps_series,'')!~'^[A-Za-z0-9]{1,5}$'
  or p_simple_option not in ('1','2','3')
  or p_simple_regime not in ('1','2','3')
  or p_special_regime!~'^[0-6]$'
 then raise exception 'invalid_fiscal_setup'; end if;

 perform pg_advisory_xact_lock(hashtextextended(entity.id::text,0));
 select id into issuer_id from nfse_issuers
  where office_id=o and legal_entity_id=entity.id for update;
 if issuer_id is null then
  insert into nfse_issuers(
   office_id,tax_id,legal_name,municipal_registration,municipality_ibge,
   tax_regime,dps_series,enabled,simple_national_option,
   simple_national_taxation_regime,special_tax_regime,legal_entity_id
  ) values(
   o,entity.tax_id,trim(p_legal_name),nullif(trim(coalesce(p_municipal_registration,'')),''),
   p_municipality_ibge,trim(p_tax_regime),upper(p_dps_series),false,
   p_simple_option,p_simple_regime,p_special_regime,entity.id
  ) returning id into issuer_id;
 else
  update nfse_issuers set
   legal_name=trim(p_legal_name),
   municipal_registration=nullif(trim(coalesce(p_municipal_registration,'')),''),
   municipality_ibge=p_municipality_ibge,tax_regime=trim(p_tax_regime),
   dps_series=upper(p_dps_series),simple_national_option=p_simple_option,
   simple_national_taxation_regime=p_simple_regime,
   special_tax_regime=p_special_regime,enabled=false
  where id=issuer_id;
 end if;
 update legal_entities set canonical_name=trim(p_legal_name),updated_at=now()
  where id=entity.id;
 insert into nfse_onboarding_setups(
  office_id,legal_entity_id,issuer_id,status,completed_by,completed_at
 ) values(o,entity.id,issuer_id,'fiscal_ready',u,now())
 on conflict(office_id,legal_entity_id) do update set
  issuer_id=excluded.issuer_id,
  status=case when nfse_onboarding_setups.status='certificate_ready'
   then 'certificate_ready' else 'fiscal_ready' end,
  completed_by=u,completed_at=now(),updated_at=now();
 return issuer_id;
end $$;

create or replace function mark_nfse_onboarding_certificate_ready(
 p_office uuid,p_issuer uuid
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 update nfse_onboarding_setups s set status='certificate_ready',updated_at=now()
 from nfse_issuers i
 where s.office_id=p_office and s.issuer_id=p_issuer
  and i.id=p_issuer and i.office_id=p_office and i.legal_entity_id=s.legal_entity_id;
 if not found then raise exception 'nfse_onboarding_setup_not_found'; end if;
end $$;

alter table nfse_onboarding_setups enable row level security;
revoke all on table nfse_onboarding_setups from public,anon,authenticated;
grant select on table nfse_onboarding_setups to authenticated;
create policy nfse_onboarding_setup_owner_read on nfse_onboarding_setups
 for select to authenticated using(office_id=current_office());

revoke all on function complete_verified_owner_nfse_setup(uuid,text,text,text,text,text,text,text,text)
 from public,anon;
grant execute on function complete_verified_owner_nfse_setup(uuid,text,text,text,text,text,text,text,text)
 to authenticated;
revoke all on function mark_nfse_onboarding_certificate_ready(uuid,uuid)
 from public,anon,authenticated;
grant execute on function mark_nfse_onboarding_certificate_ready(uuid,uuid) to service_role;

comment on table nfse_onboarding_setups is
 'Fiscal preparation by a certificate-verified owner; it never grants commercial module access.';
