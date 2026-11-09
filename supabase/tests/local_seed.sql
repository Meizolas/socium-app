alter table auth.users add column if not exists encrypted_password text;
insert into auth.users(id,email,email_confirmed_at,encrypted_password) values
 ('10000000-0000-4000-8000-000000000001','nfse.local@example.test',now(),crypt('Local-Nfse-2026!',gen_salt('bf'))),
 ('10000000-0000-4000-8000-000000000003','operador.local@example.test',now(),crypt('Local-Operador-2026!',gen_salt('bf'))),
 ('30000000-0000-4000-8000-000000000003','semmodulo.local@example.test',now(),crypt('Local-SemModulo-2026!',gen_salt('bf'))),
 ('20000000-0000-4000-8000-000000000002','isolado.local@example.test',now(),crypt('Local-Isolado-2026!',gen_salt('bf')))
on conflict(id) do update set encrypted_password=excluded.encrypted_password;
insert into offices(id,name) values('11000000-0000-4000-8000-000000000001','Escritório NFS-e Sintético'),('22000000-0000-4000-8000-000000000002','Escritório Isolado Sintético'),('33000000-0000-4000-8000-000000000003','Escritório Sem Módulo') on conflict do nothing;
insert into profiles(id,office_id,name,role,onboarding_step) values
 ('10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Admin NFS-e Local','admin','ready'),
 ('10000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000001','Operador NFS-e Local','operator','ready'),
 ('30000000-0000-4000-8000-000000000003','33000000-0000-4000-8000-000000000003','Usuário Sem Módulo','operator','ready'),
 ('20000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000002','Admin Isolado Local','admin','ready') on conflict(id) do nothing;
insert into office_modules(office_id,module,status,activated_at) values
 ('11000000-0000-4000-8000-000000000001','nfse','active',now()),('22000000-0000-4000-8000-000000000002','nfse','active',now())
on conflict(office_id,module) do update set status='active';
