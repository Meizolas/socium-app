# Teste de emissão NFS-e para o Socium

Preparado em 07/11/2026. Este é um cliente experimental de homologação, independente do Socium.
Não houve emissão, conexão autenticada à API, nem comprovação de autorização do escritório.

## O que está preparado

- Carregamento de certificado A1 PFX/P12 com senha digitada localmente.
- Consulta de parâmetros municipais usando autenticação TLS com certificado.
- Assinatura XMLDSig de uma DPS fornecida, verificação local da assinatura e validação contra XSD fornecido.
- Envio de DPS compactada GZip/Base64 e consulta de NFS-e por chave.
- Bloqueio de tpAmb diferente de 2 e endereço fixo de produção restrita.
- Sem repetição automática de transmissão; pré-consulta da DPS e registro de tentativa.

Não gera a DPS a partir de um formulário ou JSON. A montagem do XML fiscal do escritório é a próxima etapa e depende dos dados abaixo. Não use o roteiro de odontologia como configuração de serviços contábeis.
Não suporta certificado A3/token/nuvem. Se esse for o certificado disponível, será necessário adaptar o acesso ao provedor/token; não exportar a chave privada.
Cancelamento e geração do PDF não estão implementados neste cliente inicial.

## O que falta para executar de ponta a ponta

1. Confirmar se o certificado é A1 em arquivo ou A3/nuvem, seu titular e sua validade.
2. Validar com o contador o CNPJ emitente, município/IBGE, inscrição municipal quando aplicável, regime tributário e regime especial.
3. Definir competência, descrição do serviço contábil, código nacional e municipal/NBS quando exigidos, valor e tomador apropriado para homologação.
4. Validar ISS, retenções, benefícios e grupos IBS/CBS conforme o enquadramento e competência. Não fixar respostas tributárias sem essa validação.
5. Montar a DPS com esses dados e o leiaute vigente de homologação, usando tpAmb=2 e identificação única. Confirmar autorização do titular para o teste.
6. Baixar o conjunto XSD oficial de homologação e manter seus arquivos juntos. Indicar o XSD raiz da DPS, não um arquivo auxiliar.
7. Conferir no manual vigente o perfil de assinatura SHA1 ou SHA256 e o caminho atual da SEFIN. Não escolher algoritmo por tentativa.

O endereço inicial deste cliente foi derivado do link SEFIN de homologação no catálogo oficial:
https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional
O Swagger não carregou durante a preparação. Portanto o caminho base e o contrato efetivo precisam ser conferidos antes da transmissão. Se retornar 404, isso não prova falta de autorização: pode indicar caminho incorreto. Não acrescentar tentativas automáticas nem apontar para produção.

## Executar no Windows / PowerShell

Instale Python 3.11 ou superior. Extraia esta pasta. Abra o PowerShell na pasta extraída.

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe teste_nfse.py --help
```

Primeiro: testar conexão com o certificado do escritório. Substitua o código IBGE abaixo pelo município correto; o exemplo é Vitória da Conquista.

```powershell
.\.venv\Scripts\python.exe teste_nfse.py conexao --pfx "C:\Certificados\escritorio.pfx" --municipio 2933307
```

A senha é solicitada sem aparecer na tela. Não é gravada em arquivo nem enviada no corpo da API. O certificado público participa da autenticação TLS; a chave privada permanece local. Arquivos de resultado podem conter dados fiscais: mantenha a pasta protegida.

Depois de montar a DPS e confirmar o algoritmo no manual, valide localmente. No exemplo abaixo, substitua PERFIL_CONFIRMADO por sha1 ou sha256 conforme a especificação, e os caminhos pelos arquivos reais:

```powershell
.\.venv\Scripts\python.exe teste_nfse.py validar --pfx "C:\Certificados\escritorio.pfx" --xml dps.xml --xsd "schemas\DPS_vigente.xsd" --algoritmo PERFIL_CONFIRMADO
```

Com dados e resultados conferidos, transmitir em homologação:

```powershell
.\.venv\Scripts\python.exe teste_nfse.py emitir --pfx "C:\Certificados\escritorio.pfx" --xml dps.xml --xsd "schemas\DPS_vigente.xsd" --algoritmo PERFIL_CONFIRMADO
```

O programa pede a frase EMITIR HOMOLOGACAO. Antes do POST faz HEAD da DPS: somente HTTP 404 permite avançar. HTTP 200 indica nota existente; outros retornos exigem investigação. Um 404 só é útil após o contrato/endereço terem sido confirmados.

Finalmente, copiar a chave retornada e consultar:

```powershell
.\.venv\Scripts\python.exe teste_nfse.py consultar --pfx "C:\Certificados\escritorio.pfx" --chave CHAVE_RETORNADA
```

Não interpretar HTTP 200 isoladamente como prova de emissão. Conferir o JSON, chave, XML retornado, ambiente, CNPJ, competência, serviço e valor; consultar a mesma nota e comparar. A verificação local da assinatura não certifica cadeia ICP-Brasil/revogação ou autorização fiscal: isso depende da validação oficial.

## Critério de aprovação

A prova será aprovada somente após emissão autorizada em homologação, recuperação da nota pela chave e conferência dos campos pelo contador. Conexão bem-sucedida ou XML válido isoladamente não comprovam emissão. Homologação aprovada também não dispensa validar habilitação e configuração em produção antes de operar comercialmente.

Se houver timeout após POST, o estado é DESCONHECIDO: não alterar número/ID para tentar de novo. Consultar a DPS e reconciliar o resultado primeiro. Este cliente não oferece operação multiusuário nem substitui uma fila transacional de produção.

## Fontes oficiais

- Catálogo de APIs: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao
- Leiaute e XSD de homologação: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita
- Manual API contribuintes: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf

O ambiente de homologação pode ter leiaute diferente do ambiente de produção. Usar sempre o conjunto correspondente ao destino.
