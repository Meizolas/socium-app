# Constituição Técnica do Socium App

> Documento vivo e fonte de contexto técnico do sistema. Deve ser atualizado na mesma alteração que modificar arquitetura, banco, contratos, fluxos, regras de negócio, integrações, segurança, operação ou comportamento visível.

## 1. Identidade e propósito

O **Socium App** é um MVP interno para um escritório contábil importar guias fiscais em PDF, extrair seus dados por automação, relacioná-las a clientes e entregá-las por e-mail. O sistema oferece visão geral, fila de processamento, cadastro de clientes, alertas, histórico de envios, download em lote e configuração da conta Gmail.

O domínio começou centrado em DAS, mas o extrator e o banco já reconhecem **DAS, DARF, DAM, DAE, GPS, FGTS** e o tipo genérico `GUIA`.

Estado observado em **28/08/2026**:

- a aplicação principal usa dados reais do Supabase;
- o processamento externo depende de um workflow n8n;
- o canal operacional visível é Gmail;
- existe implementação de WhatsApp via Evolution API, mas sua configuração está desativada na interface e bloqueada pela API atual;
- não existe suíte automatizada de testes;
- `node_modules` não estava instalado no ambiente durante este levantamento.

## 2. Como manter este documento

Toda mudança futura deve atualizar, quando aplicável:

1. a seção funcional ou técnica afetada;
2. o catálogo de APIs, entidades ou variáveis;
3. riscos e limitações conhecidas;
4. o **Histórico de mudanças** no fim do arquivo, com data, resumo, arquivos/migrations e impacto;
5. a data do estado observado, caso a mudança altere o retrato atual.

Não registrar segredos, tokens, chaves, CNPJs reais, e-mails reais de clientes ou dados pessoais neste documento. Migrations são cumulativas e não devem ser reescritas depois de aplicadas em ambientes compartilhados; alterações de schema devem entrar em uma nova migration numerada.

## 3. Visão arquitetural

```text
Navegador / React Client Component
        |
        | fetch/XHR a cada ação + polling do dashboard (2 s)
        v
Next.js App Router / Route Handlers (servidor)
        |
        | Supabase service_role
        v
Supabase Postgres + Storage privado (`das-documents`)
        |
        | URL assinada do PDF (1 hora)
        v
n8n -> extração do PDF -> callback autenticado
        |
        +-> associação/criação provisória de cliente
        +-> Gmail OAuth/Gmail API -> destinatários
        `-> Evolution API (código existente, UI desativada)
