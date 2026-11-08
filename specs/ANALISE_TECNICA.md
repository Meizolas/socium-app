# Análise do Socium e plano de integração NFS-e

Data: 08/11/2026. Base: `sistema-socium(1).rar`, versão atualizada enviada pelo usuário. SHA-256 do arquivo: `da0cd53b5729268f41cce1b05a5a2e43929997ee77f69db11767dd36208bfeb0`.

## 1. Conclusão

É viável adicionar emissão de NFS-e ao Socium. O projeto já fornece cadastro de empresas, armazenamento, APIs, Gmail e acompanhamento operacional. A pasta `teste_nfse` contém o cliente Python que efetivamente emitiu e consultou uma nota em homologação: os retornos arquivados apresentam ambiente 2 e `cStat=100`.

A implementação deve adicionar um domínio fiscal próprio e reaproveitar a interface e a infraestrutura existentes. Não deve transformar uma NFS-e em mais um PDF do extrator nem confundir autorização fiscal com envio de e-mail. A principal lacuna anterior à disponibilização do módulo é a ausência de sessão/autorização no código HTTP atual.

Nenhum código funcional foi editado nesta revisão. Os comandos de verificação foram executados em cópia extraída, sem carregar `.env` real, ler o PFX, chamar n8n/Gmail ou transmitir novas DPS. Foram ignorados ambientes virtuais, dependências empacotadas e histórico Git na análise de código próprio.

## 2. O que a atualização acrescentou

| Mudança confirmada | Arquivos principais | Consequência |
| --- | --- | --- |
| Importação de parcelamentos | `components/real-app.tsx`, rotas de upload/retry/callback, migration 013 | Preservar categoria `GUIA/PARCELAMENTO` e contrato do n8n |
| Quatro combinações de mensagens | `lib/deliveries.ts`, configurações | Guia/parcelamento e singular/plural são decisões independentes |
| Visão geral de todas as competências | `components/real-app.tsx` | Não reintroduzir filtro mensal nessa tela |
| Tratamento visual de duplicados | `components/real-app.tsx`, `app/real.css` | Manter comportamento HTTP 409 |
| Parser específico DARF SENDA | `n8n/extract-guide.js` | Não descartar a correção existente |
| Teste de regressão n8n | `n8n/extract-guide.test.js`, `package.json` | Existe teste automatizado; a afirmação antiga de ausência total está desatualizada |
| Constituição descritiva existente | `specs/constitutions.md` | Deve ser preservada e sincronizada, não substituída silenciosamente |

O achado preliminar sobre o parser da versão anterior não foi tratado como se a atualização não existisse. A nova regressão específica passou; outros formatos continuam dependendo de cobertura própria.

## 3. Arquitetura observada

| Parte | Estado real |
| --- | --- |
| Aplicação | Next.js App Router, React e TypeScript estrito |
| Entrada ativa | `app/page.tsx` monta `RealApp` |
| Interface | `components/real-app.tsx`, 1.571 linhas, páginas por estado local |
| Protótipo | `components/app.tsx` e `lib/data.ts`, não montados pelo entrypoint |
| Dados | Supabase Postgres e bucket privado `das-documents` |
| Acesso ao banco | `supabaseAdmin()` com service role |
| Escritório | `getOfficeId()` escolhe variável de ambiente, primeiro registro ou cria um escritório |
| Automação de extração | n8n externo, somente código do nó extrator versionado |
| Entrega | Gmail OAuth/MIME; Evolution presente, configuração oculta/bloqueada |
| Banco | Migrations 001–013, incluindo RLS e entidades ainda sem uso |
| Deploy | Docker multi-stage Node 20 Alpine, Next standalone, usuário sem privilégios |
| Emissão experimental | Python separado, `cryptography` + `lxml`, execução manual |

Versões do lockfile analisado: Next 16.2.10, React/React DOM 19.2.7, TypeScript 6.0.3, Supabase JS 2.110.7, ESLint 9.39.5 e xlsx 0.18.5. Isso descreve a versão recebida, não uma recomendação de atualização automática.

## 4. Fluxo de produção rastreado no código

