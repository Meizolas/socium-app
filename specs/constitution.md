# Constituição de evolução do Socium e do módulo NFS-e

Versão 1.1 — 08/11/2026.

## 1. Propósito, aplicação e documentos existentes

Esta constituição orienta a implementação do módulo NFS-e no Socium existente. Sua finalidade é reduzir preenchimento repetitivo, permitir emissão e consulta pelo sistema e acompanhar o documento fiscal até sua distribuição, preservando importação de guias e parcelamentos.

O arquivo `specs/constitutions.md` já existe e deve ser lido integralmente. Ele contém o retrato arquitetural e histórico do produto, além de convenções válidas. Este `constitution.md`, na raiz, estabelece as regras normativas para a evolução fiscal. O documento em `specs` deve continuar descrevendo fielmente o que está implementado; este arquivo não transforma requisitos futuros em funcionalidades existentes.

Em toda mudança, manter os dois documentos coerentes, adicionar histórico real e registrar decisões de arquitetura. Se o checkout divergir desta análise, prevalecem os fatos verificados no código; atualizar o planejamento e documentar divergências. Instruções explícitas do responsável pelo projeto continuam prevalecendo. Não eliminar o histórico nem substituir o projeto por uma aplicação nova.

## 2. Base arquitetural que deve ser preservada

1. Manter Next.js App Router, React, TypeScript e Supabase Postgres/Storage.
2. A UI ativa parte de `app/page.tsx` e `components/real-app.tsx`. `components/app.tsx` e `lib/data.ts` são protótipos, não o local de implementação do módulo real.
3. Preservar importação de guias e parcelamentos, categorias `GUIA/PARCELAMENTO`, hash de duplicidade, cadastro provisório, processamento n8n, downloads, alertas e oito campos de templates Gmail.
4. Preservar a Visão Geral sem filtro mensal, o feedback HTTP 409, os templates singular/plural e a regressão DARF SENDA.
5. Não reativar WhatsApp/Evolution nem criar portal de clientes nesta etapa. Não migrar para Java, outro banco ou outro framework.
6. Manter a aparência do Socium, CSS e componentes existentes. Extrair apenas os componentes compartilhados necessários; não reformular todas as telas.
7. Reutilizar o núcleo Python da prova em um worker privado. Não portar assinatura para TypeScript na primeira versão só por uniformidade de linguagem.
8. O n8n permanece responsável pela extração de guias; não será o emissor fiscal nem o custodiante de certificados.

## 3. Escopo inicial e limites

A primeira entrega funcional cobre cadastro autônomo de contratantes e usuários autorizados de cada escritório, perfis de emitentes, serviços aprovados pelo contador, tomadores nacionais identificados, rascunhos, validação, emissão individual e consulta em homologação, XML oficial e acompanhamento de falhas. Um primeiro perfil pode usar serviços contábeis do Simples, sem converter esse enquadramento em regra universal.

Ficam fora da primeira entrega: cancelamento/substituição, emissão fiscal em produção, lotes de emissão por planilha, cálculo tributário universal, importação de todas as notas históricas do ADN, portal de autoatendimento de tomadores finais e WhatsApp. A arquitetura pode comportá-los, mas a interface não deve simular funcionalidades ausentes.

Download do XML faz parte do escopo. DANFSe deve usar serviço oficial quando integrado e testado; enquanto não estiver disponível, indicar indisponibilidade. Não fabricar PDF com aparência de documento oficial nem bloquear autorização já obtida por falha no PDF.

O desenvolvimento local e testes automatizados estão autorizados pelo prompt de implementação. Eles não autorizam SQL no Supabase de produção, publicação, push/commit automático, envio de e-mails reais, uso de certificados reais ou novas emissões externas sem solicitação explícita para esse teste concreto.

## 3-A. Produto modular e acesso independente — obrigatório

