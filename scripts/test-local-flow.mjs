import {readFile} from 'node:fs/promises';
const base=process.env.LOCAL_APP_URL||'http://127.0.0.1:3100';
async function login(email,password){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});if(!r.ok)throw new Error('login '+r.status);return r.headers.get('set-cookie').split(';')[0]}
async function call(path,cookie,options={}){const r=await fetch(base+path,{...options,headers:{...(options.headers||{}),Cookie:cookie}}),type=r.headers.get('content-type')||'',body=type.includes('json')?await r.json():Buffer.from(await r.arrayBuffer());if(!r.ok)throw Object.assign(new Error(`${path}: ${r.status} ${JSON.stringify(body)}`),{status:r.status});return body}
const cookie=await login('nfse.local@example.test','Local-Nfse-2026!');
const post=(payload)=>call('/api/nfse/workspace',cookie,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
const issuer=await post({action:'issuer',taxId:'11222333000181',legalName:'Empresa Sintética Socium Ltda',municipalityIbge:'3550308',taxRegime:'Simples Nacional',dpsSeries:'1'});
const service=await post({action:'service',issuerId:issuer.id,name:'Serviço sintético',nationalCode:'010101',description:'Serviço sintético exclusivo para teste local'});
const taker=await post({action:'taker',issuerId:issuer.id,taxId:'99888777000166',legalName:'Tomador Sintético Ltda',email:'tomador@example.test'});
const form=new FormData();form.append('issuerId',issuer.id);form.append('password','Synthetic-2026!');form.append('certificate',new Blob([await readFile('.local-data/fixtures/synthetic.pfx')],{type:'application/x-pkcs12'}),'synthetic.pfx');
await call('/api/nfse/certificates',cookie,{method:'POST',body:form});
const draft=await post({action:'draft',issuerId:issuer.id,takerId:taker.id,serviceProfileId:service.id,competence:'2026-11-08',amount:'100.00',description:'Prestação sintética para integração local',idempotencyKey:crypto.randomUUID()});
await call(`/api/nfse/invoices/${draft.id}/issue`,cookie,{method:'POST'});
let invoice;for(let i=0;i<30;i++){const state=await call('/api/nfse/workspace',cookie);invoice=state.invoices.find(x=>x.id===draft.id);if(invoice?.status==='authorized')break;await new Promise(r=>setTimeout(r,500))}if(invoice?.status!=='authorized')throw new Error('worker não autorizou: '+JSON.stringify(invoice));
const xml=await call(`/api/nfse/invoices/${draft.id}/xml`,cookie);if(!xml.toString().includes('semValorFiscal="true"'))throw new Error('XML simulado inválido');
const isolated=await login('isolado.local@example.test','Local-Isolado-2026!');let isolation=false;try{await call(`/api/nfse/invoices/${draft.id}/xml`,isolated)}catch(error){isolation=error.status===404}if(!isolation)throw new Error('isolamento entre escritórios falhou');
console.log(JSON.stringify({ok:true,issuerId:issuer.id,invoiceId:draft.id,status:invoice.status,officialKey:invoice.official_key,xmlBytes:xml.length,crossOfficeBlocked:isolation},null,2));