1. A UI escolhe categoria e competência, gera `batchId` e faz uploads sequenciais.
2. `POST /api/documents` valida MIME, `%PDF` e tamanho; calcula hash e verifica duplicidade por escritório.
3. O servidor grava PDF privado, documento/processamento, gera URL assinada de uma hora e chama n8n.
4. O callback exige segredo, recupera escritório/documento pelo processamento, normaliza os dados e associa/cria cliente provisório.
5. Cliente incompleto bloqueia envio e gera alerta. Cliente completo pode disparar entrega individual ou agrupada.
6. `lib/deliveries.ts` monta MIME, renova token Gmail, envia anexos e registra tentativas de entrega.
7. O dashboard recompõe estados a cada dois segundos. Download busca PDFs privados e monta ZIP. Exclusão elimina registros relacionados e tenta apagar o objeto.
8. Configurações persistem os oito templates Gmail da versão atual; OAuth guarda refresh token cifrado.

A leitura cobriu UI real e demo, route handlers, bibliotecas, migrations, extrator/teste, CSS/configuração/Docker e prova Python. Não há export completo do workflow n8n, configuração do proxy/EasyPanel, dumps do banco nem evidência das migrations efetivamente aplicadas no servidor. Portanto esta é uma revisão ponta a ponta dos contratos e do código recebido, não um teste integral da infraestrutura em produção.

## 5. Achados priorizados

### F01 — Crítico: autenticação ausente no código da aplicação

Evidência: `lib/supabase-server.ts:3–19`, `app/api/dashboard/route.ts`, rotas de clientes/documentos/configurações e ausência de guardas de sessão nessas entradas. O código usa service role e resolve escritório sem `auth.uid()` ou usuário verificado. RLS no banco não autentica essas requisições administrativas.

Impacto: se não houver uma barreira externa independente, quem alcança as rotas pode consultar dados, alterar clientes, excluir arquivos, iniciar OAuth e disparar envios. Não foi auditado o proxy; a presença ou ausência dessa barreira externa não pode ser concluída pelo RAR.

Ação: implementar sessão e autorização do escritório no servidor, antes de expor emissão/certificados. Validar também papéis e políticas de `profiles`; não permitir autoelevação de papel. Callback n8n continua sendo máquina a máquina, com segredo próprio, não login interativo.

### F02 — Alto: fallback de escritório e isolamento incompleto

`getOfficeId()` pode selecionar o primeiro escritório ou criá-lo durante uma requisição. Funções de entrega consultam documentos por ID e lotes por `batch_id` sem receber explicitamente o contexto do escritório. Algumas rotas filtram antes de chamar essas funções, mas a defesa fica distribuída e fácil de quebrar.

Ação: contexto autenticado obrigatório em funções de negócio; `office_id` derivado de sessão/perfil ou identidade interna confiável. Validar relações escritório/cliente/documento também no banco. Não usar o ID enviado pelo browser como autorização.

### F03 — Alto: certificado e arquivos de ambiente dentro do pacote

O inventário do arquivo atualizado contém um PFX/P12 e dois arquivos de ambiente com valores. Seus conteúdos não foram lidos. `.gitignore` e `.dockerignore` não excluem explicitamente certificados nem toda a pasta de resultados do experimento. `COPY . .` envia arquivos não excluídos ao estágio de build.

Ação: manter segredos fora do repositório e do contexto Docker, montar o certificado em runtime e fornecer apenas referência controlada ao serviço fiscal. Verificar localmente se há arquivos sensíveis rastreados; não apagar, revogar ou rotacionar credenciais automaticamente. Não reproduzir os valores em documentação, fixtures ou logs.

### F04 — Alto: não existe exclusão mútua persistente para envio de e-mails

Em `lib/deliveries.ts:336` e em `attemptDocumentDelivery`, a aplicação consulta entregas já enviadas e depois faz o envio. Duas execuções simultâneas podem passar pela mesma checagem e enviar duas vezes. Além disso, o Gmail pode aceitar o envio e o insert de `deliveries` falhar; a exceção pode parecer falha de envio e permitir repetição.