O produto terá uma única base de código e autenticação compartilhada, com módulos comercializáveis independentemente. Não duplicar aplicações nem condicionar regras a e-mails ou CNPJs fixos. `offices` representa o contratante (tenant); o contratante pode operar várias empresas emissoras. Usuário, contratante, emitente e tomador são entidades distintas.

| Oferta | Módulos disponíveis | Experiência após login |
| --- | --- | --- |
| Socium Documentos | `documentos` | Guias, parcelamentos e recursos atuais autorizados |
| Emissor NFS-e | `nfse` | Configuração fiscal, emissão e consulta, sem telas de guias |
| Completo | `documentos`, `nfse` | Os dois módulos com navegação própria |
| Sem módulo ativo | Nenhum | Cadastro, situação de acesso e suporte, sem operações de módulos |

Planos são presets comerciais. A autorização efetiva vem dos módulos persistidos do contratante, das restrições do usuário, do papel e do escopo de empresas. Separar habilitação comercial, feature flag operacional e configuração técnica: uma flag não concede acesso comercial e a contratação não significa que o ambiente fiscal está pronto.

Implementar `office_modules` ou equivalente com unicidade por escritório/módulo e status. Restrições individuais podem usar `profile_module_access` ou equivalente: ausência de restrição herda o contratante; negação individual impede acesso; concessão individual nunca habilita módulo desativado no contratante. Módulos desconhecidos ou sem habilitação explícita ficam bloqueados. O administrador do contratante gerencia sua equipe e seus emissores, mas não pode autoconceder módulos comerciais. Provisionamento comercial cabe à administração da plataforma com trilha de auditoria; não implementar cobrança recorrente nesta etapa.

Aplicar autorização no servidor, RLS e serviços, além de ocultar menus. Proteger `/api/dashboard`, clientes, uploads, downloads, envios, templates e integrações legadas pelo módulo apropriado. Compartilhar cadastros somente por contratos explícitos com projeção mínima; não entregar todo o dashboard de documentos à conta NFS-e. Responder 401 sem sessão, 403 sem módulo/papel e 404 para recursos fora do escopo quando apropriado. Nunca aceitar `office_id`, papel ou módulos enviados pelo navegador como autorização.

A conta NFS-e deve funcionar sem configurar n8n, importar guias ou conectar Gmail. A conta Documentos deve funcionar sem Python, PFX ou configuração fiscal. Gmail é opcional para distribuição fiscal. O cadastro fiscal de emitente e tomador não depende da criação de guia nem de vínculo obrigatório com `clients`. Uma indisponibilidade de worker deve aparecer apenas nas operações fiscais afetadas.

Na migração, habilitar `documentos` explicitamente para o escritório legado identificado por configuração revisável, mantendo `nfse` desativado até habilitação deliberada. Não selecionar o primeiro escritório. Vincular o administrador existente antes de exigir login, testar o caminho de recuperação e documentar rollout/rollback para evitar bloqueio do acesso atual. Não inventar credenciais nem executar essa migração em produção automaticamente.

Ao revogar acesso, bloquear novas operações imediatamente, inclusive em jobs ainda não transmitidos. Preservar arquivos, histórico e auditoria. Operações já transmitidas com resultado desconhecido precisam de reconciliação técnica limitada mesmo após revogação; essa recuperação não autoriza nova emissão. Definir recuperação/exportação administrativa sem exposição a usuários não autorizados.

## 3-B. Cadastro autônomo e configuração do contador — obrigatório

O fluxo inicial inclui criação da própria conta, confirmação de e-mail, login, recuperação de senha e assistente de configuração retomável. Cadastro público do contador é parte deste escopo; isso não cria um portal para os tomadores finais das notas. Provisionamento administrativo por convite pode coexistir para a migração e pilotos.

