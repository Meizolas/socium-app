-- Diferencia guias comuns de parcelamentos e adiciona os templates próprios de e-mail.
alter table public.documents
  add column if not exists document_category text not null default 'GUIA';

alter table public.documents drop constraint if exists documents_category_check;
alter table public.documents add constraint documents_category_check
  check (document_category in ('GUIA', 'PARCELAMENTO'));

create index if not exists documents_office_category_idx
  on public.documents(office_id, document_category);

update public.integration_credentials
set config = config || jsonb_build_object(
  'installmentSubjectTemplate', 'PARCELAMENTO {{competencia_hifen}} - {{cliente_curto}}',
  'installmentMessageTemplate', E'Prezados,\n\nSegue anexa a guia de imposto referente ao parcelamento.\n\n📅 Data de vencimento:\n{{vencimento}}.\n\n--\nAtenciosamente,\nEquipe Socium Contábil.',
  'installmentGroupSubjectTemplate', 'PARCELAMENTOS {{competencias_hifen}} - {{cliente_curto}}',
  'installmentGroupMessageTemplate', E'Prezados,\n\nSeguem anexas as guias de impostos referentes aos parcelamentos.\n\n📅 Datas de vencimento:\n{{vencimentos}}.\n\n--\nAtenciosamente,\nEquipe Socium Contábil.'
)
where provider = 'gmail';
