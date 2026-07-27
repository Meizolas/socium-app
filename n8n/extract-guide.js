// n8n Code node: Mode = Run Once for All Items
const monthNumbers = {
  JANEIRO: "01", FEVEREIRO: "02", MARCO: "03", "MARÇO": "03",
  ABRIL: "04", MAIO: "05", JUNHO: "06", JULHO: "07", AGOSTO: "08",
  SETEMBRO: "09", OUTUBRO: "10", NOVEMBRO: "11", DEZEMBRO: "12",
  JAN: "01", FEV: "02", MAR: "03", ABR: "04", MAI: "05", JUN: "06",
  JUL: "07", AGO: "08", SET: "09", OUT: "10", NOV: "11", DEZ: "12",
};
const monthNames = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];
const stopWords = new Set([
  "DE", "DO", "DA", "DOS", "DAS", "O", "A", "OS", "AS", "E", "EM",
  "NO", "NA", "NOS", "NAS", "POR", "PARA", "COM", "&", "LTDA", "LTDA.",
  "ME", "MEI", "SA", "S.A", "S.A.", "EIRELI", "S/S", "SS", "EPP", "SLU",
]);
const plain = (value) =>
  String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const cleanLine = (value) => String(value || "").replace(/\s+/g, " ").trim();
const onlyCnpj = (value) => String(value || "").replace(/\D/g, "");
const validCnpjText = String.raw`\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14}`;

function identifyType(upper) {
  if (upper.includes("DOCUMENTO DE ARRECADACAO DO SIMPLES NACIONAL")) return "DAS";
  if (
    upper.includes("DOCUMENTO DE ARRECADACAO DE RECEITAS FEDERAIS") ||
    upper.includes("DARF") ||
    upper.includes("SENDA (VERSAO") ||
    (upper.includes("CODIGO PRINCIPAL") && /\b(PIS|COFINS|IRPJ|CSLL)\b/.test(upper))
  ) return "DARF";
  if (
    upper.includes("DOCUMENTO DE ARRECADACAO MUNICIPAL") ||
    (/\bDAM\b/.test(upper) && upper.includes("PREFEITURA")) ||
    upper.includes("IMPOSTO SOBRE SERVICO")
  ) return "DAM";
  if (
    upper.includes("DOCUMENTO DE ARRECADACAO ESTADUAL") ||
    upper.includes("SECRETARIA DA FAZENDA DO ESTADO") ||
    upper.includes("SEFAZ") ||
    (upper.includes("CODIGO DA RECEITA") && upper.includes("REFERENCIA"))
  ) return "DAE";
  if (upper.includes("GUIA DA PREVIDENCIA SOCIAL") || /\bGPS\b/.test(upper)) return "GPS";
  if (upper.includes("FGTS DIGITAL") || upper.includes("GUIA DO FGTS")) return "FGTS";
  return "GUIA";
}

function contributor(text, type) {
  let match;

  // DAM: evita usar o CNPJ da prefeitura e captura o contribuinte.
  if (type === "DAM") {
    match = text.match(
      new RegExp(`\\n([^\\n]{3,150})\\nCPF\\s*\\/\\s*CNPJ\\s*:\\s*(${validCnpjText})`, "i"),
    );
    if (match) return { cnpj: onlyCnpj(match[2]), legalName: cleanLine(match[1]) };
  }

  // DAE: os campos são rotulados e podem aparecer distantes no PDF.
  if (type === "DAE") {
    const cnpj = text.match(new RegExp(`CNPJ\\s*\\/\\s*CPF\\s*\\n?\\s*(${validCnpjText})`, "i"));
    const name = text.match(/NOME,\s*FIRMA\s*OU\s*RAZ[ÃA]O\s*SOCIAL\s*\n?\s*([^\n]+)/i);
    if (cnpj || name) {
      return {
        cnpj: onlyCnpj(cnpj?.[1]),
        legalName: cleanLine(name?.[1]),
      };
    }
  }

  // DAS/DARF: normalmente CNPJ e razão social aparecem na mesma linha.
  match = text.match(
    new RegExp(`(${validCnpjText})\\s+([A-ZÀ-Ú0-9][A-ZÀ-Ú0-9&.,'\\- ]{2,150})(?=\\n|Per[ií]odo)`, "i"),
  );
  if (match) return { cnpj: onlyCnpj(match[1]), legalName: cleanLine(match[2]) };

  // Fallback para outros modelos.
  const cnpj = text.match(new RegExp(validCnpjText));
  return { cnpj: onlyCnpj(cnpj?.[0]), legalName: "" };
}

