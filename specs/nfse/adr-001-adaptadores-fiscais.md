# ADR-001 — Adaptadores fiscais e limite de ambiente

Status: aceito em 09/11/2026.

O caso de uso de rascunho/fila é único. `simulated` é um adaptador exclusivamente local, exige `SOCIUM_LOCAL_E2E=true`, `APP_ENV=local|test` e produz `simulated_xml`. `government_homologation` usa SEFIN Produção Restrita, mTLS, DPS 1.01, Postgres, custódia cifrada e Storage privado; produz `official_xml` somente após chave e XML coerentes no retorno. Não há fallback entre adaptadores.

Produção fiscal não é um valor de configuração aceito. O worker governamental exige `NFSE_ENVIRONMENT=2`; o gerador também rejeita `tpAmb` diferente de 2. Um servidor fiscal falso só pode substituir a URL quando `APP_ENV=test` e o destino é loopback.

O limite durável do POST é `mark_nfse_post_started`: grava hash/bytes e fencing token antes da rede. Lease expirado depois desse limite vira resultado desconhecido e reconciliação, nunca novo POST. Revogação bloqueia emissão ainda não transmitida; reconciliação técnica de uma DPS já transmitida continua sem conceder nova emissão.
