do $$
begin
  if not exists (
    select 1
    from public.profiles p
    join public.offices o on o.id = p.office_id
    where p.id = '10000000-0000-4000-8000-000000000001'
      and p.role = 'admin'
      and o.name = 'Escritorio legado sintetico'
  ) then
    raise exception 'perfil/escritorio legado nao foi preservado';
  end if;

  if not exists (
    select 1 from public.clients
    where id = '30000000-0000-4000-8000-000000000001'
      and office_id = '20000000-0000-4000-8000-000000000001'
      and cnpj = '00000000000191'
  ) then
    raise exception 'cliente legado nao foi preservado';
  end if;
end $$;
