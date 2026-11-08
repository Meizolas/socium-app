# Prompt para o Codex no VS Code

Copie os arquivos `constitution.md` e `ANALISE_TECNICA.md` deste pacote para a raiz do projeto. Em seguida, abra o repositório atualizado no VS Code e cole o texto abaixo no Codex.

---

Quero evoluir o Socium para uma plataforma modular e implementar NFS-e comercializável independentemente, com cadastro autônomo de contadores. A emissão e a consulta por API já funcionaram em homologação na prova contida em `teste_nfse`. Implemente a primeira versão integrada ao produto, preservando o funcionamento de produção de guias, parcelamentos, clientes, Gmail, n8n e downloads.

## Produto modular e onboarding — parte obrigatória da implementação

Implemente integralmente as seções 3-A, 3-B e 15 da constituição, além das fases abaixo. Uma aplicação, com contas Documentos, NFS-e e Completo; autorizações persistidas por contratante e restrições por usuário/empresa, verificadas no servidor. A conta NFS-e não depende de guias, n8n ou Gmail; Documentos não depende de certificado ou worker. Menus refletem direitos reais; ocultar menus sozinho não atende.

Inclua cadastro público, confirmação de e-mail, login/recuperação, criação transacional e idempotente do escritório e administrador e assistente retomável. Não associar automaticamente a escritório existente por CNPJ. Membros adicionais entram por convite seguro. Oferta escolhida registra intenção; ativação dos módulos cabe à plataforma, com auditoria, sem cobrança automática no MVP. Usuário não pode conceder a si mesmo papel ou módulo comercial.

O assistente deve cadastrar emitentes, dados fiscais condicionais, serviços, tomadores e certificado A1 com senha, por empresa autorizada. “Número fiscal” deve ser decomposto nos campos corretos; a sequência DPS é persistida e reservada atomicamente. Não hardcodificar os dados fiscais dos testes. Implementar upload PFX/P12 seguro nesta versão, backend de custódia cifrada, chaves externas segregadas, rotação e metadados. Não gravar senha/PFX em texto puro, logs, respostas ou navegador persistente. Sem custódia configurada, bloquear upload; não simular sucesso. Validar titular/escopo e não presumir representação de clientes pelo certificado do escritório.

Fase 1 inclui autenticação, cadastro/convite, habilitações comerciais e migração explícita da conta legada com Documentos ativo. Fase 2 inclui tabelas/policies de módulos, onboarding e custódia, além do schema fiscal. Fase 4 inclui página inicial conforme módulos e assistente de cadastro/prontidão. Fase 5 inclui a matriz de testes da seção 15, inclusive APIs diretas, autoelevação, revogação, isolamento e falhas no cadastro/upload. Não relegar esses itens a sugestões futuras.

Documente quem ativa a oferta e como provisionar o administrador da plataforma sem segredo fixo ou conta pública privilegiada. Admin do escritório administra apenas sua equipe/empresas e restrições dentro dos módulos contratados. Reconciliar emissões pendentes mesmo após revogação comercial sem permitir novas transmissões. Atualizar contratos de API, README e ADRs para a plataforma modular. Preservar o escopo de homologação e os limites de ações externas.

## Antes de editar

1. Leia integralmente `constitution.md`, `ANALISE_TECNICA.md`, `specs/constitutions.md`, os AGENTS.md aplicáveis, README, package.json/lockfile, Dockerfile, configurações e migrations existentes. Respeite as instruções explícitas deste pedido e as regras aplicáveis do repositório.
2. Examine `git status` e o diff atual. Não descarte mudanças do usuário, não resete o branch e não reescreva histórico. Não faça commit, push ou deploy automaticamente.
3. Releia os fluxos reais: `app/page.tsx`, `components/real-app.tsx`, `app/api`, `lib/supabase-server.ts`, `lib/deliveries.ts`, `lib/credentials.ts`, `lib/google-oauth.ts`, `lib/format.ts`, `n8n/extract-guide.js` e seu teste.
4. Leia os scripts e XSDs em `teste_nfse`. Use como referência a versão final do assinador, com canonicalização isolada e Signature sem prefixo. As pastas de tentativas anteriores contêm erros conhecidos; não copie uma versão antiga. Não leia/imprima senhas, PFX, chaves privadas ou `.env` real. Para configuração, consulte nomes de variáveis e `.env.example`.
5. Confira o checkout atual e diferenças em relação à análise de 08/11/2026. Não trate o relatório como substituto do código. O snapshot analisado tinha migration 013, importação de parcelamentos e teste n8n; não implemente essas funcionalidades de novo.
6. Execute a baseline em ambiente local sem credenciais externas: build, lint e test:n8n. Registre os resultados; não atribua erros preexistentes à nova feature. Se precisar instalar dependências, preserve lockfiles e evite atualizações gerais.