1. **Conta pessoal:** nome, e-mail e senha tratados pelo Supabase Auth. Nunca usar a senha do Portal Nacional nem compartilhar um login entre membros da equipe.
2. **Contratante:** criar escritório isolado e vínculo de administrador em transação/idempotência. O usuário não escolhe um `office_id` preexistente pelo CNPJ. Inscrição pública com mesmo CNPJ não concede acesso ao escritório existente; solicitar convite/verificação de titularidade por fluxo controlado. Tratar reenvios, confirmação de e-mail e falhas parciais sem criar escritórios duplicados.
3. **Oferta:** apresentar Documentos, NFS-e ou Completo e registrar interesse. No MVP, ativação comercial é administrativa; escolher uma oferta na tela não altera permissões. Exibir pendência de ativação com clareza. Pode-se concluir a configuração fiscal após ativação do módulo, sem depender de faturamento automatizado.
4. **Empresa emissora:** CNPJ, razão social, município/código IBGE, dados cadastrais exigidos pelo contrato fiscal, regime tributário e inscrição municipal quando aplicável. “Número fiscal” não será campo genérico obrigatório: distinguir inscrição municipal, série e número da DPS. Série/numeração são controladas pelo sistema, com configuração inicial e prevenção de colisões; não pedir ao usuário um novo número a cada emissão.
5. **Perfil fiscal:** serviços/códigos, tributação, retenção, demais campos efetivamente exigidos e vigência. Campos condicionais precisam de descrição e validação; não aplicar 6%, Simples ou serviço contábil a todos. A seleção final é confirmada pelo responsável fiscal.
6. **Certificado A1:** administrador autorizado envia `.pfx`/`.p12` e senha por HTTPS em formulário dedicado. Não salvar em localStorage, analytics, logs ou JSON genérico de configurações. A senha só pode permanecer em memória durante a entrada; limpar o formulário após envio. Backend valida tamanho/formato, abertura, chave correspondente, validade e compatibilidade com emitente/representação suportada. Não presumir que certificado do contador permite emitir por qualquer cliente. MVP suporta titular compatível com emitente; representação por procuração exige suporte e validação próprios, sem bypass.
7. **Custódia:** implementar upload seguro nesta primeira versão, não adiar. Cifrar certificado e senha com criptografia autenticada e chaves segregadas, preferencialmente gerenciadas por cofre/KMS, fora do banco de negócio. Guardar somente referência e metadados nas tabelas comuns. Worker recebe acesso mínimo e decifra apenas em runtime; nunca disponibilizar download de PFX/chave/senha. Se faltar a chave/configuração de custódia, bloquear upload com mensagem clara; não cair em texto puro. Prever substituição, expiração, revogação de uso, auditoria e eliminação de versões não utilizadas conforme política documentada. Backup não pode tornar o segredo legível sem a chave.
8. **Prontidão:** exibir estados separados de conta, contratação, cadastro fiscal, certificado, worker e ambiente. Emitir só após todos os requisitos; dados incompletos podem ficar como rascunho. Login bem-sucedido ou certificado carregado não comprova autorização fiscal nem emissão. Homologação é o único ambiente liberado nesta etapa.

O certificado do escritório é usado quando ele próprio for o emitente. Para clientes emissores, manter cadastro, autorização e certificado compatíveis por empresa; o tomador GMS de um teste não se torna automaticamente emitente. Não reutilizar dados ou certificados reais dos testes como seeds. Cadastro público deve ter limites de abuso, respostas que evitem enumeração de contas e isolamento desde a criação.

## 4. Contexto autenticado e isolamento

