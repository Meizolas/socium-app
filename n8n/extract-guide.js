// n8n Code node: Mode = Run Once for All Items
const monthNumbers = {
  JANEIRO:'01',FEVEREIRO:'02',MARCO:'03',MARÇO:'03',ABRIL:'04',MAIO:'05',JUNHO:'06',
  JULHO:'07',AGOSTO:'08',SETEMBRO:'09',OUTUBRO:'10',NOVEMBRO:'11',DEZEMBRO:'12',
  JAN:'01',FEV:'02',MAR:'03',ABR:'04',MAI:'05',JUN:'06',JUL:'07',AGO:'08',SET:'09',OUT:'10',NOV:'11',DEZ:'12'
};
const stopWords=new Set(['DE','DO','DA','DOS','DAS','O','A','OS','AS','E','EM','NO','NA','NOS','NAS','POR','PARA','COM','&','LTDA','LTDA.','ME','MEI','SA','S.A','S.A.','EIRELI','S/S','SS','EPP','SLU']);
const monthNames=['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
const plain=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();

for(const item of $input.all()){
  const text=String(item.json.text||'').replace(/\r/g,'').replace(/\n+/g,'\n');
  const upper=plain(text);
  let type='GUIA';
  if(upper.includes('DOCUMENTO DE ARRECADACAO DO SIMPLES NACIONAL'))type='DAS';
  else if(upper.includes('DOCUMENTO DE ARRECADACAO ESTADUAL')||(upper.includes('CODIGO DA RECEITA')&&upper.includes('REFERENCIA')))type='DAE';
  else if(upper.includes('GUIA DE RECOLHIMENTO')||upper.includes('DARF'))type='DARF';

  const cnpjMatch=text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14}/);
  const cnpj=String(cnpjMatch?.[0]||'').replace(/\D/g,'');
  let legalName='';
  if(cnpjMatch){
    const after=text.slice((cnpjMatch.index||0)+cnpjMatch[0].length,(cnpjMatch.index||0)+cnpjMatch[0].length+350);
    const match=after.match(/^\s*([A-ZÀ-Ú0-9&.,'\- ]{3,}?)(?=\s+(?:Per[ií]odo|Data de Vencimento|Pagar|N[úu]mero do Documento|Valor)|\n)/i);
    legalName=String(match?.[1]||'').replace(/\s+/g,' ').trim();
  }

  const words=legalName.split(/\s+/).filter(Boolean);let shortName='',significant=0;
  for(const word of words){if(stopWords.has(word.toUpperCase())){if(significant)shortName+=` ${word}`}else{shortName+=(shortName?' ':'')+word;significant++;if(significant>=2)break}}
  shortName=shortName.trim().replace(/\s+(DE|DO|DA|DOS|DAS|E|&|COM)$/i,'').trim()||legalName.slice(0,30).trim();

  let competence='';
  const comp=text.match(/(?:Per[ií]odo(?:\s+de\s+Apura[çc][ãa]o)?|Apura[çc][ãa]o)[:\s]*(?:(\d{2})\/(\d{4})|([A-ZÀ-ÚÇ]{3,10})\/?(\d{4}))/i);
  if(comp){
    if(comp[1]&&comp[2])competence=`${comp[1]}/${comp[2]}`;
    else{const number=monthNumbers[plain(comp[3])];if(number)competence=`${number}/${comp[4]}`}
  }

  let dueDate=null;
  const due=text.match(/(?:vencimento|pagar\s+(?:este\s+documento\s+)?at[ée]|pag[áa]vel\s+at[ée]|data\s+de\s+vencimento)[:\s]*(\d{2})[/.](\d{2})[/.](\d{4})/i)||text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if(due)dueDate=`${due[3]}-${due[2]}-${due[1]}`;

  let amount=null;
  const patterns=[/Valor\s+Total\s+do\s+Documento\s*[:\n]?\s*(?:R\$\s*)?([\d.,]+)/i,/Valor\s+Total\s*[:\n]?\s*(?:R\$\s*)?([\d.,]+)/i,/Total\s+a\s+Pagar\s*[:\n]?\s*(?:R\$\s*)?([\d.,]+)/i,/Valor\s+Principal\s*[:\n]?\s*(?:R\$\s*)?([\d.,]+)/i];
  for(const pattern of patterns){const found=text.match(pattern);if(found){const number=Number(found[1].replace(/\./g,'').replace(',','.'));if(Number.isFinite(number)&&number>0){amount=number;break}}}

  const monthName=due?monthNames[Number(due[2])-1]:'';
  const baseName=[type,shortName,monthName&&due?`${monthName}-${due[3]}`:''].filter(Boolean).join(' - ');
  const safeName=(baseName||`${type} - DOCUMENTO`).replace(/[<>:"/\\|?*\x00-\x1F]/g,'').replace(/\s+/g,' ').trim();

  Object.assign(item.json,{
    type,cnpj,legalName:legalName||null,shortName:shortName||null,competence:competence||null,
    dueDate,amount,finalName:`${safeName}.pdf`,currentStep:4,progress:100,errorMessage:null
  });
}
return $input.all();