```

O projeto é um monólito Next.js. Não há uma camada formal de domínio ou repositórios: os route handlers acessam Supabase diretamente e `lib/deliveries.ts` concentra as regras de entrega.

### 3.1 Camadas e responsabilidades

| Camada | Local | Responsabilidade |
|---|---|---|
| Entrada web | `app/page.tsx`, `app/layout.tsx` | Renderiza a aplicação e configura HTML/metadados |
| UI real | `components/real-app.tsx` | Estado, navegação, telas, formulários, polling e chamadas HTTP |
| UI demo legada | `components/app.tsx`, `lib/data.ts` | Protótipo com dados estáticos; atualmente não montado |
| API interna | `app/api/**/route.ts` | Validação, coordenação dos casos de uso e respostas HTTP |
| Infraestrutura | `lib/supabase-server.ts`, `lib/credentials.ts`, `lib/google-oauth.ts` | Supabase administrativo, criptografia e OAuth |
| Entrega | `lib/deliveries.ts` | Templates, MIME, Gmail, Evolution, idempotência e estados de envio |
| Banco | `supabase/migrations/*.sql` | Schema, índices, triggers, bucket e RLS |
| Automação | `n8n/extract-guide.js` | Código de extração usado dentro de um Code node do n8n |
| Apresentação | `app/*.css`, `assets/*` | Estilos globais e referências/imagens |

## 4. Stack e execução

### 4.1 Tecnologias

- **Node.js 20** (imagem Docker `node:20-alpine`).
- **Next.js** com App Router e saída `standalone`.
- **React**, TypeScript estrito e componentes client-side.
- **Supabase JS**, Postgres, Auth referenciado no schema e Storage.
- **n8n** para baixar/ler o PDF e retornar dados extraídos.
- **Google OAuth 2.0 + Gmail API** para envio.
- **Evolution API** para WhatsApp, implementação dormente.
- **SheetJS/xlsx** para planilhas de clientes.
- **JSZip** para downloads compactados.
- **Lucide React** para ícones.
- ESLint com `core-web-vitals` e regras TypeScript do Next.

O `package.json` também declara `react-hook-form`, `@hookform/resolvers`, `zod` e `recharts`, mas o código atual não os importa. Quase todas as dependências usam `latest`; o `package-lock.json` é o mecanismo efetivo de reprodutibilidade.

### 4.2 Comandos

```bash
npm install
npm run dev
npm run lint
npm run build
npm run start
```

O Dockerfile faz instalação limpa (`npm ci`), build em estágio separado e executa o servidor standalone como usuário sem privilégios na porta 3000. O limite de Server Actions é 25 MB, embora os uploads atuais usem route handlers e `MAX_UPLOAD_MB`.

### 4.3 Variáveis de ambiente

| Variável | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do Supabase; apesar do prefixo público, é lida pelo servidor |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Documentada, mas não usada pelo código atual |
| `SUPABASE_SERVICE_ROLE_KEY` | Acesso administrativo ao banco e Storage; segredo de servidor |
| `SUPABASE_OFFICE_ID` | Escritório fixo opcional |
| `OFFICE_NAME` | Nome usado ao criar automaticamente o primeiro escritório |
| `N8N_WEBHOOK_URL` | Endpoint que inicia o processamento |
| `N8N_WEBHOOK_SECRET` | Cabeçalho `x-webhook-secret` enviado ao n8n |
| `N8N_CALLBACK_SECRET` | Valida o cabeçalho `x-callback-secret` do callback |
| `MAX_UPLOAD_MB` | Limite por PDF, padrão 20 MB |
| `CREDENTIALS_ENCRYPTION_KEY` | Deriva chave AES e assina state OAuth; mínimo de 32 caracteres |
| `APP_URL` | Origem pública e fallback da URI OAuth |
| `GOOGLE_CLIENT_ID` | Cliente OAuth Google |
| `GOOGLE_CLIENT_SECRET` | Segredo OAuth Google |
| `GOOGLE_REDIRECT_URI` | URI explícita opcional para callback OAuth |
| `NEXT_PUBLIC_DEMO_MODE` | Presente no exemplo/README, mas ignorada pelo código atual |
| `DATABASE_URL` | Apenas operacional para migrations; não lida pela aplicação |

## 5. Frontend e navegação

`app/page.tsx` sempre renderiza `RealApp`. `components/app.tsx` é uma demonstração/protótipo legado e não é selecionado por `NEXT_PUBLIC_DEMO_MODE`.

`RealApp` é um único Client Component grande. Mantém página ativa, competência, dados, estado de carregamento, alertas e seleção de cliente. Consulta `GET /api/dashboard` ao montar e novamente a cada **2 segundos**. O filtro de competência começa em **Todos** (valor interno vazio); preferências de usuário existentes no banco ainda não são usadas. As telas de importação exigem que uma competência válida `MM/AAAA` seja escolhida antes do upload.

### 5.1 Páginas

- **Visão geral:** métricas de documentos, enviados, processando e com atenção; por padrão considera todas as competências e mostra as 10 importações mais recentes, reunindo guias e parcelamentos; permite filtro por tipo fiscal.
- **Importar Guias:** seleção/drag-and-drop de múltiplos PDFs, progresso individual via XHR e criação de lote classificado como `GUIA`.
- **Importar Parcelamentos:** o mesmo pipeline de upload, n8n, associação e lote, classificado como `PARCELAMENTO` para usar mensagens específicas no Gmail.
- **Processamentos:** busca, seleção múltipla, download ZIP, reprocessamento, envio manual, conclusão do cliente e exclusão.
- **Clientes:** lista, busca, detalhes, cadastro e edição; importação de planilha.
- **Alertas:** pendências ativas e atalho para cadastrar/completar cliente.
- **Envios:** histórico de tentativas por canal e competência.
- **Configurações:** status do Supabase/n8n, conexão/teste do Gmail e templates de e-mail.

Não existe roteamento de páginas por URL; a navegação troca estado local. Recarregar a página volta à Visão geral, exceto o retorno OAuth `?gmail=...`, que abre Configurações.

## 6. Fluxos funcionais

### 6.1 Importação e processamento de guias

1. O usuário escolhe uma competência e PDFs.
2. A UI gera um `batchId` UUID para toda a seleção, define `documentCategory` como `GUIA` ou `PARCELAMENTO` conforme a tela e envia os arquivos **sequencialmente**.
3. `POST /api/documents` aceita apenas MIME `application/pdf`, aplica limite de tamanho e verifica a assinatura inicial `%PDF`.
4. Calcula SHA-256. A restrição `(office_id, hash)` impede reimportação do mesmo conteúdo no escritório.
5. Salva o arquivo como `<officeId>/<uuid>.pdf` no bucket privado.
6. Cria `documents` em `Na fila` e um `processings` relacionado.
7. Gera URL assinada por 3600 segundos e chama o webhook n8n com IDs, nome original, URL, escritório e competência.
8. Registra request/resposta em `attempts`.
9. Ao fim dos uploads bem-sucedidos, a UI chama `POST /api/documents/batch/finalize`, corrigindo `batch_size` para a quantidade realmente recebida.
10. O n8n extrai texto, executa a lógica de `n8n/extract-guide.js` e chama o callback.
11. `POST /api/n8n/callback` valida o segredo, normaliza dados, atualiza documento/processamento, associa cliente e tenta a entrega quando permitido.

Se o insert do documento falhar após o upload, o arquivo é removido. Falhas posteriores preservam documento e arquivo para diagnóstico/reprocessamento.

### 6.2 Extração n8n

O script de referência espera `item.json.text` e produz:

- `type`: DAS, DARF, DAM, DAE, GPS, FGTS ou GUIA;
- `cnpj` e `legalName` do contribuinte, com regras especiais para DAM e DAE;
- `shortName`: até duas palavras significativas, ignorando artigos e sufixos societários;
- `competence` em `MM/AAAA`;
- `dueDate` em `AAAA-MM-DD`;
- `amount` numérico;
- `finalName` sanitizado, normalmente `TIPO - NOME CURTO - MÊS-ANO.pdf`;
- `currentStep: 4`, `progress: 100` e eventual `errorMessage`.

O workflow n8n completo não está versionado: somente o código do nó de extração está no repositório. Download do PDF, parser de texto, encadeamento e chamada do callback precisam ser configurados fora do código.

### 6.3 Identificação e criação de clientes

No callback, o CNPJ é reduzido a dígitos:

- cliente existente: o documento recebe `client_id`;
- cliente ausente, mas CNPJ e razão social extraídos: cria cadastro provisório `auto_created=true`, `active=false`, sem contatos;
- cliente provisório ou sem e-mail/WhatsApp: documento vira `Revisão necessária`, processamento termina e é criado alerta;
- cliente completo: documento vira `Pronto para envio` e segue para entrega automática.

A tela também pode forçar a criação/vinculação provisória por `POST /api/documents/:id/client`.

Ao salvar um cliente, o backend exige CNPJ com 14 dígitos. E-mails adicionais são separados por vírgula, ponto e vírgula ou quebra de linha, normalizados, deduplicados e validados. Um cadastro editado só fica ativo quando tem algum contato. Na implementação atual, ao editar sem contato, `auto_created` continua verdadeiro; ao adicionar contato, torna-se falso.

### 6.4 Importação de clientes por planilha

Aceita arquivo lido pelo SheetJS e usa apenas a primeira aba. Os nomes das colunas são normalizados sem acentos/pontuação. Mapeamentos aceitos:

- CNPJ: `cnpj`, `cpfcnpj`;
- razão social: `razaosocial`, `razao`, `nome`, `empresa`;
- fantasia: `nomefantasia`, `fantasia`;
- responsável: `responsavel`, `proprietario`, `contato`;
- e-mail: `email`, `emailprincipal`, `correioeletronico`;
- telefone: `whatsapp`, `telefone`, `celular`, `fone`.

Linhas inválidas são ignoradas; CNPJs repetidos na planilha ficam com a última ocorrência. O upsert por `(office_id, cnpj)` pode atualizar clientes existentes. Todos entram com preferência `Somente e-mail` e `active=true`, mesmo sem contato.

### 6.5 Entrega individual

`attemptDocumentDelivery` lê a preferência do cliente e deriva canais. Sem cliente ou sem contatos, bloqueia. Para cada canal:

- consulta entregas anteriores `Enviado` para não reenviar pelo mesmo canal;
- Gmail chama `sendGmailDocuments([id])`;
- WhatsApp chama `sendWhatsApp(id)`;
- cada tentativa gera uma linha em `deliveries`;
- o resultado agregado vira `Enviado`, `Parcial` ou `Erro` no documento e no processamento;
- falha total cria alerta crítico.

Embora preferências antigas possam conter WhatsApp, as migrations 009/010 normalizam todos os clientes para `Somente e-mail`, e a tela de Evolution está desativada.

### 6.6 Entrega agrupada

Documentos importados juntos recebem o mesmo `batch_id`. `attemptBatchDelivery` espera alcançar `batch_size` e não haver processamento com texto de status equivalente a fila/aguardando/processando. Depois:

1. exclui documentos com erro, cancelados, em revisão ou sem cliente;
2. agrupa os restantes por `client_id`;
3. ignora documentos já enviados por e-mail;
4. envia um único e-mail por cliente, com múltiplos anexos;
5. atualiza todos os documentos/processamentos do grupo;
6. em falha, grava uma entrega de erro por documento e um alerta para o primeiro.

O agrupamento atual é exclusivamente por e-mail e não consulta a preferência do cliente.

### 6.7 Gmail e templates

O OAuth solicita `openid`, `email` e `gmail.send`, força consentimento e acesso offline. O `state` inclui escritório e expiração de 10 minutos, protegido por HMAC-SHA256. O callback troca o código, consulta o e-mail da conta e guarda o refresh token criptografado.

Para enviar, o servidor troca o refresh token por access token, monta MIME `multipart/mixed` com corpo HTML e PDFs em base64 e chama `gmail/v1/users/me/messages/send`. Destinatários são o e-mail principal mais `additional_emails`, normalizados e deduplicados.

Variáveis suportadas nos templates: `cliente`, `cliente_curto`, `tipo`, `tipos`, `competencia`, `competencias`, `competencia_hifen`, `competencias_hifen`, `quantidade`, `vencimento`, `vencimentos`, `valor`, `valores` e `arquivo`. `cliente_curto` prioriza nome fantasia, depois nome curto extraído e por fim razão social. Markdown limitado (`**negrito**`, `***negrito e itálico***`) é convertido para HTML após escape.

A configuração separa explicitamente assunto e corpo para: uma guia, várias guias, um parcelamento e vários parcelamentos. O entregador escolhe singular/plural pela quantidade de anexos e guia/parcelamento por `document_category`. Um lote misto é rejeitado defensivamente.

### 6.8 Download, exclusão e reprocessamento

- Download recebe até 100 IDs, consulta somente o escritório atual, baixa do Storage e sempre retorna ZIP. Nomes inválidos são limpos e colisões recebem sufixo `(2)`, `(3)` etc.
- Exclusão apaga manualmente tentativas, etapas, entregas, alertas e documento; cascata remove processamentos. Depois tenta remover o objeto do Storage e retorna aviso se só essa etapa falhar.
- Reprocessamento reutiliza documento/processamento, cria nova URL assinada, incrementa o número lógico da tentativa e chama novamente o n8n.

### 6.9 Alertas e notificações

Erros de processamento/envio e cadastros incompletos geram `alerts`. O dashboard retorna apenas alertas sem `resolved_at`, no máximo 20. Abrir as notificações marca como lidos todos os alertas criados até aquele instante. A tabela `notifications` existe, mas a UI atual usa diretamente `alerts`; resolução de alerta ainda não foi implementada.

## 7. Contratos HTTP internos

| Método e rota | Função |
|---|---|
| `GET /api/dashboard` | Agrega clientes, até 100 documentos/processamentos, alertas e entregas |
| `POST /api/documents` | Valida, armazena e inicia processamento de um PDF |
| `DELETE /api/documents/:id` | Exclui documento e dependências |
| `POST /api/documents/:id/retry` | Reenvia documento existente ao n8n |
| `POST /api/documents/:id/send` | Tenta envio individual ou do lote |
| `POST /api/documents/:id/client` | Cria/vincula cliente provisório |
| `POST /api/documents/batch/finalize` | Finaliza tamanho real do lote e tenta entrega |
| `POST /api/documents/download` | Retorna ZIP de até 100 documentos |
| `POST /api/n8n/callback` | Recebe e persiste extração do n8n |
| `POST /api/clients` | Cria ou atualiza cliente |
| `POST /api/clients/import` | Importa primeira aba de planilha |
| `POST /api/alerts/read` | Marca alertas como visualizados |
| `GET /api/settings/integrations` | Lista configurações não secretas e prontidão OAuth |
| `PUT /api/settings/integrations` | Atualiza templates Gmail; rejeita outros providers |
| `GET /api/integrations/gmail/connect` | Inicia OAuth Google |
| `GET /api/integrations/gmail/callback` | Persiste autorização Gmail |
| `POST /api/integrations/gmail/test` | Testa renovação do token |
| `GET /api/logo` | Serve o JPEG da marca |
| `GET /api/development-image` | Serve ícone de recurso em desenvolvimento |

As rotas não possuem versionamento (`/v1`) nem schema compartilhado de request/response. Erros normalmente usam `{ error: string }`.

## 8. Banco de dados

O banco é PostgreSQL via Supabase. As migrations devem ser aplicadas em ordem de `001` a `013`.

### 8.1 Entidades

| Tabela | Papel e relações principais |
|---|---|
| `offices` | Tenant/escritório raiz |
| `profiles` | Usuário do Supabase Auth ligado a um escritório e papel |
| `clients` | Empresa por escritório; CNPJ único; contatos, preferência, ativação e origem automática |
| `contacts` | Modelo normalizado alternativo de contatos; não usado pelo código atual |
| `documents` | Metadados e estado da guia, cliente opcional, hash único, caminho, extração e lote |
| `processings` | Execução do documento, etapa, status textual, progresso, erro e tempos |
| `processing_steps` | Histórico detalhado de etapas; não usado pelo código atual |
| `attempts` | Auditoria das chamadas iniciais/retries ao n8n |
| `deliveries` | Uma linha por tentativa/canal/documento |
| `alerts` | Pendências operacionais, leitura e resolução |
| `audit_logs` | Trilha genérica de auditoria; não gravada pelo código atual |
| `office_settings` | Limites e notificações por escritório; não consumida atualmente |
| `user_preferences` | Sidebar, competência e leitura por usuário; não consumida atualmente |
| `notifications` | Notificação por usuário/escritório; não consumida atualmente |
| `integration_credentials` | Configuração JSON pública ao servidor e segredo cifrado por provider |

### 8.2 Campos centrais de documentos

`documents` mantém nome original/final, hash SHA-256, caminho privado, CNPJ/razão/nome curto extraídos, competência, vencimento, valor, tipo fiscal, categoria de importação, status, `client_id`, `batch_id` e `batch_size`.

`document_type` representa o modelo fiscal extraído (`DAS`, `DARF` etc.). `document_category` representa o fluxo que originou o upload: `GUIA` ou `PARCELAMENTO`. Esses conceitos não devem ser misturados.

O enum `document_status` aceita: `Importado`, `Na fila`, `Processando`, `Revisão necessária`, `Pronto para envio`, `Enviando`, `Enviado`, `Parcial`, `Erro` e `Cancelado`.

`processings.status` é texto livre e contém descrições orientadas à UI. O dashboard privilegia esse texto enquanto `progress < 100`, depois combina status do documento, entregas e estado cadastral.

### 8.3 Integridade, índices e automações

- `(office_id, cnpj)` único em clientes; CNPJ deve ter exatamente 14 dígitos.
- `(office_id, hash)` único em documentos.
- `(office_id, provider)` único em credenciais.
- `document_category` aceita somente `GUIA` ou `PARCELAMENTO` e possui índice por escritório.
- índices cobrem listagens recentes, status, clientes ativos, tipo, CNPJ extraído, cadastros automáticos, alertas não lidos e lotes.
- trigger `set_updated_at` atualiza `documents`, `processings`, `office_settings`, `user_preferences` e `integration_credentials`.
- FKs de processamentos e etapas usam cascata; diversas outras relações não usam, razão pela qual a exclusão de documento é manualmente ordenada.

### 8.4 Multi-tenancy e RLS

`current_office()` resolve o escritório pelo usuário autenticado, e as tabelas possuem políticas RLS por escritório. O bucket exige caminho iniciado pelo `office_id` quando acessado por usuários autenticados.

Entretanto, o runtime atual cria um cliente Supabase com **service role**, que ignora RLS. A separação real nas APIs depende de filtros `.eq('office_id', officeId)` e de `getOfficeId()`. Essa função usa `SUPABASE_OFFICE_ID`; sem ela escolhe o primeiro escritório por criação ou cria um novo. Portanto, o produto atual opera efetivamente como **single-tenant sem sessão de usuário**, apesar de o schema estar preparado parcialmente para multi-tenancy.

## 9. Segurança e privacidade

Controles existentes:

- PDFs validados por MIME, tamanho, assinatura e hash;
- bucket privado e URLs assinadas de uma hora;
- segredos do Supabase/Google/n8n restritos ao servidor por convenção;
- credenciais de integração cifradas com **AES-256-GCM**, IV aleatório e chave derivada por SHA-256;
- state OAuth assinado e temporário;
- callback n8n protegido por segredo compartilhado;
- nomes de arquivo higienizados no download/extrator;
- queries mais sensíveis filtram `office_id`.

Riscos e lacunas atuais:

- não há autenticação/autorização HTTP, middleware ou sessão na UI/API;
- qualquer pessoa com acesso ao app pode consultar ou mutar o escritório selecionado;
- a service role contorna RLS e aumenta o impacto de filtros ausentes;
- o `officeId` contido no state OAuth é aceito após validação criptográfica, sem sessão de usuário;
- não há rate limiting, CSRF explícito, antivírus, validação estrutural profunda do PDF ou proteção contra PDF malicioso no processador externo;
- requests usam validação manual; Zod está instalado/declarado mas não utilizado;
- retenção, descarte e base legal LGPD não estão implementados em código;
- mensagens de erro de infraestrutura podem ser devolvidas ao cliente;
- não há rotação/versionamento de chave para segredos já cifrados;
- dados sensíveis podem aparecer nos payloads registrados em `attempts` e no n8n externo.

Antes de disponibilização pública, autenticação real, autorização por escritório, revisão de uso da service role, logs/auditoria, limites, política LGPD e hardening do pipeline de PDFs são requisitos prioritários.

## 10. Estados e regras operacionais

O estado canônico persistido fica dividido entre `documents.status`, `processings.status/progress` e registros de `deliveries`. A UI deriva um status de exibição:

1. se processamento tem `progress < 100`, mostra seu status textual;
2. depois, entregas bem-sucedidas podem produzir “Enviado no e-mail”, “Enviado no WhatsApp” ou parcial;
3. erro em alguma entrega pode produzir “Erro no envio”;
4. ausência/incompletude cadastral tem precedência final e vira “Cliente não cadastrado” ou “Cadastro incompleto”.

Atenção ao criar novos status: há regexes textuais no frontend e em `attemptBatchDelivery`; renomear frases pode alterar cores ou a detecção de lote pendente.

## 11. Estrutura do repositório

```text
app/
  api/                  Route handlers do backend
  layout.tsx            Layout raiz
  page.tsx              Entrada que monta RealApp
  *.css                 Estilos globais e complementares
assets/                 Logo e referências visuais
components/
  real-app.tsx          Aplicação conectada ao backend
  app.tsx               Protótipo/demo legado não montado
lib/
  credentials.ts        Cifra e leitura de integrações
  deliveries.ts         Gmail, WhatsApp e orquestração de entrega
  google-oauth.ts       Configuração e state OAuth
  supabase-server.ts    Cliente admin, office e erros
  data.ts               Fixtures legadas da demo
  format.ts             Normalização de CNPJ
n8n/extract-guide.js    Código do nó extrator
supabase/migrations/    Evolução cumulativa do schema
storage/.gitkeep        Pasta local legada; não usada pelo fluxo real
specs/constitutions.md  Este documento
```

## 12. Limitações e dívida técnica conhecida

- README ainda descreve modo demo e armazenamento local, divergindo do entrypoint atual.
- A tela de erro pede somente migrations 001/002, mas o comportamento atual depende até a 012.
- `RealApp` e o CSS são monolíticos; separar páginas, hooks, DTOs e serviços reduziria acoplamento.
- Tipos do banco/API são escritos manualmente; não há tipos gerados do Supabase.
- Polling integral a cada 2 segundos recarrega conjuntos grandes e pode escalar mal.
- Dashboard limita documentos/processamentos a 100, mas busca todas as entregas, sem paginação.
- A lista de competências disponíveis no cabeçalho ainda é fixa; novos meses precisam ser adicionados ao frontend ou passar a vir do banco.
- Não há autenticação nem suporte multiusuário funcional.
- Não há endpoint de excluir/desativar clientes, resolver alertas ou editar metadados extraídos.
- `contacts`, `notifications`, `audit_logs`, `office_settings`, `user_preferences` e `processing_steps` estão subutilizadas ou inativas.
- UI contém código morto da Evolution; `saveEvolution` chamaria um PUT que hoje rejeita provider diferente de Gmail.
- Entrega em lote ignora preferência e envia somente por e-mail.
- Finalização de lote não trata explicitamente falha do próprio request no frontend.
- Importação de clientes marca linha sem contato como ativa e não importa e-mails adicionais.
- Não há transações envolvendo banco + Storage + serviços externos; falhas parciais são possíveis.
- O workflow n8n não está completo/versionado e é dependência operacional externa.
- Não há testes unitários, integração, E2E, fixtures de PDFs ou CI versionada.
- Dependências com `latest` tornam atualizações de instalação potencialmente imprevisíveis; preservar o lockfile é obrigatório.

## 13. Convenções para próximas mudanças

- Preservar isolamento por `office_id` em toda consulta/mutação enquanto a service role for usada.
- Nunca expor `SUPABASE_SERVICE_ROLE_KEY`, refresh tokens ou chaves de integração ao browser.
- Usar nova migration idempotente e sequencial para mudanças de banco.
- Manter compatibilidade entre status do banco, regras de entrega e regexes da UI.
- Validar arquivos e entradas no servidor, mesmo quando já validados na UI.
- Registrar falhas externas em `processings`, `deliveries`/`attempts` e `alerts` conforme o caso.
- Garantir idempotência antes de reenvios, especialmente no Gmail.
- Manter arquivos do bucket no padrão `<office_id>/<uuid>.pdf`.
- Rodar pelo menos `npm run lint` e `npm run build` após mudanças executáveis; adicionar testes específicos quando a infraestrutura existir.
- Não fazer commit automaticamente: ao concluir cada feature, fornecer ao usuário um exemplo de mensagem de commit no padrão `tipo(escopo): descrição`, por exemplo `feat(documentos): adiciona revisão manual dos dados extraídos`.

## 14. Histórico de mudanças

### 28/08/2026 — documentação arquitetural inicial

- Analisados frontend, APIs, bibliotecas, migrations 001–012, configuração, Docker, assets e script n8n.
- Criado este `specs/constitutions.md` como fonte de contexto e registro vivo.
- Nenhum comportamento executável, schema ou integração foi alterado.
- Validação: inventário estático completo; lint/build não foram executados porque as dependências não estavam instaladas no workspace.

### 28/08/2026 — importação e mensagens de parcelamentos

- Adicionada a página **Importar Parcelamentos** logo abaixo de **Importar Guias**.
- Reutilizado o pipeline existente de PDF, lote, n8n, cliente, processamento e Gmail.
- Criada a categoria persistente `documents.document_category` para diferenciar guias de parcelamentos sem perder o tipo fiscal extraído.
- Adicionados templates editáveis de parcelamento individual e múltiplo, com assunto e corpo próprios.
- Configurações agora exibem separadamente mensagens de guias e de parcelamentos, incluindo singular e plural.
- Adicionadas variáveis `cliente_curto`, `competencia_hifen` e `competencias_hifen`.
- Criada `supabase/migrations/013_installment_imports.sql`.
- Arquivos principais alterados: `components/real-app.tsx`, `app/api/documents/route.ts`, `app/api/documents/[id]/retry/route.ts`, `app/api/n8n/callback/route.ts`, `app/api/settings/integrations/route.ts`, `lib/deliveries.ts` e este documento.
- Validação: `npm run build` concluído com sucesso. `npm run lint` continua falhando por 6 erros e 7 avisos preexistentes, concentrados no protótipo legado e em regras novas do React/ESLint sobre efeitos; não foram introduzidos erros de compilação pela feature.

### 28/08/2026 — atividades recentes sem filtro mensal padrão

- O filtro global de competência agora inicia em **Todos**.
- A Visão Geral passa a mostrar, por padrão, as 10 importações mais recentes de qualquer competência, reunindo guias e parcelamentos.
- O filtro por mês continua disponível no cabeçalho.
- As telas de importação bloqueiam o envio enquanto não houver uma competência válida selecionada.
- Arquivos alterados: `components/real-app.tsx` e este documento.