function shortLegalName(legalName) {
  const words = cleanLine(legalName).split(/\s+/).filter(Boolean);
  let result = "", significant = 0;
  for (const word of words) {
    if (stopWords.has(word.toUpperCase())) {
      if (significant) result += ` ${word}`;
    } else {
      result += `${result ? " " : ""}${word}`;
      significant++;
      if (significant >= 2) break;
    }
  }
  return result
    .trim()
    .replace(/\s+(DE|DO|DA|DOS|DAS|E|&|COM)$/i, "")
    .trim() || cleanLine(legalName).slice(0, 30);
}

function normalizeCompetence(month, year) {
  const number = /^\d{1,2}$/.test(month)
    ? String(Number(month)).padStart(2, "0")
    : monthNumbers[plain(month)];
  return number && /^\d{4}$/.test(year) ? `${number}/${year}` : "";
}

function findCompetence(text) {
  const patterns = [
    /(?:REFER[ÊE]NCIA|M[ÊE]S\s*\/\s*ANO|PA)\s*[:\n]?\s*(\d{1,2})[/-](\d{4})/i,
    /(?:Per[ií]odo(?:\s+de\s+Apura[çc][ãa]o)?|Apura[çc][ãa]o)\s*[:\n]?\s*(\d{1,2})\/(\d{4})/i,
    /(?:Per[ií]odo(?:\s+de\s+Apura[çc][ãa]o)?|Apura[çc][ãa]o)\s*[:\n]?\s*([A-ZÀ-ÚÇ]{3,10})\/?(\d{4})/i,
    /\b(JANEIRO|FEVEREIRO|MAR[ÇC]O|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\/(\d{4})\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const competence = normalizeCompetence(match[1], match[2]);
      if (competence) return competence;
    }
  }
  return "";
}

function findDueDate(text) {
  const patterns = [
    /DATA\s+DE\s+VENCIMENTO\s*\n?\s*(\d{2})[/.](\d{2})[/.](\d{4})/i,
    /(?:Pagar\s+(?:este\s+documento\s+)?at[ée]|Pagar\s+at[ée]|Pag[áa]vel\s+at[ée])\s*[:\n]?\s*(\d{2})[/.](\d{2})[/.](\d{4})/i,
    /(?:Vencimento|Data\s+Vencimento)\s*[:\n]?\s*(\d{2})[/.](\d{2})[/.](\d{4})/i,
    /\b(\d{2})\/(\d{2})\/(\d{4})\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return null;
}

function findAmount(text) {
  const patterns = [
    /Valor\s+Total\s+do\s+Documento\s*[:\n]?\s*(?:R\$\s*)?([\d.,]+)/i,
    /TOTAL\s+A\s+RECOLHER\s*[:\n]?\s*(?:R\$\s*)?([\d.,]+)/i,
    /Valor\s+Total\s+Cobran[çc]a\s*[:\n]?\s*(?:R\$\s*)?([\d.,]+)/i,
    /Valor\s+Total\s*[:\n]?\s*(?:R\$\s*)?([\d.,]+)/i,
    /Total\s+a\s+Pagar\s*[:\n]?\s*(?:R\$\s*)?([\d.,]+)/i,
    /Valor\s+Principal\s*[:\n]?\s*(?:R\$\s*)?([\d.,]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const number = Number(match[1].replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

for (const item of $input.all()) {
  const text = String(item.json.text || "").replace(/\r/g, "").replace(/\n+/g, "\n");
  const type = identifyType(plain(text));
  const { cnpj, legalName } = contributor(text, type);
  const shortName = shortLegalName(legalName);
  const competence = findCompetence(text);
  const dueDate = findDueDate(text);
  const amount = findAmount(text);

  const [competenceMonth, competenceYear] = competence.split("/");
  const dueParts = dueDate ? dueDate.split("-") : [];
  const referenceMonth = competenceMonth || dueParts[1] || "";
  const referenceYear = competenceYear || dueParts[0] || "";
  const reference = referenceMonth && referenceYear
    ? `${monthNames[Number(referenceMonth) - 1]}-${referenceYear}`
    : "";
  const baseName = [type, shortName, reference].filter(Boolean).join(" - ");
  const safeName = (baseName || `${type} - DOCUMENTO`)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  Object.assign(item.json, {
    type,
    cnpj: cnpj || null,
    legalName: legalName || null,
    shortName: shortName || null,
    competence: competence || null,
    dueDate,
    amount,
    finalName: `${safeName}.pdf`,
    currentStep: 4,
    progress: 100,
    errorMessage: null,
  });
}

return $input.all();
