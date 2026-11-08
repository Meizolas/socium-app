# Rascunho de DPS do escritório

Dados confirmados pelo usuário em 08/11/2026:

| Campo | Valor |
| --- | --- |
| CNPJ prestador | 19.463.142/0001-13 |
| Município | Vitória da Conquista/BA, IBGE 2933307 |
| Regime | Simples Nacional |
| Serviço nacional | 17.19.01, XML 171901 |
| NBS | 1.1302.21.00, XML 113022100 |
| ISS retido | Não |
| Regime especial de ISS | Não |
| Percentual aproximado do Simples | 6%, não é a alíquota de ISS |
| Tomador | GMS ACESSORIOS PARA MOTOCICLETAS LTDA |
| CNPJ tomador | 42.057.096/0001-74 |
| Valor para teste proposto | R$ 1,00 |
| Ambiente | Homologação, tpAmb=2 |

Este pacote complementa o teste_nfse.py anterior. Não contém certificado, senha, dados do cliente usado como referência nem nota emitida.

## Executar

Copie gerar_dps.py para a pasta D:\VS-Code\sistema-socium\teste_nfse. No PowerShell dessa pasta:

```powershell
py gerar_dps.py
```

O gerador usa a data e hora local de Brasília no momento da execução. Gera uma DPS nova com série 1 e número 1; não sobrescreve arquivo existente. Não modifica o XML já emitido pelo cliente de logística. A série e número precisam ser exclusivos para este emitente/ambiente. Uma série/número diferente só deve ser usada após conciliação das tentativas anteriores, nunca para contornar um timeout.

## Estado da preparação

A estrutura foi montada tomando como referência a DPS v1.01 do XML fornecido. Não está certificada contra os XSD vigentes de homologação. Não houve assinatura com o certificado do escritório nem transmissão.

Hipótese explícita: regApTribSN=1 (tributos federais e municipal pelo Simples). A resposta 'Simples Nacional' e 'sem regime especial' não determina sozinha todas as exceções de apuração; confirmar esse campo no cadastro/parâmetros antes do envio. ISS tributável foi considerado para a operação contábil comum, sujeito à validação fiscal.

O exemplo não inclui endereço do tomador, inscrição municipal, código municipal ou grupos IBS/CBS. Não presume que a ausência desses campos seja aceita para qualquer contribuinte. Conferir obrigatoriedade no XSD e nas regras da operação e acrescentar os dados necessários antes de transmitir. Não interpretar omissão como valor zero ou dispensa de obrigação.

## Próximo passo: obter o XSD oficial

Abrir https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita e baixar o arquivo NFSe-ESQUEMAS_XSD de produção restrita listado atualmente (na consulta de 08/11/2026: PRODREST-v1.01-20261020). Extrair a pasta completa para schemas, preservando os includes/imports. Informar o nome exato do arquivo XSD raiz da DPS para montar o comando de validação. Não usar esquemas de produção em lugar dos de homologação.

No cliente anterior, manter a consulta de conexão no ADN parametrizacao, conforme a correção que retornou HTTP 200. A base das operações de emissão/consulta da SEFIN e o perfil de assinatura ainda precisam ser conferidos no contrato oficial antes de enviar.

Somente após validar XSD, regras, assinatura e destino devem ser usados os comandos validar e emitir do cliente. A consulta de convênio bem-sucedida não comprova habilitação fiscal do CNPJ para emitir.
