-- Múltiplos destinatários e preferência de e-mail como padrão.
alter table public.clients
  add column if not exists additional_emails text[] not null default '{}';

update public.clients
set preference = 'Somente e-mail';

alter table public.clients
  alter column preference set default 'Somente e-mail';
