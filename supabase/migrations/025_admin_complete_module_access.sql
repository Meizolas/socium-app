-- Hierarquia comercial: office_modules habilita o módulo para o escritório;
-- profile_module_access restringe a conta dentro dessa habilitação.
-- Uma permissão individual nunca ativa um módulo suspenso no escritório.
do $$
declare target_user uuid; target_office uuid;
begin
  select id into target_user from auth.users where lower(email)=lower('admin@gmail.com') order by created_at limit 1;
  if target_user is null then raise notice 'admin@gmail.com não encontrado; provisionamento ignorado.'; return; end if;
  select office_id into target_office from profiles where id=target_user;
  if target_office is null then raise notice 'admin@gmail.com sem perfil de escritório; provisionamento ignorado.'; return; end if;

  insert into office_modules(office_id,module,status,activated_at,activated_by,revoked_at,reason) values
    (target_office,'documentos','active',now(),target_user,null,'Conta administrativa com acesso completo ao Socium'),
    (target_office,'nfse','active',now(),target_user,null,'Conta administrativa com acesso completo ao Socium')
  on conflict(office_id,module) do update set status='active',activated_at=coalesce(office_modules.activated_at,now()),activated_by=coalesce(office_modules.activated_by,target_user),revoked_at=null,reason='Conta administrativa com acesso completo ao Socium';

  insert into profile_module_access(profile_id,module,allowed,created_by) values
    (target_user,'documentos',true,target_user),(target_user,'nfse',true,target_user)
  on conflict(profile_id,module) do update set allowed=true;
  update profiles set onboarding_step='ready' where id=target_user;
end $$;
comment on table office_modules is 'Habilitação contratual: o módulo só existe para o escritório enquanto estiver ativo. Gestão exclusiva da plataforma.';
comment on table profile_module_access is 'Regra por conta dentro de um módulo ativo. Negação bloqueia; permissão não ativa módulo inativo no escritório.';
