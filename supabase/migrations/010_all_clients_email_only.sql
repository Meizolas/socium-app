-- Força todos os clientes existentes para envio exclusivamente por e-mail.
-- Migration separada porque a 009 pode já ter sido executada no ambiente.
update public.clients
set preference = 'Somente e-mail'
where preference is distinct from 'Somente e-mail';

alter table public.clients
  alter column preference set default 'Somente e-mail';
