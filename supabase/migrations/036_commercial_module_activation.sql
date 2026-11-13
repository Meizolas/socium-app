-- Commercial activation remains a platform-only operation. This RPC closes
-- onboarding only after identity proof and module-specific readiness checks.

create table if not exists commercial_activation_audit(
 id bigint generated always as identity primary key,
 office_id uuid not null references offices on delete cascade,
 modules app_module[] not null,
 activated_by uuid references auth.users,
 reason text not null,
 metadata jsonb not null default '{}',
 created_at timestamptz not null default now()
);

create or replace function activate_commercial_modules(
 p_office uuid,p_modules app_module[],p_activated_by uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 requested app_module;
 selected_offer text;
 setup nfse_onboarding_setups;
 activated text[]:='{}';
begin
 if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 if p_office is null or coalesce(array_length(p_modules,1),0)=0
  or char_length(trim(coalesce(p_reason,''))) not between 5 and 500
  or not exists(select 1 from offices where id=p_office)
 then raise exception 'invalid_commercial_activation'; end if;

 perform pg_advisory_xact_lock(hashtextextended(p_office::text,0));
 if not exists(select 1 from office_legal_entity_links l join legal_entities e on e.id=l.legal_entity_id
  where l.office_id=p_office and l.relationship='owner' and l.status='active'
   and e.identity_verified_at is not null)
 then raise exception 'verified_owner_required'; end if;

 select offer into selected_offer from offer_interests
  where office_id=p_office and status='pending' order by created_at desc limit 1 for update;
 if selected_offer is null then
  select offer into selected_offer from offer_interests
   where office_id=p_office and status='approved' order by created_at desc limit 1;
 end if;
 if selected_offer is null then raise exception 'commercial_offer_required'; end if;

 foreach requested in array p_modules loop
  if (requested='nfse' and selected_offer not in ('nfse','completo'))
   or (requested='documentos' and selected_offer not in ('documentos','completo'))
  then raise exception 'module_not_in_commercial_offer'; end if;
  if requested='nfse' then
   select s.* into setup from nfse_onboarding_setups s
    join office_legal_entity_links l on l.office_id=s.office_id and l.legal_entity_id=s.legal_entity_id
    where s.office_id=p_office and s.status in ('fiscal_ready','certificate_ready')
     and s.issuer_id is not null and l.relationship='owner' and l.status='active'
    order by s.updated_at desc limit 1 for update of s;
   if setup.issuer_id is null then raise exception 'nfse_fiscal_setup_required'; end if;
   update nfse_issuers set enabled=true where id=setup.issuer_id and office_id=p_office;
   if not found then raise exception 'nfse_issuer_not_found'; end if;
  end if;
  insert into office_modules(office_id,module,status,activated_at,activated_by,revoked_at,reason)
  values(p_office,requested,'active',now(),p_activated_by,null,trim(p_reason))
  on conflict(office_id,module) do update set
   status='active',activated_at=now(),activated_by=p_activated_by,
   revoked_at=null,reason=trim(p_reason);
  activated:=array_append(activated,requested::text);
 end loop;

 update offer_interests set status='approved'
  where office_id=p_office and status='pending';
 update profiles set onboarding_step='ready'
  where office_id=p_office and onboarding_step='commercial_activation';
 insert into commercial_activation_audit(office_id,modules,activated_by,reason,metadata)
 values(p_office,p_modules,p_activated_by,trim(p_reason),
  jsonb_build_object('offer',selected_offer,'nfseSetupStatus',setup.status));
 return jsonb_build_object('officeId',p_office,'modules',activated,'status','active');
end $$;

alter table commercial_activation_audit enable row level security;
revoke all on table commercial_activation_audit from public,anon,authenticated;
revoke all on function activate_commercial_modules(uuid,app_module[],uuid,text)
 from public,anon,authenticated;
grant execute on function activate_commercial_modules(uuid,app_module[],uuid,text) to service_role;

comment on function activate_commercial_modules(uuid,app_module[],uuid,text) is
 'Platform-only commercial approval after verified ownership and module readiness; never callable by browser roles.';
