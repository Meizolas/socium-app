# Estado do plano NFS-e

Implementado localmente: contexto modular, isolamento por escritório/emitente, custódia cifrada, troca transacional de A1, cadastros, rascunho em seis etapas, snapshot, sequência atômica, fila, fencing, simulação identificada, XML simulado autenticado, outbox manual e worker contínuo Postgres.

Implementado e não executado externamente: adaptador SEFIN de produção restrita com endpoint fixo, mTLS, DPS 1.01, XSD, XMLDSig, GZip/Base64, classificação estruturada, Storage e reconciliação.

Bloqueado até teste controlado autorizado: comprovar o adaptador com certificado/emitente reais de homologação, revalidar os artefatos oficiais vigentes e confirmar a consulta por DPS no contrato vigente. Produção, cancelamento, substituição, A3 e cenários condicionais fora da matriz permanecem indisponíveis.
