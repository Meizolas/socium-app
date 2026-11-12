-- Global legal identity foundation for independent tenants, owned companies and
-- represented companies. Existing office-scoped fiscal configuration remains intact.

create table if not exists legal_entities(
 id uuid primary key default gen_random_uuid(),
 tax_id text not null unique check(tax_id~'^[0-9]{11}([0-9]{3})?$'),
 entity_type text not null check(entity_type in ('individual','company')),
 canonical_name text,
 status text not null default 'active' check(status in ('active','suspended','merged')),
 identity_verified_at timestamptz,
 identity_verification_method text check(identity_verification_method in
  ('certificate','invitation','manual_review','legacy_import')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((entity_type='individual' and length(tax_id)=11) or
       (entity_type='company' and length(tax_id)=14))
);

create table if not exists office_legal_entity_links(
 id uuid primary key default gen_random_uuid(),
 office_id uuid not null references offices on delete cascade,
 legal_entity_id uuid not null references legal_entities on delete cascade,
 relationship text not null check(relationship in ('owner','representative','managed')),
 status text not null default 'active' check(status in ('pending','active','suspended','revoked')),
 source text not null default 'legacy_import' check(source in
  ('certificate','self_registration','invitation','representation','manual','legacy_import')),
 verified_at timestamptz,
 created_by uuid references auth.users,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(office_id,legal_entity_id,relationship)
);

-- A legal entity may own one tenant. Other tenants may still represent or manage it.
create unique index if not exists one_owner_office_per_legal_entity
 on office_legal_entity_links(legal_entity_id)
 where relationship='owner' and status in ('pending','active');

alter table nfse_issuers add column if not exists legal_entity_id uuid references legal_entities;
alter table nfse_certificates add column if not exists subject_legal_entity_id uuid references legal_entities;
create index if not exists nfse_issuers_legal_entity_idx on nfse_issuers(legal_entity_id);
create index if not exists nfse_certificates_subject_entity_idx on nfse_certificates(subject_legal_entity_id);

-- One global identity for every existing issuer, even when the same CNPJ appears
-- in more than one office-scoped fiscal configuration.
insert into legal_entities(tax_id,entity_type,canonical_name)
select normalized_tax_id,'company',legal_name
from (
 select distinct on (regexp_replace(tax_id,'[^0-9]','','g'))
  regexp_replace(tax_id,'[^0-9]','','g') normalized_tax_id,legal_name,created_at
 from nfse_issuers
 where length(regexp_replace(coalesce(tax_id,''),'[^0-9]','','g'))=14
 order by regexp_replace(tax_id,'[^0-9]','','g'),created_at
) existing
on conflict(tax_id) do update set
 canonical_name=coalesce(legal_entities.canonical_name,excluded.canonical_name),
 updated_at=now();

update nfse_issuers i set legal_entity_id=e.id
from legal_entities e
where e.tax_id=regexp_replace(i.tax_id,'[^0-9]','','g')
 and i.legal_entity_id is distinct from e.id;

-- Certificate subjects are identities as well. A certificate may belong to a
-- representative and therefore must not be assumed to own the invoice issuer.
insert into legal_entities(tax_id,entity_type,identity_verified_at,identity_verification_method)
select distinct normalized_tax_id,
 case when length(normalized_tax_id)=11 then 'individual' else 'company' end,
 now(),'certificate'
from (
 select regexp_replace(subject_tax_id,'[^0-9]','','g') normalized_tax_id
 from nfse_certificates
) subjects
where length(normalized_tax_id) in (11,14)
on conflict(tax_id) do update set
 identity_verified_at=coalesce(legal_entities.identity_verified_at,excluded.identity_verified_at),
 identity_verification_method=case
  when legal_entities.identity_verification_method is null or legal_entities.identity_verification_method='legacy_import'
   then 'certificate' else legal_entities.identity_verification_method end,
 updated_at=now();

update nfse_certificates c set subject_legal_entity_id=e.id
from legal_entities e
where e.tax_id=regexp_replace(c.subject_tax_id,'[^0-9]','','g')
 and c.subject_legal_entity_id is distinct from e.id;

-- Existing represented issuers are links to a represented entity. Issuers with
-- no representation remain managed until ownership is proven by certificate.
insert into office_legal_entity_links(office_id,legal_entity_id,relationship,status,source,verified_at)
select distinct i.office_id,i.legal_entity_id,
 case when exists(select 1 from nfse_representations r where r.issuer_id=i.id and r.status='active')
  then 'representative' else 'managed' end,
 'active',
 case when exists(select 1 from nfse_representations r where r.issuer_id=i.id and r.status='active')
  then 'representation' else 'legacy_import' end,
 case when exists(select 1 from nfse_representations r where r.issuer_id=i.id and r.status='active')
  then now() else null end
from nfse_issuers i
where i.legal_entity_id is not null
on conflict(office_id,legal_entity_id,relationship) do nothing;

-- Promote an office to verified owner only when it actually holds a certificate
-- whose subject is the issuer legal entity. Ambiguous legacy ownership is left
-- unclaimed for the explicit certificate proof flow instead of choosing a tenant.
with ownership_candidates as (
 select distinct i.office_id,i.legal_entity_id
 from nfse_issuers i join nfse_certificates c
  on c.office_id=i.office_id and c.subject_legal_entity_id=i.legal_entity_id
 where i.legal_entity_id is not null and c.status='active'
  and c.not_before<=now() and c.not_after>now()
), unambiguous_ownership as (
 select min(office_id::text)::uuid office_id,legal_entity_id
 from ownership_candidates
 group by legal_entity_id
 having count(*)=1
)
insert into office_legal_entity_links(office_id,legal_entity_id,relationship,status,source,verified_at)
select office_id,legal_entity_id,'owner','active','certificate',now()
from unambiguous_ownership
on conflict(office_id,legal_entity_id,relationship) do update set
 status='active',source='certificate',verified_at=coalesce(office_legal_entity_links.verified_at,now()),updated_at=now();

create or replace function sync_nfse_issuer_legal_entity() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare normalized text; entity_id uuid;
begin
 normalized:=regexp_replace(coalesce(new.tax_id,''),'[^0-9]','','g');
 if length(normalized)<>14 then raise exception 'invalid_issuer_tax_id'; end if;
 new.tax_id:=normalized;
 insert into legal_entities(tax_id,entity_type,canonical_name)
 values(normalized,'company',new.legal_name)
 on conflict(tax_id) do update set
  canonical_name=coalesce(legal_entities.canonical_name,excluded.canonical_name),updated_at=now()
 returning id into entity_id;
 new.legal_entity_id:=entity_id;
 return new;
end $$;

drop trigger if exists sync_nfse_issuer_legal_entity_before_write on nfse_issuers;
create trigger sync_nfse_issuer_legal_entity_before_write
before insert or update of tax_id,legal_name on nfse_issuers
for each row execute function sync_nfse_issuer_legal_entity();

create or replace function sync_nfse_certificate_subject_entity() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare normalized text; entity_id uuid;
begin
 normalized:=regexp_replace(coalesce(new.subject_tax_id,''),'[^0-9]','','g');
 if length(normalized) not in (11,14) then raise exception 'invalid_certificate_subject_tax_id'; end if;
 new.subject_tax_id:=normalized;
 insert into legal_entities(tax_id,entity_type)
 values(normalized,case when length(normalized)=11 then 'individual' else 'company' end)
 on conflict(tax_id) do update set updated_at=now()
 returning id into entity_id;
 new.subject_legal_entity_id:=entity_id;
 return new;
end $$;

drop trigger if exists sync_nfse_certificate_subject_before_write on nfse_certificates;
create trigger sync_nfse_certificate_subject_before_write
before insert or update of subject_tax_id on nfse_certificates
for each row execute function sync_nfse_certificate_subject_entity();

create or replace function link_new_nfse_issuer_to_office() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into office_legal_entity_links(office_id,legal_entity_id,relationship,status,source)
 values(new.office_id,new.legal_entity_id,'managed','active','manual')
 on conflict(office_id,legal_entity_id,relationship) do nothing;
 return new;
end $$;

drop trigger if exists link_new_nfse_issuer_to_office_after_insert on nfse_issuers;
create trigger link_new_nfse_issuer_to_office_after_insert
after insert on nfse_issuers
for each row execute function link_new_nfse_issuer_to_office();

alter table legal_entities enable row level security;
alter table office_legal_entity_links enable row level security;

revoke all on table legal_entities,office_legal_entity_links from anon,authenticated;
grant select on table legal_entities,office_legal_entity_links to authenticated;

drop policy if exists legal_entities_linked_read on legal_entities;
create policy legal_entities_linked_read on legal_entities for select to authenticated
 using(exists(select 1 from office_legal_entity_links link
  where link.legal_entity_id=legal_entities.id and link.office_id=current_office()
   and link.status in ('pending','active')));

drop policy if exists office_legal_entity_links_office_read on office_legal_entity_links;
create policy office_legal_entity_links_office_read on office_legal_entity_links for select to authenticated
 using(office_id=current_office());

revoke all on function sync_nfse_issuer_legal_entity() from public,anon,authenticated;
revoke all on function sync_nfse_certificate_subject_entity() from public,anon,authenticated;
revoke all on function link_new_nfse_issuer_to_office() from public,anon,authenticated;

comment on table legal_entities is 'Global CPF/CNPJ identity shared by owned, managed and represented tenant relationships.';
comment on table office_legal_entity_links is 'Authorization relationship between a Helians tenant and a global legal identity.';
comment on column nfse_certificates.subject_legal_entity_id is 'Legal identity proven by the certificate subject; it is not inferred from the logged-in user.';
