# Helians — Plataforma contábil

MVP em Next.js para importar PDFs DAS em lote, acompanhar o processamento e administrar clientes e alertas. A interface segue as referências visuais em `assets/` e inicia em modo demonstração, sem depender de serviços externos.

## Executar

Requer Node.js 20 ou superior.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Acesse `http://localhost:3000`. Em demonstração, os dados fictícios ficam no frontend e uploads válidos são armazenados em `storage/` (ignorado pelo Git). Configure `NEXT_PUBLIC_DEMO_MODE=false` para integrar a persistência real.

## Supabase

1. Crie um projeto e execute `supabase/migrations/001_initial.sql` no SQL Editor.
2. Preencha as variáveis Supabase de `.env.local`.
3. Crie o primeiro escritório e perfil vinculando `profiles.id` ao usuário do Auth.

A migration inclui todas as entidades, bucket privado e RLS por escritório. Use somente dados fictícios em desenvolvimento. Chaves de serviço nunca devem usar o prefixo `NEXT_PUBLIC_`.

## Integração n8n

Preencha `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET` e `N8N_CALLBACK_SECRET`. Ao importar, `POST /api/documents` valida assinatura e tamanho do PDF, cria nome aleatório e envia ao webhook:

```json
{"documentId":"uuid","processingId":"uuid","originalName":"arquivo.pdf","filePath":"uuid.pdf","officeId":"demo-office","competence":"07/2026"}
```

O segredo sai no cabeçalho `x-webhook-secret`. O n8n deve chamar `POST /api/n8n/callback` com `x-callback-secret` e corpo contendo `processingId`, `cnpj`, `legalName`, `competence`, `dueDate`, `amount`, `finalName`, `clientFound`, `emailStatus`, `whatsappStatus`, `currentStep` e `errorMessage`. Sem URL configurada, o endpoint retorna estado simulado para a interface demo.

## Verificação

```bash
npm run lint
npm run build
```

PDFs são verificados por MIME, limite e assinatura `%PDF`; hashes SHA-256 detectam duplicidade antes do envio. Para produção, substitua o armazenamento local pelo bucket privado e gere URLs assinadas de curta duração para o n8n. Defina retenção, base legal, controle de acesso e descarte de dados segundo a política LGPD do escritório.
# Fluxo NFS-e local integrado

O modo abaixo é exclusivamente local e usa provedor marcado como `SIMULATED_LOCAL`. Ele é bloqueado quando `NODE_ENV=production`, quando `APP_ENV` não é `local/test` ou quando `SOCIUM_LOCAL_E2E` não está explicitamente ativo.

```powershell
npm install
python -m pip install -r services\nfse\requirements.txt
.\scripts\setup-local.ps1
.\scripts\run-local-web.ps1
# em outro terminal
.\scripts\run-local-worker.ps1
```

Abra `http://127.0.0.1:3100` e use `nfse.local@example.test` / `Local-Nfse-2026!`. O certificado fica em `.local-data\fixtures\synthetic.pfx`, com senha `Synthetic-2026!`. Todos esses dados são sintéticos e não devem ser reutilizados fora do ambiente local.

O roteiro pelas telas é: entrar → escolher Emissor NFS-e → Cadastros fiscais → cadastrar emitente, perfil de serviço e tomador → Configurações → adicionar o certificado sintético → Emitir NFS-e → preencher as seis etapas → Emitir em simulação → aguardar o worker → baixar `nfse-simulada-*.xml`. Esse arquivo contém `NFSeSimulada`, usa o header `X-NFSe-Artifact: SIMULATED_LOCAL` e não é XML oficial.

Contas adicionais: `operador.local@example.test` / `Local-Operador-2026!` testa restrição por emitente; `isolado.local@example.test` / `Local-Isolado-2026!` pertence a outro escritório.

```powershell
.\scripts\test-migrations.ps1
npm run test:nfse
npm run test:n8n
node scripts\test-local-flow.mjs
python scripts\test-local-ui.py
python scripts\test-nfse-fencing.py
```

## NFS-e em homologação governamental

O adaptador `government_homologation` usa o mesmo rascunho e fila Postgres. Ele lê a custódia cifrada, gera a DPS do snapshot, valida no XSD, assina sem alterar os bytes, persiste a evidência antes do POST e armazena o XML retornado em Storage privado. Não existe fallback para simulação. `NFSE_ENVIRONMENT` precisa ser `2`; produção fiscal permanece bloqueada.

No processo privado do worker configure, sem prefixo `NEXT_PUBLIC_`: `NFSE_PROVIDER=government_homologation`, `NFSE_ENVIRONMENT=2`, `NFSE_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NFSE_CUSTODY_KEY_V1` e `NFSE_DPS_XSD`. Inicie com `cd services/nfse` e `python -m nfse.worker`.

A imagem separada inclui os XSDs e healthcheck: `docker build -f services/nfse/Dockerfile -t socium-nfse-worker .`. Injete segredos apenas no runtime; certificado e chave de custódia não entram na imagem.

Não execute o worker com certificado real sem autorização explícita. Antes do primeiro teste controlado, confira os artefatos em `specs/nfse/matriz-campos-dps.md`, revise o snapshot e acompanhe uma única DPS. Timeout ou queda após o limite de POST cria reconciliação; não reserva outro número e não reposta automaticamente.

## NFS-e em produção governamental

Produção é um modo separado e explícito. Configure o servidor web e o worker privado com `NFSE_PROVIDER=government_production`, `NFSE_ENVIRONMENT=1` e `NFSE_ENABLE_PRODUCTION=true`, além de `NFSE_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NFSE_CUSTODY_KEY_V1` e `NFSE_DPS_XSD`. O CNPJ emitente, certificado A1, parametrização municipal e dados fiscais precisam ser reais e coerentes.

Após a SEFIN autorizar, o worker preserva o XML oficial retornado e consulta o DANFSe pela chave de acesso. Somente uma resposta PDF válida é salva como `official_pdf`; o gerador PDF local nunca é usado nesse modo. Ativar essas variáveis permite emissão com valor fiscal real.

Módulos são provisionados administrativamente por `office_modules`. Escolher uma oferta registra interesse, mas não concede acesso. O administrador do escritório não pode ativar módulos comerciais para si.