1. Exigir identidade verificada no servidor para dados privados e mutações. Usar Supabase Auth e o vínculo `profiles` com escritório/papel, sem segredo compartilhado no JavaScript do navegador.
2. Criar um contexto explícito `{userId, officeId, role, effectiveModules, issuerScope}` e passá-lo aos casos de uso. O escritório deve vir do vínculo validado, nunca apenas de body, query, header do browser ou primeiro registro de `offices`.
3. Remover o fallback de `getOfficeId()` das operações de usuário protegidas. Provisionamento inicial é uma operação administrativa explícita, não efeito colateral de uma consulta.
4. Service role, se necessária, fica somente no servidor/worker. Ela ignora RLS; portanto não substitui autorização e exige validação explícita de escopo. Preferir cliente vinculado ao usuário para operações compatíveis com RLS.
5. Isolar dados por escritório e, no domínio fiscal, por emitente e ambiente. Garantir no banco e na aplicação que tomador, certificado, serviço, nota e job pertencem ao contexto autorizado.
6. Papéis mínimos: administrador pode gerenciar perfis/certificados; operador autorizado pode preparar e emitir para empresas permitidas. Nenhum usuário deve editar seu próprio papel/office via policy genérica de `profiles`.
7. Proteger configurações e início OAuth; vincular state à sessão/usuário, prazo e nonce consumível. Não aceitar associação Gmail a escritório apenas porque o state tem HMAC.
8. O callback n8n usa autenticação máquina a máquina existente e deriva escritório pelo processamento do banco. Preservar o contrato externo; não exigir cookie de usuário no callback. Acrescentar validação/idempotência compatíveis.
9. Acesso entre worker e banco usa identidade técnica de escopo mínimo. Não expor o worker à internet nem ao navegador. Não criar endpoint genérico que aceite SQL, caminho de certificado ou URL externa fornecida pelo usuário.
10. Rotas mutantes com cookie precisam de proteção contra requisições de outra origem, além de autorização, limites de corpo e rate limiting apropriados.

## 5. Modelo de domínio fiscal

Não reutilizar `documents.status` como estado de autorização de NFS-e. Não tornar a NFS-e uma categoria aceita automaticamente pelo pipeline atual de guias.

Modelo mínimo sugerido, com nomes finais consistentes no repositório:

| Entidade | Responsabilidade e restrições |
| --- | --- |
| `nfse_issuers` | Empresa emitente do escritório; identificação fiscal, município, regime, habilitação; `client_id` opcional |
| `nfse_service_profiles` | Código nacional, NBS, descrição, ISS/retenção/regimes e dados aplicáveis, versão/vigência e revisão fiscal |
| `nfse_takers` | Identificação e cadastro fiscal do tomador, separado dos contatos do cliente do escritório |
| `nfse_certificates` | Metadados, titular, validade, referência segura e status; sem chave privada/PFX/senha em texto claro |
| `nfse_sequences` | Próximo número por escritório, emitente, ambiente e série; reserva transacional |
| `nfse_invoices` | Rascunho, número/ID DPS, ambiente, snapshots de dados, situação fiscal, chave oficial e metadados |
| `nfse_jobs` | Fila durável de emissão/consulta/reconciliação, prioridade, lease/claim, tentativas e tempos |
| `nfse_attempts` | Tentativa fiscal imutável com correlação, hash/payload, resposta e classificação |
| `nfse_files` | Referências privadas a DPS, XML oficial, respostas e eventual DANFSe; hash/tamanho/tipo |
| `nfse_deliveries` ou outbox equivalente | Destinatário/canal/situação próprios, separados da autorização fiscal |

`offices` representa o escritório operador, não obrigatoriamente o prestador de todas as notas. Um escritório pode operar vários emitentes. O tomador de uma empresa emitente não vira automaticamente um `client` do escritório. Endereço e contatos podem ser reaproveitados somente com vínculo explícito e validação.

Usar identificadores externos como texto. CNPJ/CPF não podem ser truncados, convertidos em número ou perder zeros. Manter uma política explícita para validação do formato suportado, incluindo evolução alfanumérica; não alterar de forma destrutiva o cadastro legado para obter compatibilidade imediata. Rejeitar formatos não suportados com mensagem clara.

Valores monetários devem ser decimal no banco e `Decimal` no Python ou centavos/strings decimais nos contratos; não calcular tributos com ponto flutuante binário. Competência é data civil; instantes de auditoria são timestamps com fuso. Apresentação usa `America/Sao_Paulo`.

## 6. Regras fiscais e configuração