Ação: outbox/claim transacional, chave idempotente e estado de resultado desconhecido. Preservar ID de mensagem retornado pelo provedor. Não prometer exactly-once externo. No novo módulo, aplicar a mesma disciplina tanto ao POST fiscal quanto à distribuição.

### F05 — Alto: lote depende de textos de status e callbacks repetidos

`attemptBatchDelivery` detecta pendência por `/fila|aguardando|processando/i`; frases como `Arquivo enviado ao n8n — extraindo dados` não correspondem necessariamente à expressão. O callback pode redefinir documento e processamento mesmo após conclusão; não existe deduplicação por evento/tentativa. Essa combinação pode deixar estados regressivos ou liberar trabalho fora da ordem esperada.

Ação: estados estáveis para novos domínios, testes de repetição e concorrência. Corrigir o legado com testes direcionados, sem simplesmente renomear os textos nem reescrever toda a entrega na mesma etapa.

### F06 — Alto: cliente, emitente e tomador não são a mesma entidade

`clients` guarda empresas atendidas pelo escritório, com contatos para guias. O escritório em `offices` é o tenant. Um cliente do escritório pode emitir notas para seus próprios tomadores; o escritório também pode ser um emitente. Não há hoje endereço fiscal, regime, serviço ou certificado por emitente nesse cadastro.

Ação: perfis fiscais de emitentes e tomadores próprios, ambos vinculados ao escritório. `client_id` do emitente pode ser opcional. Nunca enviar automaticamente a nota ao e-mail de guias só porque existe essa associação.

### F07 — Alto: prova de conceito ainda não é serviço fiscal de produção

O teste assina corretamente e tem evidência real de sucesso, mas usa arquivos locais, `getpass`, série/número fornecidos manualmente, sobrescrita de arquivos por ID, ausência de transação de numeração e uma pré-consulta baseada em HEAD 404. Um 404 de infraestrutura não comprova ausência de DPS. Não há reconciliação automatizada por DPS depois de timeout, persistência multiusuário, validação completa do titular, cadeia/revogação ou workflow de autorização.

Ação: preservar a assinatura que funcionou e transformá-la em biblioteca/worker testável. Não chamar o CLI por shell com senha como argumento. Distinguir 201 com documento válido, rejeição fiscal e transporte indeterminado. Após timeout, consultar a mesma DPS antes de repetir; nunca trocar número para contornar erro.

### F08 — Médio: distribuição atual assume PDF de guia

`sendGmailDocuments` força MIME PDF, nome `.pdf`, bucket `das-documents`, assunto de guia/parcelamento e contatos do `client`. `document_category` só aceita `GUIA` e `PARCELAMENTO` na migration 013. O endpoint DELETE remove documento e histórico.

Ação: a emissão deve ter tabelas/arquivos próprios e distribuição fiscal específica. Reaproveitar adaptador Gmail quando for seguro, preservando templates legados. XML não deve ser disfarçado de PDF. NFS-e autorizada não pode ser excluída pelo botão de excluir processamento; cancelamento fiscal é outro caso de uso.

### F09 — Médio: dashboard limitado e polling global

`app/api/dashboard/route.ts` limita documentos e processamentos a 100, mas busca clientes e entregas sem paginação. `RealApp` consulta tudo a cada dois segundos. Métricas refletem janela carregada, não totais globais. Entregas ligadas a documentos fora dos 100 podem aparecer como `Documento removido` sem terem sido excluídas. O map de processamentos pode escolher registro antigo se houver mais de um por documento, pois a tabela não estabelece unicidade e a ordem é decrescente.

Ação: endpoints paginados e filtros de servidor para NFS-e; não adicionar todas as notas e XMLs ao dashboard existente. Resolver agregações do legado de forma incremental.

### F10 — Médio: normalização e validação de entrada frágeis

`lib/format.ts:1` remove qualquer caractere não numérico e trunca em 14 posições. Não confere dígitos verificadores, aceita truncamento e não preserva CNPJ alfanumérico. Planilha pode atualizar contatos existentes por upsert com campos vazios, marca clientes ativos sem contato e não impõe limite de linhas/tamanho. A competência é validada na UI atual, mas não possui validação equivalente forte em todos os endpoints.

