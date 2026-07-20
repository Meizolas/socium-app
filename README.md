# Socium Contábil — Automação DAS

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
