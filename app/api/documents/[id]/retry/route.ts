import {apiError,getOfficeId,supabaseAdmin} from '@/lib/supabase-server';

export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
  let documentId='',processingId='',officeId='';
  try{
    const {id}=await params,db=supabaseAdmin();
    documentId=id;
    officeId=await getOfficeId();
    const document=await db.from('documents').select('*').eq('id',id).eq('office_id',officeId).single();
    if(document.error)throw new Error(document.error.message);
    const processing=await db.from('processings').select('*').eq('document_id',id).eq('office_id',officeId).single();
    if(processing.error)throw new Error(processing.error.message);
    processingId=processing.data.id;
    const signed=await db.storage.from('das-documents').createSignedUrl(document.data.storage_path,3600);
    if(signed.error)throw new Error(signed.error.message);
    if(!process.env.N8N_WEBHOOK_URL)throw new Error('N8N_WEBHOOK_URL não configurada.');
    const attempts=await db.from('attempts').select('id',{count:'exact',head:true}).eq('processing_id',processing.data.id);
    const attempt=(attempts.count||0)+1;
    await db.from('processings').update({status:'Arquivo recebido — extraindo dados',progress:20,error_message:null,started_at:new Date().toISOString(),finished_at:null}).eq('id',processing.data.id);
    await db.from('documents').update({status:'Processando'}).eq('id',id);
    const response=await fetch(process.env.N8N_WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json','x-webhook-secret':process.env.N8N_WEBHOOK_SECRET||''},body:JSON.stringify({documentId:id,processingId:processing.data.id,originalName:document.data.original_name,fileUrl:signed.data.signedUrl,officeId,competence:document.data.competence,documentCategory:document.data.document_category||'GUIA'})});
    const body=(await response.text()).slice(0,2000);
    await db.from('attempts').insert({office_id:officeId,processing_id:processing.data.id,attempt,request:{documentId:id,originalName:document.data.original_name,competence:document.data.competence,documentCategory:document.data.document_category||'GUIA'},response:{status:response.status,body}});
    if(!response.ok){console.error('Falha ao reprocessar documento',response.status,body.slice(0,300));await db.from('processings').update({status:'Falha ao iniciar processamento',progress:100,error_message:'Não foi possível iniciar o processamento automático.',finished_at:new Date().toISOString()}).eq('id',processing.data.id);await db.from('documents').update({status:'Erro'}).eq('id',id);return Response.json({error:'Não foi possível iniciar o processamento automático.'},{status:502})}
    return Response.json({ok:true,status:response.status,response:body});
  }catch(error){
    const message=error instanceof Error?error.message:'Falha ao reprocessar.';
    if(documentId&&processingId&&officeId){
      const db=supabaseAdmin();
      await Promise.all([
        db.from('processings').update({status:'Erro ao reprocessar',progress:100,error_message:message,finished_at:new Date().toISOString()}).eq('id',processingId),
        db.from('documents').update({status:'Erro'}).eq('id',documentId),
        db.from('alerts').insert({office_id:officeId,document_id:documentId,type:'Erro no reprocessamento',severity:'Crítico',title:message.slice(0,300)}),
      ]);
    }
    return apiError(error);
  }
}