Faça a análise inicial, registre um plano curto por fases e continue implementando. Não pare apenas em um plano ou em telas com mock. Se uma dependência real externa estiver ausente, implemente e teste tudo que for independente dela, documente a limitação e peça somente a informação indispensável, sem inventar dados fiscais.

## Objetivo e arquitetura

Manter Next.js/TypeScript/React e Supabase. Criar módulo de domínio fiscal próprio, com UI em `components/nfse`, contratos/casos de uso em `lib/nfse`, rotas autenticadas em `app/api/nfse` e núcleo Python/worker privado em `services/nfse`.

A API Next cria rascunhos e enfileira operações em Postgres. O worker Python reserva jobs atomicamente, assina/transmite e reconcilia o resultado. Não executar shell com senha, não depender de `getpass` em produção e não criar segundo servidor público para o PFX. Não adicionar Redis/Kafka/Kubernetes para a fila inicial. Se outra arquitetura for estritamente necessária, documente motivo e impacto em ADR antes de adotá-la.

O módulo começa apenas em homologação e atrás de feature flag desativada por padrão. Produção deve ser bloqueada no servidor. Não enviar nenhuma DPS nem e-mail real durante a implementação sem solicitação explícita para o teste externo concreto. O PFX existente no computador não é autorização automática para usá-lo.

## Fase 1 — Fundamentos e compatibilidade

- Implementar autenticação Supabase e contexto de usuário/escritório/papel no servidor, aproveitando profiles e revisando suas policies para impedir autoelevação de papel/escritório.
- Proteger operações privadas existentes e novas. Substituir o fallback de primeiro escritório nos caminhos autenticados. Preservar o callback n8n máquina a máquina com seu segredo e escopo recuperado do banco.
- Proteger configuração/início/retorno OAuth e vincular state à sessão/usuário e nonce. Não quebrar os tokens Gmail já cifrados nem mudar a chave existente sem migração.
- Endurecer .gitignore/.dockerignore para certificados, segredos, ambientes virtuais e resultados sensíveis; não apagar arquivos pessoais nem reescrever histórico para fazer isso.
- Corrigir os erros de lint de forma localizada. Não remover testes nem silenciar regras globalmente.
- Preservar os oito templates, categorias GUIA/PARCELAMENTO, feedback de duplicidade, parser/teste DARF e Visão Geral de todas as competências.

## Fase 2 — Schema fiscal e consistência

Adicionar migrations após a última já existente, sem editar as históricas. Implementar emitentes, perfis de serviços, tomadores, metadados/referências de certificados, sequência DPS, notas/rascunhos, jobs, tentativas e arquivos fiscais, com índices, RLS, vínculos de escritório e restrições de unicidade.

Um escritório opera várias empresas. `offices` não é sinônimo de emitente. Um emitente pode vincular-se opcionalmente a `clients`; tomador não é automaticamente cliente do escritório. Criar snapshots por versão transmitida. Não colocar CNPJs, certificados ou contatos reais em seeds.

Reservar série/número/ID DPS em transação. Exigir chave idempotente por operação/tenant/emitente/ambiente; vincular ao hash do conteúdo e rejeitar chave reutilizada com dados diferentes. Jobs têm claim/lease persistente. Não usar MAX+1 nem contador no navegador.

## Fase 3 — Núcleo Python e recuperação

Extrair e testar o núcleo funcional da prova, tornando emitente, serviço, tomador, valores, datas e sequência parâmetros tipados. Preservar as correções que permitiram emitir:

- Signature como filha de DPS, namespace padrão XMLDSig sem prefixo;
- canonicalização de subelementos em contexto materializado de namespaces;
- normalização apenas antes de assinar e preservação dos bytes depois;
- perfil RSA-SHA1/SHA1/C14N que funcionou na homologação, versionado e limitado a esse protocolo;
- XSD completo por ambiente, finNFSe e ordem NBS/descrição conforme schema;
- GZip/Base64 e comunicação mTLS para destinos fixos e permitidos;
- separação entre SEFIN e parametrização ADN.

Apenas metadados e referência segura do certificado podem chegar ao banco/UI. Certificado A1 e senha são provisionados no runtime privado do worker. Verificar titular/validade/coerência da chave e não desabilitar TLS. Não suportar A3/nuvem por simulação.