Ação: validação fiscal própria no servidor; rejeitar em vez de truncar. Não alterar silenciosamente as chaves históricas dos clientes. Tratar identificadores e novas exigências do leiaute explicitamente. Exibir linhas inválidas da importação e testar a atualização de cadastro sem perda de contatos.

### F11 — Médio: estados de domínio, auditoria e tratamento de falhas

A mesma coluna de documento mistura processamento e entrega; várias gravações Supabase não conferem `.error`. Operações relacionadas não são atômicas, permitindo órfãos após falha parcial. `audit_logs` existe, mas não é preenchido pelo fluxo atual. `apiError` devolve mensagens internas diretamente. Não há timeout explícito na maioria dos fetches externos Next.

Ação: resultado desconhecido é estado real, e não apenas erro genérico. Transações para dados locais, compensação/reconciliação para efeitos externos, auditoria sanitizada e correlation ID. Estado fiscal separado do estado de distribuição.

### F12 — Médio: documentação, lint e cobertura não refletem a versão atual

O README ainda fala em demo e storage local; `app/page.tsx` sempre monta a aplicação real. `specs/constitutions.md` tem histórico útil, mas mistura constatações antigas com mudanças recentes: ainda diz que não existe suíte e que lint tem 6 erros/7 avisos. Na versão atual, a regressão n8n existe e passou; lint retornou 9 erros/8 avisos. Existem apenas testes do extrator, sem cobertura automatizada das rotas, segurança, entregas concorrentes e emissão integrada.

Ação: atualizar os documentos na mesma mudança, corrigir o lint de forma localizada e incluir testes de invariantes fiscais. Não excluir testes nem desabilitar regras globalmente só para obter sucesso.

### F13 — Médio: preferência manual e ativação não são respeitadas integralmente

`attemptDocumentDelivery` usa e-mail como fallback quando a preferência não corresponde a e-mail/WhatsApp, incluindo `Envio manual`. O callback pode chamá-la automaticamente. `attemptBatchDelivery` envia por e-mail sem consultar a preferência, e os caminhos de entrega não fazem uma checagem consistente de `clients.active`.

Ação: distinguir pedido manual de envio de elegibilidade para automação. Testar clientes inativos, sem contato e com preferência manual. Não repetir essas regras no módulo fiscal; homologação começa sem entrega automática.

## 6. Verificação executada nesta versão

| Verificação | Resultado | Limite |
| --- | --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | Sucesso | Instalação em cópia isolada; sem scripts de instalação |
| `npm run build` | Sucesso, inclusive TypeScript | Não valida banco, OAuth nem infraestrutura real |
| `npm run test:n8n` | Sucesso | Um cenário DARF SENDA com duas vias |
| `npm run lint` | Falhou: 9 erros, 8 avisos | `prefer-const`, efeitos React e três imports `require` do teste, entre outros avisos |
| Leitura dos retornos de homologação arquivados | Ambiente 2, cStat 100, nota 1 na emissão e consulta | Comprova o caso testado; não todos os regimes nem produção |
| Leitura do fluxo de assinatura final | Código corrigido presente no pacote | Não foi usado PFX nem feita nova transmissão |

Não foi aplicado SQL em banco compartilhado, iniciado workflow, enviado e-mail, cancelada nota, criado usuário ou feito deploy.

## 7. Arquitetura recomendada para a primeira implementação

Manter Next.js/React/Supabase. Criar `lib/nfse` para contratos/casos de uso, `components/nfse` para UI e `app/api/nfse` para entradas autenticadas. Isolar o núcleo Python em `services/nfse`, aproveitando a implementação comprovada. O processo fiscal será um worker privado com fila persistente no Postgres; o navegador não acessa o certificado nem o worker.

As rotas Next validam sessão e escopo, criam rascunhos e enfileiram trabalho. O worker reserva trabalho atomicamente, gera/assina DPS, transmite, interpreta o retorno, guarda os bytes oficiais e reconcilia consultas. A mesma fila pode servir emissão e consulta, com tipos de job diferentes; não usar uma única ação genérica de retry para tudo.

