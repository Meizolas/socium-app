-- Public self-registration currently provisions only the NFS-e offer.
-- Other modules remain available exclusively through administrative activation.

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
 if char_length(trim(coalesce(p_name,''))) not between 2 and 120
  or char_length(trim(coalesce(p_office_name,''))) not between 2 and 200
  or not is_valid_br_tax_id(normalized_tax_id)
  or coalesce(p_key,'')!~'^[0-9a-fA-F-]{36}$'
 then raise exception 'invalid_onboarding'; end if;

 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into r from onboarding_requests where auth_user_id=u and idempotency_key=p_key;
 if r.office_id is not null then return r.office_id; end if;
 if exists(select 1 from profiles where id=u) then raise exception 'membership_already_exists'; end if;

 insert into legal_entities(tax_id,entity_type,canonical_name)
 values(normalized_tax_id,case when length(normalized_tax_id)=11 then 'individual' else 'company' end,trim(p_office_name))
 on conflict(tax_id) do update set
  canonical_name=coalesce(legal_entities.canonical_name,excluded.canonical_name),updated_at=now()
 returning id into entity_id;

 if exists(select 1 from office_legal_entity_links
  where legal_entity_id=entity_id and relationship='owner' and status='active')
 then raise exception 'legal_entity_already_claimed'; end if;

 insert into onboarding_requests(
  auth_user_id,idempotency_key,office_name,office_tax_id,offer,legal_entity_id,identity_status
 ) values(u,p_key,trim(p_office_name),normalized_tax_id,'nfse',entity_id,'pending')
 on conflict(auth_user_id,idempotency_key) do update set updated_at=now()
 returning * into r;

 insert into offices(name) values(trim(p_office_name)) returning id into o;
 insert into profiles(id,office_id,name,role,onboarding_step)
 values(u,o,trim(p_name),'admin','identity_verification');
 insert into office_legal_entity_links(
  office_id,legal_entity_id,relationship,status,source,created_by
 ) values(o,entity_id,'managed','pending','self_registration',u)
 on conflict(office_id,legal_entity_id,relationship) do update set
  status='pending',source='self_registration',created_by=u,updated_at=now();
 insert into offer_interests(office_id,profile_id,offer) values(o,u,'nfse');
 update onboarding_requests set office_id=o,status='completed',updated_at=now() where id=r.id;
 return o;
end $$;

revoke all on function complete_public_onboarding(text,text,text,text,text) from public,anon;
grant execute on function complete_public_onboarding(text,text,text,text,text) to authenticated;

comment on function complete_public_onboarding(text,text,text,text,text) is
 'Creates a self-service tenant with the NFS-e offer only; p_offer is retained for API compatibility and ignored.';