1. Perfil fiscal é configurável por emitente/serviço/competência e validado pelo responsável contábil. Códigos não são inferidos por IA para transmitir automaticamente.
2. Distinguir código nacional, código municipal e NBS. Validar formato e regras do leiaute correspondente.
3. Percentual aproximado de tributos do Simples não é alíquota de ISS nem de IBS/CBS. Não copiar 6% como padrão global.
4. Não presumir que todo Simples tem a mesma apuração municipal, ausência de retenção ou dispensa de campos. Consultar parâmetros e validar configurações aplicáveis.
5. Campos IBS/CBS, finalidade e ordem dos elementos seguem o leiaute do ambiente. Um XSD válido só comprova estrutura, não correção fiscal nem autorização cadastral.
6. O exemplo real de logística é referência de estrutura, nunca perfil tributário do escritório. Identificadores, contatos e dados reais da prova não viram seeds/migrations de produção.
7. Criar snapshots versionados de emitente, tomador, serviço e valores em cada versão transmitida. Alterar um cadastro não modifica uma nota já autorizada.
8. A UI deve mostrar resumo com empresa, tomador, ambiente, competência, descrição, valor e retenção antes da confirmação de emissão. Não expor tags técnicas onde elas não ajudam o operador.

## 7. Contrato de integração e assinatura comprovada

A evidência local do projeto demonstra emissão e consulta em ambiente 2 com NFS-e `cStat=100`, não habilitação geral de produção. Preservar como referência técnica a versão final de `teste_nfse/teste_nfse.py`, não as tentativas antigas.

Para o perfil que funcionou no teste:

- namespace DPS: `http://www.sped.fazenda.gov.br/nfse`;
- DPS/infDPS com `Id` único e referência XMLDSig `#<Id>`;
- assinatura RSA-SHA1 e digest SHA1, C14N 1.0 sem comentários e transform enveloped-signature;
- `Signature` filha de `DPS`, com namespace padrão XMLDSig, sem prefixo `ds:`; o teste com prefixo foi rejeitado com E1228;
- materializar o contexto de namespaces ao canonicalizar subelementos, conforme correção final que superou E0714;
- remover apenas indentação sem significado ANTES de assinar; nunca reformatar, indentar ou reconstruir o XML depois de assinado;
- incluir certificado final na assinatura; proteger chave privada localmente;
- validar XSD, hash e assinatura independentemente, sem depender só do próprio assinador;
- transmitir os mesmos bytes assinados em GZip/Base64 no campo `dpsXmlGZipB64`.

SHA1 aqui é um requisito de compatibilidade do perfil fiscal comprovado, não padrão para senhas, tokens, criptografia geral ou novos serviços. SHA256 continua adequado para hashes de evidência/idempotência. Versionar o perfil e alterar algoritmo somente com documentação/contrato e teste correspondente; não alternar algoritmos por tentativa automática.

Destinos de homologação comprovados:

- SEFIN: `https://sefin.producaorestrita.nfse.gov.br/SefinNacional` para DPS/NFS-e;
- parâmetros: `https://adn.producaorestrita.nfse.gov.br/parametrizacao`;
- emissão: POST `/nfse`; consulta por chave: GET `/nfse/{chave}`;
- consulta de existência/resultado por identificador DPS conforme o contrato real de HEAD/GET `/dps/{id}`; testar o retorno real e não presumir que a resposta tem o mesmo nome de campo do Swagger.

Não usar a rota antiga de parâmetros municipais dentro da SEFIN, não confundir URL de documentação com base operacional e não aceitar redirecionamento automático de certificado para outro host. Endereços devem estar em allowlist do servidor por ambiente.

Manter catálogo versionado de XSDs completos por ambiente, proveniência e hash. Na homologação analisada, `finNFSe=0` é obrigatório e `cNBS` vem antes de `xDescServ`. Essas diferenças não autorizam aplicar o mesmo schema em produção sem validação.

## 8. Fila, concorrência, numeração e reconciliação

