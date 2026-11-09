-- Fields required by the supported MVP scenario: Brazilian legal-entity
-- provider, identified Brazilian taker, one service, tpAmb=2.
alter table nfse_issuers
  add column simple_national_option text,
  add column simple_national_taxation_regime text,
  add column special_tax_regime text;

alter table nfse_service_profiles
  add column service_country text not null default 'BR',
  add column service_municipality_ibge text,
  add column operation_indicator text,
  add column tax_situation text,
  add column fiscal_confirmed_by uuid references profiles,
  add constraint nfse_service_validity check(valid_to is null or valid_to>=valid_from);

alter table nfse_invoices
  add column unconditional_discount numeric(14,2) not null default 0 check(unconditional_discount>=0),
  add column conditional_discount numeric(14,2) not null default 0 check(conditional_discount>=0),
  add column operation jsonb not null default '{}',
  add column taxation jsonb not null default '{}',
  add column draft_version int not null default 1 check(draft_version>0),
	add column simulation_reference text,
  add constraint nfse_invoice_discounts_check check(unconditional_discount+conditional_discount<=amount);

comment on column nfse_invoices.operation is 'Versioned operator input for location and conditional operation groups; copied into immutable transmission snapshot.';
comment on column nfse_invoices.taxation is 'Versioned tax choices confirmed by the responsible user; never inferred by the worker.';
