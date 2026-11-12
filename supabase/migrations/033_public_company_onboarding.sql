-- Public first access creates an isolated tenant and a pending company claim.
-- A self-declared CPF/CNPJ never grants ownership or fiscal permissions.

alter table onboarding_requests
 add column if not exists legal_entity_id uuid references legal_entities,
 add column if not exists identity_status text not null default 'pending'
  check(identity_status in ('pending','verified','rejected'));

create index if not exists onboarding_requests_legal_entity_idx
 on onboarding_requests(legal_entity_id);

create or replace function is_valid_br_tax_id(p_tax_id text) returns boolean
language plpgsql immutable strict set search_path=public,pg_temp as $$
declare
 digits text:=regexp_replace(p_tax_id,'[^0-9]','','g');
 total int:=0;
 expected int;
 i int;
begin
 if length(digits) not in (11,14)
  or digits=repeat(substr(digits,1,1),length(digits)) then return false; end if;
 if length(digits)=11 then
  for i in 1..9 loop total:=total+(substr(digits,i,1)::int*(11-i)); end loop;
  expected:=case when total%11<2 then 0 else 11-total%11 end;
  if expected<>substr(digits,10,1)::int then return false; end if;
  total:=0;
  for i in 1..10 loop total:=total+(substr(digits,i,1)::int*(12-i)); end loop;
  expected:=case when total%11<2 then 0 else 11-total%11 end;
  return expected=substr(digits,11,1)::int;
 end if;
 for i in 1..12 loop
  total:=total+(substr(digits,i,1)::int*case when i<=4 then 6-i else 14-i end);
 end loop;
 expected:=case when total%11<2 then 0 else 11-total%11 end;
 if expected<>substr(digits,13,1)::int then return false; end if;
 total:=0;
 for i in 1..13 loop
  total:=total+(substr(digits,i,1)::int*case when i<=5 then 7-i else 15-i end);
 end loop;
 expected:=case when total%11<2 then 0 else 11-total%11 end;
 return expected=substr(digits,14,1)::int;
end $$;

revoke all on function is_valid_br_tax_id(text) from public,anon,authenticated;

create or replace function complete_public_onboarding(
 p_name text,p_office_name text,p_tax_id text,p_offer text,p_key text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
 u uuid:=auth.uid();
 o uuid;
 entity_id uuid;
 normalized_tax_id text;
 r onboarding_requests;
begin
 if u is null then raise exception 'authentication_required' using errcode='28000'; end if;
 normalized_tax_id:=regexp_replace(coalesce(p_tax_id,''),'[^0-9]','','g');
 if p_offer not in ('documentos','nfse','completo')
  or char_length(trim(coalesce(p_name,''))) not between 2 and 120
  or char_length(trim(coalesce(p_office_name,''))) not between 2 and 200
  or not is_valid_br_tax_id(normalized_tax_id)
  or coalesce(p_key,'')!~'^[0-9a-fA-F-]{36}$'
 then raise exception 'invalid_onboarding'; end if;

 perform pg_advisory_xact_lock(hashtextextended(u::text,0));

 select * into r from onboarding_requests
 where auth_user_id=u and idempotency_key=p_key;
 if r.office_id is not null then return r.office_id; end if;
 if exists(select 1 from profiles where id=u) then raise exception 'membership_already_exists'; end if;

 insert into legal_entities(tax_id,entity_type,canonical_name)
 values(normalized_tax_id,
  case when length(normalized_tax_id)=11 then 'individual' else 'company' end,
  trim(p_office_name))
 on conflict(tax_id) do update set
  canonical_name=coalesce(legal_entities.canonical_name,excluded.canonical_name),
  updated_at=now()
 returning id into entity_id;

 if exists(select 1 from office_legal_entity_links
  where legal_entity_id=entity_id and relationship='owner' and status='active')
 then raise exception 'legal_entity_already_claimed'; end if;

 insert into onboarding_requests(
  auth_user_id,idempotency_key,office_name,office_tax_id,offer,
  legal_entity_id,identity_status
 ) values(
  u,p_key,trim(p_office_name),normalized_tax_id,p_offer,entity_id,'pending'
 ) on conflict(auth_user_id,idempotency_key) do update set updated_at=now()
 returning * into r;

 insert into offices(name) values(trim(p_office_name)) returning id into o;
 insert into profiles(id,office_id,name,role,onboarding_step)
 values(u,o,trim(p_name),'admin','identity_verification');
 insert into office_legal_entity_links(
  office_id,legal_entity_id,relationship,status,source,created_by
 ) values(o,entity_id,'managed','pending','self_registration',u)
 on conflict(office_id,legal_entity_id,relationship) do update set
  status='pending',source='self_registration',created_by=u,updated_at=now();
 insert into offer_interests(office_id,profile_id,offer) values(o,u,p_offer);
 update onboarding_requests set office_id=o,status='completed',updated_at=now()
 where id=r.id;
 return o;
end $$;

revoke all on function complete_public_onboarding(text,text,text,text,text) from public,anon;
grant execute on function complete_public_onboarding(text,text,text,text,text) to authenticated;

comment on column onboarding_requests.identity_status is
 'Self-registration remains pending until certificate proof, invitation or manual review.';
