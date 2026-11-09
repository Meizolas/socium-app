create table nfse_deliveries(
 id uuid primary key default gen_random_uuid(),
 office_id uuid not null references offices on delete cascade,
 invoice_id uuid not null references nfse_invoices on delete cascade,
 recipient_email text not null,
 status text not null default 'pending_approval' check(status in ('pending_approval','queued','sending','sent','failed','cancelled')),
 idempotency_key text not null,
 attempts int not null default 0,
 last_error text,
 created_by uuid not null references profiles,
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 unique(office_id,invoice_id,idempotency_key)
);
alter table nfse_deliveries enable row level security;
revoke all on nfse_deliveries from authenticated;
grant select on nfse_deliveries to authenticated;
create policy nfse_delivery_read on nfse_deliveries for select to authenticated
using(exists(select 1 from nfse_invoices i where i.id=invoice_id and can_access_nfse_issuer(i.issuer_id)));
comment on table nfse_deliveries is 'Outbox fiscal independente do estado fiscal. Homologação exige aprovação manual e nunca dispara envio automático.';
