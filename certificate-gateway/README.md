# Gateway de autenticação ICP-Brasil

Este serviço encerra TLS em um domínio exclusivo, solicita o certificado do
navegador e encaminha ao aplicativo somente certificados cuja cadeia e
revogação tenham sido validadas.

Arquivos montados em runtime (não entram na imagem):

- `/etc/nginx/tls/server/fullchain.pem`
- `/etc/nginx/tls/server/privkey.pem`
- `/etc/nginx/tls/icp-brasil/ca-bundle.pem`
- `/etc/nginx/tls/icp-brasil/crl-bundle.pem`

O bundle de ACs e as LCRs devem ser gerados e atualizados a partir do
repositório oficial do ITI. O hash publicado pelo ITI deve ser conferido antes
da instalação. O serviço deve ser exposto diretamente em TLS ou por um proxy
com passthrough TCP; terminação TLS anterior ao Nginx impede autenticação mTLS.

Fontes oficiais:

- `https://www.gov.br/iti/pt-br/assuntos/repositorio/repositorio-ac-raiz`
- `https://www.gov.br/iti/pt-br/assuntos/repositorio/certificados-das-acs-da-icp-brasil-arquivo-unico-compactado`

Variáveis obrigatórias:

- `APP_INTERNAL_URL` (ex.: `http://web:3000`)
- `CERT_GATEWAY_SHARED_SECRET` (segredo aleatório com pelo menos 32 caracteres)

O mesmo segredo deve ser configurado no aplicativo. Nunca exponha a porta HTTP
interna do gateway nem aceite os cabeçalhos `X-Client-Cert-*` de outro serviço.
A porta `8080` existe somente para o healthcheck interno; a autenticação utiliza
exclusivamente a porta TLS `443`.
