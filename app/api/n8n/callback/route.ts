import {apiError,supabaseAdmin} from '@/lib/supabase-server';
import {sendGmail,sendWhatsApp} from '@/lib/deliveries';
import {normalizeCnpj} from '@/lib/format';
export async function POST(req:Request){
  if(!process.env.N8N_CALLBACK_SECRET||req.headers.get('x-callback-secret')!==process.env.N8N_CALLBACK_SECRET)return Response.json({error:'Não autorizado'},{status:401});
  try{
    const p=await req.json(),db=supabaseAdmin();
    if(!p.processingId)return Response.json({error:'processingId obrigatório'},{status:400});
    const current=await db.from('processings').select('document_id,office_id').eq('id',p.processingId).single();
    if(current.error)throw new Error(current.error.message);
    let clientId:string|null=null;const cnpj=normalizeCnpj(p.cnpj);
    if(cnpj){const found=await db.from('clients').select('id').eq('office_id',current.data.office_id).eq('cnpj',cnpj).maybeSingle();if(found.error)throw new Error(found.error.message);clientId=found.data?.id||null}
    const failed=Boolean(p.errorMessage),status=failed?'Erro':p.currentStep&&p.currentStep<4?'Processando':'Pronto para envio';
    const processing=await db.from('processings').update({current_step:p.currentStep||1,status,progress:failed?0:Math.min(100,Number(p.progress||100)),error_message:p.errorMessage||null,finished_at:failed||status==='Pronto para envio'?new Date().toISOString():null}).eq('id',p.processingId);
    if(processing.error)throw new Error(processing.error.message);
    const document=await db.from('documents').update({client_id:clientId,extracted_cnpj:cnpj||null,competence:p.competence||null,due_date:p.dueDate||null,amount:p.amount||null,final_name:p.finalName||null,status:clientId?status:'Revisão necessária'}).eq('id',current.data.document_id);
    if(document.error)throw new Error(document.error.message);
    if(!clientId&&p.cnpj)await db.from('alerts').insert({office_id:current.data.office_id,document_id:current.data.document_id,type:'Cliente não localizado',severity:'Atenção',title:`CNPJ ${p.cnpj} não cadastrado`});
    if(clientId&&!failed&&status==='Pronto para envio'){
      const client=await db.from('clients').select('preference').eq('id',clientId).single(),preference=client.data?.preference||'';
      const tasks:Promise<unknown>[]=[];
      if(/e-mail|email/i.test(preference))tasks.push(sendGmail(current.data.document_id));
      if(/whatsapp/i.test(preference))tasks.push(sendWhatsApp(current.data.document_id));
      const results=await Promise.allSettled(tasks),errors=results.filter((r):r is PromiseRejectedResult=>r.status==='rejected').map(r=>String(r.reason));
      if(errors.length)await db.from('alerts').insert({office_id:current.data.office_id,document_id:current.data.document_id,type:'Falha de envio',severity:'Crítico',title:errors.join(' | ').slice(0,300)});
      if(tasks.length&&errors.length===0)await db.from('documents').update({status:'Enviado'}).eq('id',current.data.document_id);
    }
    return Response.json({received:true,processingId:p.processingId});
  }catch(error){return apiError(error)}
}
