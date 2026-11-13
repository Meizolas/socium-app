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

Aplique as migrations em ordem, inclusive `037_remove_certificate_login.sql`.
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

## 3. Análise cadastral e ativação comercial

O cadastro público cria um tenant isolado com identidade pendente. A equipe não
deve promover uma empresa para titular apenas com base no CNPJ declarado ou no
controle de um e-mail.

Depois da validação cadastral por um procedimento autorizado e da aprovação
contratual, ative os módulos em ambiente administrativo:

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
2. Confirme que o escritório foi criado isoladamente e ficou em análise.
3. Conclua a validação cadastral pelo procedimento administrativo adotado.
4. Preencha o cadastro fiscal e envie um A1 do mesmo CNPJ.
5. Confirme que o módulo continua bloqueado antes da aprovação comercial.
6. Ative o módulo administrativamente.
7. Em homologação, emita uma DPS e valide fila e artefatos.
8. Teste substituição e cancelamento com os certificados adequados.

Nunca registre senha de PFX, chave de custódia, service role ou conteúdo do
certificado em logs.
