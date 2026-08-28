const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "extract-guide.js"), "utf8");
const execute = new Function("$input", source);
const text = `MINISTÉRIO DA FAZENDA
SECRETARIA DA RECEITA FEDERAL DO BRASIL
Documento de Arrecadação de Receitas Federais
DARF
NOME / RAZÃO SOCIAL
PERÍODO DE APURAÇÃO
NÚMERO DO CPF OU CNPJ
CÓDIGO DA RECEITA
NÚMERO DE REFERÊNCIA
DATA DE VENCIMENTO
VALOR DO PRINCIPAL
VALOR DA MULTA
VALOR DOS JUROS E / OU
ENCARGOS DL - 1.025/69
VALOR TOTAL
AUTENTICAÇÃO BANCÁRIA
Número do Documento:
Data limite para acolhimento:
Observações:
1124
31/08/2026
1.496,84
49,99
1.546,83
31/08/2026
SENDA (Versão:1.5.10) 28/08/2026 17:54:41
07.03.26240.2541650-1
85820000015 5 46830385262 8 43070326240 5 25416501069 1
28.110.008/0001-20
30/06/2026
1a. via
BRITTO E PENA LTDA
08
02110001200738718002669
2`;

const twoCopyText = `${text}\n${text.replace("1a. via", "2a. via")}`;
const items = [{ json: { text: twoCopyText } }];
const result = execute({ all: () => items });
const extracted = result[0].json;

assert.equal(extracted.type, "DARF");
assert.equal(extracted.cnpj, "28110008000120");
assert.equal(extracted.legalName, "BRITTO E PENA LTDA");
assert.equal(extracted.shortName, "BRITTO E PENA");
assert.equal(extracted.competence, "06/2026");
assert.equal(extracted.dueDate, "2026-08-31");
assert.equal(extracted.amount, 1546.83);
assert.equal(extracted.finalName, "DARF - BRITTO E PENA - JUNHO-2026.pdf");

console.log("DARF SENDA extraído corretamente:", extracted);
