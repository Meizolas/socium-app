-- Self-service identity proof with a fiscal A1. The certificate proves the
-- CPF/CNPJ that owns the account; representation remains a separate grant.

alter table nfse_certificates alter column issuer_id drop not null;
alter table nfse_certificates add column if not exists custody_aad_id uuid;
update nfse_certificates set custody_aad_id=issuer_id where custody_aad_id is null;
alter table nfse_certificates alter column custody_aad_id set not null;

create unique index if not exists nfse_one_active_identity_certificate
 on nfse_certificates(office_id,subject_legal_entity_id)
 where issuer_id is null and status='active';

create or replace function replace_nfse_certificate(
 p_office uuid,p_issuer uuid,p_provider text,p_reference text,p_key_version text,
 p_fingerprint text,p_subject_tax_id text,p_not_before timestamptz,p_not_after timestamptz
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare new_id uuid;
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 if not exists(select 1 from nfse_issuers where id=p_issuer and office_id=p_office) then raise exception 'issuer_not_found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_issuer::text,0));
 insert into nfse_certificates(office_id,issuer_id,custody_provider,custody_reference,custody_aad_id,
  key_version,fingerprint_sha256,subject_tax_id,not_before,not_after,status)
 values(p_office,p_issuer,p_provider,p_reference,p_issuer,p_key_version,p_fingerprint,
  p_subject_tax_id,p_not_before,p_not_after,'replaced') returning id into new_id;
 update nfse_certificates set status='replaced' where issuer_id=p_issuer and status='active';
 update nfse_certificates set status='active' where id=new_id;
 return new_id;
end $$;

create or replace function activate_self_registered_identity_certificate(
 p_office uuid,p_user uuid,p_provider text,p_reference text,p_key_version text,
 p_fingerprint text,p_subject_tax_id text,p_not_before timestamptz,p_not_after timestamptz
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare entity_id uuid; certificate_id uuid; normalized text; selected_offer text;
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 normalized:=regexp_replace(coalesce(p_subject_tax_id,''),'[^0-9]','','g');
 if p_office is null or p_user is null or not is_valid_br_tax_id(normalized)
  or coalesce(p_fingerprint,'')!~'^[0-9a-f]{64}$' or p_not_before is null or p_not_after is null
  or p_not_before>now() or p_not_after<=now()
 then raise exception 'invalid_identity_certificate'; end if;
 perform pg_advisory_xact_lock(hashtextextended(normalized,0));
 select e.id into entity_id
 from helians_accounts h join profiles p on p.id=h.auth_user_id
 join office_legal_entity_links l on l.office_id=p.office_id and l.created_by=h.auth_user_id
 join legal_entities e on e.id=l.legal_entity_id
 where h.auth_user_id=p_user and h.login_tax_id=normalized and h.status='active'
  and p.office_id=p_office and p.role='admin'
  and l.relationship='managed' and l.status='pending' and l.source='self_registration';
 if entity_id is null then raise exception 'pending_identity_claim_not_found' using errcode='42501'; end if;
 if exists(select 1 from office_legal_entity_links where legal_entity_id=entity_id
  and relationship='owner' and status='active' and office_id<>p_office)
 then raise exception 'legal_entity_already_claimed' using errcode='23505'; end if;

 update nfse_certificates set status='replaced'
 where office_id=p_office and subject_legal_entity_id=entity_id and issuer_id is null and status='active';
 insert into nfse_certificates(
  office_id,issuer_id,custody_provider,custody_reference,custody_aad_id,key_version,
  fingerprint_sha256,subject_tax_id,subject_legal_entity_id,not_before,not_after,status
 ) values(
  p_office,null,p_provider,p_reference,entity_id,p_key_version,
  p_fingerprint,normalized,entity_id,p_not_before,p_not_after,'active'
 ) returning id into certificate_id;
 insert into office_legal_entity_links(
  office_id,legal_entity_id,relationship,status,source,verified_at,created_by
 ) values(p_office,entity_id,'owner','active','certificate',now(),p_user)
 on conflict(office_id,legal_entity_id,relationship) do update set
  status='active',source='certificate',verified_at=now(),updated_at=now();
 update office_legal_entity_links set status='active',verified_at=now(),updated_at=now()
 where office_id=p_office and legal_entity_id=entity_id
  and relationship='managed' and source='self_registration';
 update legal_entities set identity_verified_at=now(),identity_verification_method='certificate',updated_at=now()
 where id=entity_id;
 update onboarding_requests set identity_status='verified',updated_at=now()
 where auth_user_id=p_user and legal_entity_id=entity_id and identity_status='pending';
 update profiles set onboarding_step='commercial_activation' where id=p_user and office_id=p_office;
 select offer into selected_offer from offer_interests where office_id=p_office order by created_at desc limit 1;
 if selected_offer='documentos' then
  insert into office_modules(office_id,module,status,activated_at,reason)
  values(p_office,'documentos','active',now(),'self_service_verified_identity')
  on conflict(office_id,module) do update set status='active',activated_at=now(),revoked_at=null,
   reason='self_service_verified_identity';
  update offer_interests set status='approved' where office_id=p_office and status='pending';
  update profiles set onboarding_step='ready' where id=p_user and office_id=p_office;
  insert into commercial_activation_audit(office_id,modules,reason,metadata)
  values(p_office,array['documentos'::app_module],'self_service_verified_identity',jsonb_build_object('offer',selected_offer));
 end if;
 return certificate_id;
end $$;

create or replace function attach_identity_certificate_to_issuer(p_office uuid,p_issuer uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare certificate_id uuid;
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 select c.id into certificate_id from nfse_certificates c join nfse_issuers i
  on i.id=p_issuer and i.office_id=p_office and i.legal_entity_id=c.subject_legal_entity_id
 where c.office_id=p_office and (c.issuer_id is null or c.issuer_id=p_issuer) and c.status='active'
  and c.not_before<=now() and c.not_after>now() order by c.created_at desc limit 1 for update of c;
 if certificate_id is null then raise exception 'identity_certificate_not_found'; end if;
 update nfse_certificates set issuer_id=p_issuer where id=certificate_id;
 perform mark_nfse_onboarding_certificate_ready(p_office,p_issuer);
 return certificate_id;
end $$;

create or replace function complete_self_service_representation(
 p_represented_tax_id text,p_legal_name text,p_municipal_registration text,
 p_municipality_ibge text,p_tax_regime text,p_dps_series text,
 p_simple_option text,p_simple_regime text,p_special_regime text,p_certificate uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); o uuid; entity_id uuid; v_issuer_id uuid; representation_id uuid;
 normalized text:=regexp_replace(coalesce(p_represented_tax_id,''),'[^0-9]','','g');
begin
 select office_id into o from profiles where id=u and role='admin' and onboarding_step='commercial_activation';
 if o is null or length(normalized)<>14 or not is_valid_br_tax_id(normalized)
  or char_length(trim(coalesce(p_legal_name,''))) not between 2 and 200
  or coalesce(p_municipality_ibge,'')!~'^[0-9]{7}$'
  or char_length(trim(coalesce(p_tax_regime,''))) not between 2 and 80
  or coalesce(p_dps_series,'')!~'^[A-Za-z0-9]{1,5}$'
  or p_simple_option not in ('1','2','3') or p_simple_regime not in ('1','2','3')
  or p_special_regime!~'^[0-6]$'
 then raise exception 'invalid_representation_setup'; end if;
 if not exists(select 1 from nfse_certificates c join office_legal_entity_links l
  on l.legal_entity_id=c.subject_legal_entity_id and l.office_id=c.office_id
  where c.id=p_certificate and c.office_id=o and c.status='active'
   and c.not_before<=now() and c.not_after>now() and c.subject_tax_id<>normalized
   and l.relationship='owner' and l.status='active' and l.source='certificate')
 then raise exception 'verified_representative_certificate_required' using errcode='42501'; end if;

 insert into legal_entities(tax_id,entity_type,canonical_name)
 values(normalized,'company',trim(p_legal_name))
 on conflict(tax_id) do update set canonical_name=coalesce(legal_entities.canonical_name,excluded.canonical_name),updated_at=now()
 returning id into entity_id;
 insert into office_legal_entity_links(office_id,legal_entity_id,relationship,status,source,verified_at,created_by)
 values(o,entity_id,'representative','active','representation',now(),u)
 on conflict(office_id,legal_entity_id,relationship) do update set status='active',source='representation',verified_at=now(),updated_at=now();
 select i.id into v_issuer_id from nfse_issuers i where i.office_id=o and i.legal_entity_id=entity_id for update;
 if v_issuer_id is null then
  insert into nfse_issuers(office_id,tax_id,legal_name,municipal_registration,municipality_ibge,
   tax_regime,dps_series,enabled,simple_national_option,simple_national_taxation_regime,special_tax_regime,legal_entity_id)
  values(o,normalized,trim(p_legal_name),nullif(trim(coalesce(p_municipal_registration,'')),''),
   p_municipality_ibge,trim(p_tax_regime),upper(p_dps_series),false,p_simple_option,p_simple_regime,p_special_regime,entity_id)
  returning id into v_issuer_id;
 end if;
 select r.id into representation_id from nfse_representations r
  where r.issuer_id=v_issuer_id and r.representative_profile_id=u and r.status in ('pending','active') limit 1;
 if representation_id is null then
  insert into nfse_representations(office_id,issuer_id,representative_profile_id,certificate_id,
   authorization_type,status,allow_office_issuance,allow_client_issuance,allow_cancellation,created_by)
  values(o,v_issuer_id,u,p_certificate,'electronic_power_of_attorney','active',true,true,true,u)
  returning id into representation_id;
 else
  update nfse_representations set certificate_id=p_certificate,status='active',updated_at=now()
  where id=representation_id;
 end if;
 insert into nfse_representation_audit(office_id,representation_id,issuer_id,actor_id,action,metadata)
 values(o,representation_id,v_issuer_id,u,'activated',jsonb_build_object('source','self_service'));
 return v_issuer_id;
end $$;

create or replace function activate_self_service_modules(p_office uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare selected_offer text; requested app_module; requested_modules app_module[]; activated text[]:='{}';
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 if not exists(select 1 from office_legal_entity_links l join legal_entities e on e.id=l.legal_entity_id
  where l.office_id=p_office and l.relationship='owner' and l.status='active'
   and l.source='certificate' and e.identity_verified_at is not null)
 then raise exception 'verified_owner_required'; end if;
 select offer into selected_offer from offer_interests where office_id=p_office
  order by created_at desc limit 1;
 requested_modules:=case selected_offer when 'nfse' then array['nfse'::app_module]
  when 'documentos' then array['documentos'::app_module]
  when 'completo' then array['nfse'::app_module,'documentos'::app_module] else null end;
 if requested_modules is null then raise exception 'commercial_offer_required'; end if;
 foreach requested in array requested_modules loop
  if requested='nfse' and not exists(
   select 1 from nfse_issuers i where i.office_id=p_office and (
    exists(select 1 from nfse_onboarding_setups s where s.issuer_id=i.id and s.status='certificate_ready')
    or exists(select 1 from nfse_representations r join nfse_certificates c on c.id=r.certificate_id
     where r.issuer_id=i.id and r.office_id=p_office and r.status='active'
      and c.status='active' and c.not_before<=now() and c.not_after>now())))
  then raise exception 'nfse_signing_setup_required'; end if;
  insert into office_modules(office_id,module,status,activated_at,reason)
  values(p_office,requested,'active',now(),'self_service_verified_identity')
  on conflict(office_id,module) do update set status='active',activated_at=now(),revoked_at=null,
   reason='self_service_verified_identity';
  activated:=array_append(activated,requested::text);
 end loop;
 update nfse_issuers set enabled=true where office_id=p_office and (
  exists(select 1 from nfse_onboarding_setups s where s.issuer_id=nfse_issuers.id and s.status='certificate_ready')
  or exists(select 1 from nfse_representations r where r.issuer_id=nfse_issuers.id and r.status='active'));
 update offer_interests set status='approved' where office_id=p_office and status='pending';
 update profiles set onboarding_step='ready' where office_id=p_office and onboarding_step='commercial_activation';
 insert into commercial_activation_audit(office_id,modules,reason,metadata)
 values(p_office,requested_modules,'self_service_verified_identity',jsonb_build_object('offer',selected_offer));
 return jsonb_build_object('officeId',p_office,'modules',activated,'status','active');
end $$;

revoke all on function activate_self_registered_identity_certificate(uuid,uuid,text,text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function attach_identity_certificate_to_issuer(uuid,uuid) from public,anon,authenticated;
revoke all on function complete_self_service_representation(text,text,text,text,text,text,text,text,text,uuid) from public,anon;
revoke all on function activate_self_service_modules(uuid) from public,anon,authenticated;
grant execute on function activate_self_registered_identity_certificate(uuid,uuid,text,text,text,text,text,timestamptz,timestamptz) to service_role;
grant execute on function attach_identity_certificate_to_issuer(uuid,uuid) to service_role;
grant execute on function complete_self_service_representation(text,text,text,text,text,text,text,text,text,uuid) to authenticated;
grant execute on function activate_self_service_modules(uuid) to service_role;
revoke all on function replace_nfse_certificate(uuid,uuid,text,text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function replace_nfse_certificate(uuid,uuid,text,text,text,text,text,timestamptz,timestamptz) to service_role;

comment on column nfse_certificates.custody_aad_id is
 'Stable UUID used in custody encryption AAD; issuer UUID for legacy certificates or legal-entity UUID for identity-first certificates.';

create or replace function nfse_worker_load_job(p_job uuid,p_worker text,p_fence bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j nfse_jobs; n nfse_invoices; cert nfse_certificates; cancellation nfse_cancellations;
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 select * into j from nfse_jobs where id=p_job and status='claimed' and claimed_by=p_worker and fence_token=p_fence and lease_until>now();
 if j.id is null then raise exception 'stale_worker_fence' using errcode='40001'; end if;
 select * into n from nfse_invoices where id=j.invoice_id; if n.id is null then return null; end if;
 if j.kind in ('issue','cancel') and not exists(
  select 1 from profiles p join office_modules m on m.office_id=p.office_id and m.module='nfse' and m.status='active'
  where p.id=n.created_by and p.office_id=n.office_id and p.role in ('admin','operator','client')
   and ((p.role='client' and exists(select 1 from helians_accounts h where h.auth_user_id=p.id and h.issuer_id=n.issuer_id and h.status='active'))
    or (p.role<>'client' and (not exists(select 1 from nfse_profile_issuer_access a where a.profile_id=p.id)
     or exists(select 1 from nfse_profile_issuer_access a where a.profile_id=p.id and a.issuer_id=n.issuer_id and a.allowed))))
 ) then return null; end if;
 if j.kind='reconcile' and n.status not in ('unknown','reconciling','persistence_pending') then return null; end if;
 if j.kind='cancel' then
  select * into cancellation from nfse_cancellations where invoice_id=n.id and status in ('queued','processing');
  if cancellation.id is null or n.status<>'authorized' then return null; end if;
  select * into cert from nfse_certificates where id=active_nfse_cancellation_certificate(n);
 else select * into cert from nfse_certificates where id=active_nfse_certificate(n); end if;
 if cert.id is null then return null; end if;
 return to_jsonb(n)||jsonb_build_object(
  'custody_reference',cert.custody_reference,'custody_aad_issuer_id',cert.custody_aad_id,
  'signing_certificate_id',cert.id,'signing_subject_tax_id',cert.subject_tax_id,
  'cancellation',case when cancellation.id is null then null else to_jsonb(cancellation) end);
end $$;
revoke all on function nfse_worker_load_job(uuid,text,bigint) from public,anon,authenticated;
grant execute on function nfse_worker_load_job(uuid,text,bigint) to service_role;