Antes de POST, persistir snapshot, número/ID, hash/bytes e tentativa. Se houver timeout/crash após possível envio, marcar resultado desconhecido e reconciliar pela mesma DPS/chave. Não criar novo número nem reenviar automaticamente. HEAD 404 HTML ou falha de infraestrutura não significa DPS inexistente. Se a API já autorizou e o Storage falhar, recuperar a nota em vez de emitir outra.

Interpretar os retornos reais: HTTP não é sozinho o estado fiscal. Guardar chave e XML oficial coerentes com ambiente, emitente e operação; conferir situação retornada. Preservar rejeições com código, descrição e correlação. Salvar arquivos privados com hash e não reformatação. Criar auditoria sem segredos. Separar falha técnica, rejeição fiscal e pendência de persistência.

## Fase 4 — UI integrada e distribuição

Adicionar NFS-e ao menu real com componentes próprios e visual consistente. Entregar cadastro/configuração de emitentes, serviços e tomadores; rascunho; conferência antes de emitir; lista paginada por emitente/competência/status; detalhe com chave/situação; consulta/reconciliação; download autenticado de XML.

Exibir Homologação permanentemente. Estado desconhecido precisa de orientação de consulta, não botão que emita novamente. Evitar carregar XML/Base64 no dashboard e usar polling somente para jobs ativos. Não crescer indiscriminadamente o componente monolítico existente.

Implementar distribuição fiscal manual com destinatário explícito, template próprio e idempotência de outbox, reaproveitando adaptador Gmail somente com testes. Não tratar XML como PDF, não usar mensagem de cobrança de imposto para NFS-e e não enviar e-mails reais automaticamente em homologação. Falha de envio nunca reemite nota. Manter legado de guias/parcelamentos funcional.

DANFSe só deve ser exibido se o serviço oficial estiver realmente integrado e testado; sem ele, apresentar indisponibilidade e manter o XML acessível. Cancelamento, substituição, produção e importação em lote de emissões ficam fora deste MVP. Não implementar botões fictícios.

## Fase 5 — Testes, operação e documentação

- Adicionar testes offline do domínio/worker e rotas; usar certificados artificiais e fixtures sintéticas.
- Validar assinatura com XMLSec ou outro verificador independente, além de XSD e round-trip dos bytes.
- Testar autorização e isolamento entre escritórios/emitentes, produção bloqueada, titular incompatível, duplo clique, concorrência de numeração, dois workers e payload divergente com mesma chave.
- Cobrir sucesso 201, rejeição 400, nota já existente, 404 HTML, 5xx, timeout após envio, reinício, Base64/GZip/XML inválidos e falha de Storage após autorização.
- Cobrir falha Gmail sem alterar situação fiscal, destinatário distinto de contato de guia e preservação dos templates e parser n8n.
- Preparar banco de teste/migrations limpas e de upgrade com dados sintéticos; não executar SQL em produção. Não chamar a API do governo na suíte de rotina.
- Criar imagem Python separada e configuração local/Compose ou instrução equivalente para web + worker; manter imagem Next e deploy atual compatíveis. Incluir healthcheck, volumes/secrets, shutdown e XSDs, sem certificado no build.
- Documentar variáveis novas com valores fictícios e feature flags. Não presumir que Python já existe no container Node atual.
- Atualizar README, `specs/constitutions.md`, catálogo de APIs, `specs/nfse/plan.md`, `tasks.md` e ADRs relevantes. Documentar também lacunas externas que não puderam ser testadas.

## Critério de conclusão

A primeira versão deve poder rodar localmente com banco de teste e worker, permitir rascunho/validação e executar o fluxo completo com provedor simulado nos testes; o adaptador fiscal real deve estar implementado separadamente e pronto para teste controlado, não substituído por mock no runtime.

Execute build, lint, test:n8n e novos testes. Apresente resultados reais. Se um teste ou migração não puder executar, indique o motivo e o comando pendente; não declare sucesso por inspeção.

Ao terminar, apresente: resumo do comportamento implementado, arquivos e migrations, comandos para executar Node/Python, configurações necessárias sem segredos, evidências dos testes, limitações, roteiro de homologação controlada e exemplo de mensagem de commit. Não faça commit, push, deploy nem emissão externa automaticamente. Continue pelas fases autorizadas sem pedir confirmação para decisões locais reversíveis; só pare por bloqueio concreto de informação ou por ação externa fora do escopo.