1. API Next enfileira uma operação persistida e retorna job/nota; não mantém toda a emissão pendurada em request longa nem depende da aba aberta.
2. Worker recebe job por reserva transacional (`FOR UPDATE SKIP LOCKED` ou mecanismo equivalente com prova de exclusão mútua). Lease, heartbeat e recuperação precisam ser explícitos.
3. Gerar série/número/ID DPS no servidor, atomicamente, com unicidade por emitente/ambiente/série/número. Não usar `MAX+1`, contador no browser ou timestamp sem controle.
4. Duplo clique, requests repetidas e workers simultâneos não podem criar duas emissões para a mesma chave idempotente. Vincular a chave a hash dos dados e contexto; rejeitar reutilização com payload diferente.
5. Congelar e armazenar bytes/hash da DPS assinada e registrar tentativa ANTES de iniciar o POST. Não sobrescrever evidência de tentativa anterior.
6. Se o processo cair ou houver timeout depois de possível envio, marcar `resultado_desconhecido`/`conciliando`. Reinício de worker não autoriza POST automático de novo.
7. Consultar o identificador original até classificar resultado. HEAD 404 isolado, HTML de erro, 5xx, TLS ou timeout não provam ausência da nota. Não incrementar número para escapar de rejeição ou incerteza.
8. Em rejeição fiscal definitiva e ausência comprovada de autorização, permitir correção de rascunho conforme regras do emissor, preservando cada revisão e tentativa. Não editar documento já autorizado.
9. XML oficial/chave obtidos precisam ser recuperáveis mesmo se Storage, banco secundário, PDF ou e-mail falharem depois da autorização. Recuperar persistência pela chave/DPS em vez de reemitir.
10. Retry de consulta é leitura, retry de distribuição é entrega e retry fiscal é decisão controlada; não usar um único botão genérico que execute as três coisas.
11. Implementar timeouts, backoff e limites por operação. Não garantir exactly-once em serviços externos; provar idempotência local e recuperação de resultado desconhecido.

Estados fiscais mínimos: `rascunho`, `validando`, `na_fila`, `transmitindo`, `resultado_desconhecido`, `conciliando`, `autorizada`, `rejeitada`, `falha_tecnica`. A transição para autorizada exige chave e XML oficial coerentes com ambiente/emitente/DPS e interpretação da situação fiscal retornada, não só HTTP 200/201. Erros de persistência após autorização são uma pendência operacional e não apagam o fato fiscal.

## 9. Certificados, arquivos e rastreabilidade

1. O PFX e sua senha não entram em Git, build, imagens Docker, `.env.example`, logs, respostas HTTP ou fixtures. Não incluir caminhos absolutos pessoais como configuração fixa do produto.
2. O fluxo principal é upload seguro pelo administrador do contratante, conforme seção 3-B. Provisionamento administrativo privado pode coexistir para migração, preservando a mesma custódia e auditoria. Não aceitar um caminho arbitrário fornecido pelo browser.
3. Verificar validade, chave correspondente, titular fiscal e finalidade do certificado; não interpretar apenas `CN` ou uma conexão TLS bem-sucedida como validação completa ICP-Brasil. Não desabilitar validação TLS ou revogação para contornar erro.
4. Upload seguro de certificado por UI é obrigatório nesta entrega, restrito ao administrador autorizado e ao emitente permitido, cifrado em repouso e sem download da chave privada.
5. Não reutilizar automaticamente a chave de cifragem Gmail para novos certificados. Documentar segregação/versionamento de chaves e procedimento de rotação sem invalidar integrações existentes.
6. Não prometer suporte A3/token/nuvem com o carregador PFX. A primeira versão suporta A1; demais formatos exigem adaptador próprio.
7. Armazenar documentos fiscais em bucket privado próprio, como `nfse-documents`, com paths por escritório/emitente/ambiente/nota/tentativa. Gerar links de download autenticados e temporários, sem tornar o bucket público.
8. Não alterar bytes oficiais ao salvar; registrar hash, origem, momento, schema e aplicativo/versão. Conservar resposta bruta em área privada com limite de tamanho e acesso apropriado.
9. Registrar ator, escritório, emitente, ambiente, ação, revisão, correlação e resultado na auditoria. Não registrar senha, token, PFX, chave privada, URLs assinadas completas ou payload fiscal integral em logs comuns.
10. Não excluir nota autorizada ou histórico fiscal pela rotina legada de DELETE de documentos. Rascunhos podem ter arquivamento controlado; cancelamento só existe quando o evento fiscal correspondente for implementado e confirmado.

