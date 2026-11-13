# Implantação do primeiro acesso e certificado digital

Este roteiro publica o cadastro independente sem transformar CPF/CNPJ declarado
em autorização fiscal. A propriedade da empresa só é ativada depois da validação
do certificado ICP-Brasil pelo gateway mTLS.

## 1. Banco de dados

Aplique, em ordem, as migrations `032` até `036`. Não execute apenas a última:
elas criam a identidade jurídica global, o cadastro público, a autenticação por
certificado, a configuração fiscal e a ativação comercial auditável.

Antes de publicar a aplicação, confirme que existem as funções
`activate_certificate_identity`, `complete_verified_owner_nfse_setup` e
`activate_commercial_modules`.

## 2. Aplicação web

Configure no serviço web:

```text
APP_URL=https://app.seudominio.com
CERT_AUTH_URL=https://cert.seudominio.com/api/auth/certificate/callback
CERT_GATEWAY_SHARED_SECRET=<segredo aleatório de pelo menos 32 caracteres>
NFSE_CUSTODY_KEY_V1=<chave base64 de exatamente 32 bytes>
NEXT_PUBLIC_SUPABASE_URL=<url do projeto>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role; somente no servidor>
```

O `NFSE_CUSTODY_KEY_V1` deve ser igual no web e no worker. Trocar essa chave sem
uma rotina de rotação torna os certificados A1 já guardados inutilizáveis.
Cadastre no Supabase Auth as URLs de retorno da aplicação.

## 3. Gateway mTLS

Publique `certificate-gateway/Dockerfile` em um serviço separado e domínio
exclusivo. Configure `APP_INTERNAL_URL` e o mesmo
`CERT_GATEWAY_SHARED_SECRET` usado pela aplicação.

Monte como secrets/volumes:

```text
/etc/nginx/tls/server/fullchain.pem
/etc/nginx/tls/server/privkey.pem
/etc/nginx/tls/icp-brasil/ca-bundle.pem
/etc/nginx/tls/icp-brasil/crl-bundle.pem
```

O domínio precisa chegar diretamente ao Nginx com TLS passthrough. Um proxy que
encerre TLS antes dele impede que o navegador apresente o certificado. Atualize
ACs e LCRs a partir do repositório oficial do ITI e valide os hashes publicados.

## 4. Ativação comercial

O cliente pode comprovar a empresa e preparar o cadastro fiscal, mas não pode
liberar um produto pago para si. Depois da aprovação contratual, execute em um
ambiente administrativo — nunca no navegador ou no container público:

```bash
npm run activate:commercial -- \
  --office=UUID_DO_ESCRITORIO \
  --modules=nfse \
  --reason="Contrato 123 aprovado"
```

Para a oferta completa, use `--modules=nfse,documentos`. A operação exige
`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, verifica oferta, titularidade e
prontidão fiscal, registra auditoria e só então ativa os módulos. O parâmetro
opcional `--actor=UUID` registra o usuário interno que aprovou a contratação.

## 5. Worker NFS-e no EasyPanel

Reconstrua o worker usando `services/nfse/Dockerfile.easypanel`. Versões que
antecedem as migrations `030` e `031` não conhecem a seleção de certificado para
cancelamento nem o grupo de substituição da DPS.

Mantenha no worker:

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

Produção fiscal requer explicitamente `government_production`, ambiente `1` e
`NFSE_ENABLE_PRODUCTION=true`. Faça primeiro um teste controlado em homologação.

## 6. Verificação pós-publicação

1. Crie uma conta nova e confirme o e-mail.
2. Valide um e-CNPJ pelo gateway.
3. Confirme que um novo escritório isolado foi criado.
4. Preencha o cadastro fiscal e envie um A1 do mesmo CNPJ.
5. Confirme que o módulo continua bloqueado antes da aprovação comercial.
6. Ative o módulo pela operação administrativa.
7. Em homologação, emita uma DPS, acompanhe a fila e valide os artefatos.
8. Teste substituição e cancelamento com certificados adequados.

Nunca use certificados reais em desenvolvimento local ou registre senha de PFX,
chave de custódia, service role ou conteúdo integral do certificado em logs.
