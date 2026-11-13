# Implantação do cadastro público e NFS-e

O primeiro acesso utiliza CPF ou CNPJ e senha. O e-mail é mantido apenas para
confirmação, recuperação e alertas de segurança. O documento informado é uma
declaração e não concede propriedade da empresa nem autorização fiscal.

Tanto uma pessoa física quanto uma pessoa jurídica pode atuar como representante.
Essa capacidade é determinada pelo vínculo de representação autorizado, e não
pelo tipo CPF/CNPJ usado para entrar na conta.

O certificado A1 continua sendo utilizado exclusivamente para custódia fiscal,
assinatura, emissão, substituição e cancelamento de NFS-e. Ele não é um método
de login.

## 1. Banco de dados

Aplique as migrations em ordem, inclusive `037_remove_certificate_login.sql` e
`038_self_service_identity_and_representation.sql`.
A migration `034_certificate_authentication.sql` permanece no histórico para
compatibilidade com ambientes que já a executaram; a `037` remove suas tabelas
e funções.

Antes de publicar, confirme que existem as funções
`complete_verified_owner_nfse_setup` e `activate_commercial_modules` e que não
existem mais as tabelas `certificate_auth_challenges`,
`certificate_auth_bindings` e `certificate_auth_exchanges`.

## 2. Aplicação web

Configure no serviço web:

```text
APP_URL=https://app.seudominio.com
NFSE_CUSTODY_KEY_V1=<chave base64 de exatamente 32 bytes>
NEXT_PUBLIC_SUPABASE_URL=<url do projeto>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role; somente no servidor>
```

`NFSE_CUSTODY_KEY_V1` deve ser igual no web e no worker. Trocar essa chave sem
uma rotina de rotação torna os certificados A1 já armazenados inutilizáveis.

Não configure `CERT_AUTH_URL` nem `CERT_GATEWAY_SHARED_SECRET`. O serviço e o
subdomínio exclusivos do antigo gateway podem ser removidos.

## 3. Validação automática e ativação

O cadastro público cria um tenant isolado com identidade pendente. O usuário
envia um A1 cujo CPF/CNPJ deve coincidir com o identificador da conta. Somente
essa correspondência promove o vínculo para titular verificado.

Depois da prova da identidade, o usuário escolhe entre configurar o próprio
emitente ou uma empresa representada. Representantes podem ser pessoas físicas
ou jurídicas. A autorização de representação continua sujeita à procuração ou
ao vínculo legal existente no ambiente nacional.

O fluxo público ativa automaticamente a oferta escolhida quando a identidade e
a forma de assinatura fiscal estiverem prontas. A operação administrativa abaixo
continua disponível para correções, migrações e ativações assistidas:

```bash
npm run activate:commercial -- \
  --office=UUID_DO_ESCRITORIO \
  --modules=nfse \
  --reason="Contrato 123 aprovado"
```

Para a oferta completa, use `--modules=nfse,documentos`. A operação exige
`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` e nunca deve ser exposta ao
navegador.

## 4. Worker NFS-e no EasyPanel

Reconstrua o worker usando `services/nfse/Dockerfile.easypanel` e mantenha:

```text
NFSE_PROVIDER=government_homologation
NFSE_ENVIRONMENT=2
NFSE_WORKER_BACKEND=supabase_rpc
SUPABASE_URL=<url do projeto>
SUPABASE_SERVICE_ROLE_KEY=<service role>
NFSE_CUSTODY_KEY_V1=<mesma chave do web>
NFSE_DPS_XSD=/app/xsd/DPS_v1.01.xsd
NFSE_FISCAL_UTC_OFFSET=-03:00
```

Produção fiscal exige explicitamente `government_production`, ambiente `1` e
`NFSE_ENABLE_PRODUCTION=true`. Teste primeiro em homologação.

## 5. Verificação pós-publicação

1. Crie uma conta com CPF ou CNPJ e senha e confirme o e-mail de recuperação.
2. Envie um e-CPF ou e-CNPJ do mesmo titular usado no cadastro.
3. Para emissão própria, conclua o cadastro fiscal da empresa titular.
4. Para representação, informe a empresa representada e confirme a autorização oficial.
5. Confirme que a oferta foi ativada somente depois da assinatura ficar pronta.
6. Em homologação, emita uma DPS e valide fila e artefatos.
7. Teste substituição e cancelamento com os certificados adequados.

Nunca registre senha de PFX, chave de custódia, service role ou conteúdo do
certificado em logs.