## 10. Distribuição e convivência com guias

A autorização fiscal e a entrega são estados independentes. Uma nota autorizada com falha no e-mail continua autorizada. Falha de envio nunca enfileira nova emissão.

Respeitar preferência manual, cliente inativo e ausência de contatos nas decisões de automação; corrigir o fallback legado com testes, sem interpretar preservação como obrigação de manter o defeito.

Preservar o pipeline atual de guias/parcelamentos e os contratos n8n. O novo módulo não chama o extrator para descobrir o que ele mesmo acabou de emitir.

Na primeira versão fiscal, distribuição é manual e usa destinatário revisado, template NFS-e e anexos com tipo real. Homologação nunca envia automaticamente para clientes reais. Não reutilizar mensagens de cobrança de DAS para notas de serviço. Se a distribuição não estiver implementada, a UI deve informar claramente em vez de simular sucesso.

Reaproveitar um adaptador Gmail compartilhado quando extraído com testes de regressão. Manter a escolha de categoria e singular/plural dos templates existentes. A fila de distribuição deve suportar claim persistente e resultado desconhecido do provedor, guardar o ID de mensagem e não reenviar por falha de persistência sem conciliação.

## 11. UI e contratos de API

Adicionar a entrada `NFS-e` no menu real e implementar telas em `components/nfse`, com contratos tipados em `lib/nfse`. A UI deve conter emitentes/perfis, tomadores, serviços, formulário/rascunhos, conferência, lista paginada, detalhe e consulta/pendências.

Exibir permanentemente Homologação no módulo inicial. Desabilitar ações por estado e autorização, mas revalidá-las no servidor. Mostrar erro fiscal com código, explicação e orientação; evitar mensagens técnicas ou infraestrutura em fluxos comuns. Ter estados de loading, vazio, indisponibilidade e resultado desconhecido.

Não adicionar XMLs/Base64 de todas as notas ao dashboard. Buscar o detalhe sob demanda. Filtrar por emitente, competência, tomador e situação no servidor com paginação. Polling restrito a jobs ativos, com limpeza, backoff e possibilidade de pausa; não multiplicar o polling global de dois segundos.

Documentar rotas como `/api/nfse/issuers`, `/takers`, `/services`, `/invoices`, `/invoices/:id/issue`, `/invoices/:id/reconcile`, `/invoices/:id/files` e `/jobs/:id`, ajustando nomes de forma consistente. Usar schemas Zod no servidor Next e validação equivalente Python. Payload não pode escolher ambiente de produção, URL de destino, escritório ou caminho do segredo.

## 12. Evolução do banco e implantação

Migrations 001–013 são históricas e não devem ser reescritas. Novas migrations começam após a última encontrada no checkout, 014 nesta versão. Usar mudanças aditivas, FKs, índices, checks, unicidade e RLS adequados. Especificar quais funções são invocáveis por usuário versus worker, revogar grants amplos e fixar `search_path` nas funções privilegiadas.

Testar migração limpa e upgrade de banco local com dados sintéticos. Não criar seeds de clientes reais nem sobrescrever templates ou preferências atuais. Separar DDL, backfill e ativação do recurso. Preparar procedimento de rollback da aplicação sem apagar documentos fiscais ou evidências.

O Docker Next atual contém apenas Node. Definir imagem Python separada para o worker com versão e dependências fixadas, usuário sem privilégios, XSDs empacotados, healthcheck sem segredos, shutdown gracioso e certificado montado somente em runtime. Não pressupor que `python` existe na imagem atual. Não executar `.venv` Windows no Linux nem incluir ambientes virtuais no deploy.