Para o MVP, não é necessário criar um segundo servidor HTTP público nem adicionar Redis/Kafka/Kubernetes. O transporte entre Next e worker pode ser exclusivamente fila do banco, com credencial de serviço restrita. Cada decisão concreta deve ser registrada em ADR curto. O n8n continua sendo o extrator das guias e parcelamentos; não passa a ser responsável por numeração fiscal nem por custodiar PFX.

## 8. Sequência recomendada

1. Revalidar snapshot local, instruções existentes e baseline. Proteger segredos e documentar o contrato fiscal comprovado.
2. Implementar autenticação/contexto de escritório e corrigir o lint sem regressão nos fluxos existentes.
3. Adicionar schema fiscal e fila transacional em migrations posteriores à 013.
4. Extrair núcleo Python, testes offline independentes, armazenamento seguro e reconciliação.
5. Entregar UI integrada de emitentes, serviços, tomadores, rascunhos, emissão e consulta em homologação.
6. Distribuição manual fiscal com template/destinatário explícitos; homologação não envia e-mails automaticamente.
7. Smoke test controlado de homologação quando solicitado; produção e cancelamento ficam para etapa própria.

O `constitution.md` define as regras permanentes e critérios de aceite. O `PROMPT_CODEX.md` transforma essa sequência em uma tarefa local executável, sem autorizar deploy, SQL em produção ou uso automático dos segredos recebidos.

## 9. Requisito revisado: plataforma modular com cadastro autônomo

Esta seção registra a decisão posterior do responsável pelo produto e amplia o escopo originalmente descrito. É proposta de implementação, não capacidade observada no snapshot. O produto terá uma base compartilhada e três ofertas: Documentos, Emissor NFS-e e Completo. A separação deve existir nos dados de habilitação, APIs, jobs e interface. O código atual, com fallback para primeiro escritório e sem sessão nas rotas, precisa da base de autenticação/isolamento antes dessa comercialização.

Reutilizar `offices` como contratante e `profiles` como vínculo atual usuário/escritório; não é necessário introduzir associação de um usuário a vários escritórios no MVP. Acrescentar habilitações por escritório, restrições por usuário e escopo por emitente. Planos são presets; escolha pública de plano não é autorização. Administração da plataforma ativa módulos; administrador do contratante gerencia sua equipe dentro deles. Migração deve identificar explicitamente o escritório legado e habilitar Documentos, sem conceder NFS-e ou escolher primeiro registro.

O contador cria sua conta com e-mail confirmado, configura o escritório e, quando o módulo estiver ativo, cadastra cada empresa emissora e perfil fiscal. Inscrição municipal, série e numeração DPS têm significados distintos; o assistente pede apenas os campos aplicáveis e o sistema controla sequência/idempotência. O certificado do escritório não é autorização automática para emitir por clientes. O cliente usado como tomador na prova não deve virar emitente por inferência.

Upload seguro de A1/PFX/P12 e senha passa a ser requisito da primeira versão, substituindo o provisionamento administrativo como único caminho e a sugestão anterior de adiar a UI. Requer implementação de custódia cifrada e chaves externas, validação do certificado e do vínculo, metadados sem segredo, trilha de auditoria e substituição. O carregador Python local com `getpass` não atende esse fluxo. Não executar testes com o PFX real durante o desenvolvimento.

Separar prontidão comercial, cadastral, fiscal, certificado e integração. Conta NFS-e não precisa configurar n8n, Gmail ou importar documentos; cadastro de emitente/tomador é independente do legado. Conta Documentos não exige Python/PFX. O módulo fiscal permanece em homologação. Cadastro público do contador não inclui autoatendimento dos tomadores finais.

Prioridade revisada: autenticação e cadastro seguro → permissões modulares e migração legada → configuração/custódia → domínio fiscal e fila → UI por módulos e onboarding → testes da matriz de acesso e do ciclo cadastral. As fases podem ser desenvolvidas localmente com dados sintéticos. Sem edição da aplicação, aplicação de SQL, deploy ou novas chamadas fiscais nesta revisão documental.
