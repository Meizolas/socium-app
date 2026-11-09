insert into auth.users(id,email,email_confirmed_at)
values ('10000000-0000-4000-8000-000000000001','legacy@example.invalid',now());

insert into public.offices(id,name)
values ('20000000-0000-4000-8000-000000000001','Escritorio legado sintetico');

insert into public.profiles(id,office_id,name,role)
values (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Administrador legado',
  'admin'
);

insert into public.clients(id,office_id,legal_name,cnpj,email)
values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Cliente sintetico legado',
  '00000000000191',
  'client@example.invalid'
);