Manter o lockfile JS e fixar dependências fiscais Python verificadas. Não atualizar todos os `latest` incidentalmente. Acrescentar `.env.example` apenas com nomes e exemplos fictícios. Bloquear produção no backend por padrão, inclusive se body/query tentar contornar a UI. Disponibilizar feature flag NFS-e desativada para ambientes existentes até configuração e migrations válidas.

## 13. Testes e critérios de aceite

Baseline da versão analisada: build e TypeScript passam; `test:n8n` passa; lint falha com 9 erros e 8 avisos. O estado antigo de 6/7 não descreve o checkout atualizado. Corrigir os erros localmente, inclusive compatibilidade do teste Node com ESLint, sem apagar testes ou desabilitar regras de forma global.

A entrega exige:

1. Build, TypeScript, lint e regressão n8n executados com resultados reais documentados.
2. Testes de sessão, papel, acesso cruzado entre escritórios, serviço/tomador/certificado de outro escopo e tentativa de produção bloqueada.
3. Testes de migrações, reserva de numeração, dois workers, duplo clique e chave idempotente com payload divergente.
4. Fixture fiscal sintética válida no XSD correto; assinatura/digest conferidos por XMLSec ou outro verificador independente. Testar alteração do conteúdo, namespace/prefixo indevido e preservação dos bytes assinados.
5. Respostas simuladas: 201 com XML válido, 400 com rejeição, duplicidade já autorizada, 404 HTML, 5xx, timeout depois do POST, certificado incompatível e XML/Base64/GZip malformados.
6. Reinício depois de possível transmissão, recuperação por DPS/chave e falha de Storage após autorização não podem produzir nova emissão.
7. Falha Gmail não altera autorização; homologação não envia e-mail automaticamente; PDFs/guia/parcelamentos mantêm templates e fluxo.
8. UI com conferência, indicadores de ambiente, paginação e estados de falha recuperáveis.
9. Testes de rotina são offline, com certificados artificiais e dados sintéticos. Smoke test real em homologação é separado e só ocorre quando solicitado, com dados/perfil/certificado autorizados; nunca usar o PFX encontrado no checkout automaticamente.
10. Não declarar produção validada com base em homologação. Não declarar etapa concluída com mocks se o adaptador real não estiver implementado.

## 14. Entrega e manutenção

Registrar plano, tarefas e ADRs em `specs/nfse`, incluindo o que foi implementado, o que foi testado e pendências externas. Atualizar `README.md` e `specs/constitutions.md` para refletir o código real, removendo descrições obsoletas de demo/storage local e ausência total de testes.

Ao encerrar, fornecer arquivos alterados, migrations, comandos de execução Node/Python, testes/resultados, configuração necessária, riscos restantes e exemplo de mensagem de commit. Não realizar commit, push, deploy, aplicação em produção ou emissão real automaticamente. A sequência local deve avançar sem pedidos de confirmação para decisões técnicas reversíveis já cobertas pelo prompt.

## 15. Aceite adicional de modularidade e onboarding

Testar contas Documentos, NFS-e, Completo e sem módulo; papéis distintos no mesmo escritório e acessos cruzados entre escritórios. Testar URL/API direta, alteração de IDs, tentativa de autoativação comercial, acesso a segredos e revogação durante fila/conciliação. Validar NFS-e sem n8n/Gmail e Documentos sem worker/certificado.

Cobrir cadastro, confirmação, recuperação, convite, cadastro repetido, falha parcial na criação do tenant, CNPJ já vinculado sem ingresso automático, preenchimento retomável, PFX inválido/senha incorreta/expirado/titular incompatível e troca de certificado. Usar certificados e identidades sintéticos nos testes. Comprovar que logs/respostas/Storage público não expõem segredos. Registrar instalação limpa e migração legada, com acesso preservado.
