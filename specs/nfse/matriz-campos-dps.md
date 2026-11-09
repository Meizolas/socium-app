# Matriz de campos da DPS — cenário nacional PJ com tomador identificado

Cobertura desta versão: prestador pessoa jurídica brasileiro, tomador pessoa jurídica brasileiro identificado, um serviço e ambiente 2. Imunidade, exportação e não incidência aparecem no contrato, mas somente podem ser transmitidas quando as validações condicionais e o perfil fiscal correspondente estiverem completos. Intermediário, destinatário distinto, obra, evento, exploração rodoviária, locação, exterior e compra governamental permanecem bloqueados até matriz específica; o sistema não deve gerar uma DPS parcial nesses cenários.

Artefatos locais conferidos: `DPS_v1.01.xsd` SHA-256 `FE45E5250A48E519ABA89FC6A472863B8E602ED957778FB64692804933A00D0C`; `NFSe_v1.01.xsd` SHA-256 `AF0BD2D8C50ACBA3D9C3F3F515426ECA083B3F66E3211CE8DD48A7CF101818B8`. Origem declarada no projeto: pacote de produção restrita consultado em 08/11/2026. Antes de transmissão controlada, comparar novamente com [Produção Restrita](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita) e [Documentação Atual](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual); não presumir equivalência com produção.

| Interface | Origem / contrato | Persistência | Caminho XML DPS 1.01 | Tipo e regra | Obrigatoriedade / teste |
| --- | --- | --- | --- | --- | --- |
| Ambiente | servidor, constante `2` | `nfse_invoices.environment` | `/DPS/infDPS/tpAmb` | inteiro enumerado; produção (`1`) bloqueada | sempre; `test_production_is_blocked` |
| Data/hora de emissão | worker | snapshot/tentativa | `/DPS/infDPS/dhEmi` | ISO-8601 com fuso | sempre; não vem do navegador |
| Série e número | sequência atômica | `series`, `dps_number` | `serie`, `nDPS` | série 1–5 caracteres; número positivo | sempre; RPC de fila |
| Competência | operação | `competence` | `dCompet` | data civil ISO | sempre |
| Município emissor | emitente | `nfse_issuers.municipality_ibge` | `cLocEmi` | IBGE, 7 dígitos | sempre |
| CNPJ prestador | emitente | `nfse_issuers.tax_id` + snapshot | `prest/CNPJ` | identificador fiscal validado | cenário coberto |
| Opção/regime do Simples e regime especial | emitente confirmado | colunas fiscais do emitente + snapshot | `prest/regTrib/*` | domínios oficiais | condicional; sem padrão universal |
| CNPJ e nome do tomador | tomador | `nfse_takers` + snapshot | `toma/CNPJ`, `toma/xNome` | CNPJ e texto | cenário coberto |
| Endereço/contato do tomador | tomador | `nfse_takers.address`, `email` | grupo `toma/end`, `toma/email` | campos condicionais do XSD | quando exigidos pela operação |
| Município da prestação | operação/perfil | `operation.serviceMunicipalityIbge` | `serv/locPrest/cLocPrestacao` | IBGE, 7 dígitos | sempre neste cenário |
| Código nacional | perfil fiscal versionado | `national_code` + snapshot | `serv/cServ/cTribNac` | `TSCodTribNac` | sempre |
| Código municipal | perfil | `municipal_code` | `serv/cServ/cTribMun` | `TCCodTribMun` | quando município exigir |
| NBS | perfil | `nbs_code` | `serv/cServ/cNBS` | `TSCodNBS` | condicional |
| Descrição | operação | `description` + snapshot | `serv/cServ/xDescServ` | até 2000 caracteres | sempre |
| Valor do serviço | operação | `amount` | `valores/vServPrest/vServ` | decimal, 2 casas | sempre, maior que zero |
| Descontos | operação | colunas de desconto | grupo `valores/vDescCondIncond` | decimal, 2 casas | opcionais; soma ≤ serviço |
| Enquadramento ISS | perfil/operação confirmada | `taxation.issTaxation` | `valores/trib/tribMun/tribISSQN` | domínio oficial | sempre; não inferir pelo Simples |
| Retenção ISS | perfil/operação | `taxation.issWithholding` | `valores/trib/tribMun/tpRetISSQN` | domínio oficial | sempre quando ISS aplicável |
| Alíquota ISS | perfil/operação | `taxation.issRate` | `valores/trib/tribMun/pAliq` | decimal percentual | somente quando exigida; nunca usar tributo aproximado |
| PIS/COFINS | perfil/operação | `taxation.pisCofins` | grupo `valores/trib/tribFed/piscofins` | CST, base e alíquotas conforme domínio | condicional |
| IBS/CBS | perfil/operação | `taxation.ibsCbs` | grupo `IBSCBS`, `CST`, `cClassTrib` | códigos de domínio vigentes | condicional por vigência/cenário |
| Chave e XML NFS-e | retorno SEFIN | `official_key`, `nfse_files` | não pertencem à DPS | produzidos pelo governo | nunca inventados pelo frontend |

As regras sem domínio fechado nesta matriz ficam bloqueadas no gerador. Validação XSD comprova estrutura, não correção fiscal ou autorização cadastral.
