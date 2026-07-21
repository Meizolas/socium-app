import {apiError,supabaseAdmin} from '@/lib/supabase-server';
import {attemptDocumentDelivery} from '@/lib/deliveries';
import {normalizeCnpj} from '@/lib/format';
export async function POST(req:Request){
  if(!process.env.N8N_CALLBACK_SECRET||req.headers.get('x-callback-secret')!==process.env.N8N_CALLBACK_SECRET)return Response.json({error:'Não autorizado'},{status:401});
  try{
    const p=await req.json(),db=supabaseAdmin(),processingId=String(p.processingId||'').replace(/^=/,'').trim();
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(processingId))return Response.json({error:'processingId inválido'},{status:400});
    const current=await db.from('processings').select('document_id,office_id').eq('id',processingId).single();
    if(current.error)throw new Error(current.error.message);
    let clientId:string|null=null;const cnpj=normalizeCnpj(p.cnpj);
    if(cnpj){const found=await db.from('clients').select('id').eq('office_id',current.data.office_id).eq('cnpj',cnpj).maybeSingle();if(found.error)throw new Error(found.error.message);clientId=found.data?.id||null}
    const failed=Boolean(p.errorMessage),status=failed?'Erro':p.currentStep&&p.currentStep<4?'Processando':'Pronto para envio';
    const processing=await db.from('processings').update({current_step:Number(p.currentStep)||1,status,progress:failed?0:Math.min(100,Number(p.progress)||100),error_message:p.errorMessage||null,finished_at:failed||status==='Pronto para envio'?new Date().toISOString():null}).eq('id',processingId);
    if(processing.error)throw new Error(processing.error.message);
    const dateText=String(p.dueDate||''),dateMatch=dateText.match(/^(\d{2})\/(\d{2})\/(\d{4})$/),dueDate=dateMatch?`${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`:dateText||null,amountText=String(p.amount??'').replace(/[^0-9,.-]/g,''),amount=amountText?Number(amountText.includes(',')?amountText.replace(/\./g,'').replace(',','.'):amountText):null,finalName=String(p.finalName||'').replace(/^=/,'').trim();
    const documentChanges:Record<string,unknown>={client_id:clientId,extracted_cnpj:cnpj||null,due_date:dueDate,amount:Number.isFinite(amount)?amount:null,final_name:finalName||null,status:clientId?status:'Revisão necessária'};
    if(/^\d{2}\/\d{4}$/.test(String(p.competence||'')))documentChanges.competence=p.competence;
    const document=await db.from('documents').update(documentChanges).eq('id',current.data.document_id);
    if(document.error)throw new Error(document.error.message);
    if(!clientId&&p.cnpj)await db.from('alerts').insert({office_id:current.data.office_id,document_id:current.data.document_id,type:'Cliente não localizado',severity:'Atenção',title:`CNPJ ${p.cnpj} não cadastrado`});
    if(clientId&&!failed&&status==='Pronto para envio')await attemptDocumentDelivery(current.data.document_id);
    return Response.json({received:true,processingId});
  }catch(error){return apiError(error)}
}
