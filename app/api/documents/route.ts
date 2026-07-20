import {createHash,randomUUID} from 'crypto';
import {apiError,getOfficeId,supabaseAdmin} from '@/lib/supabase-server';

export async function POST(req:Request){
  try{
    const form=await req.formData(),file=form.get('file');
    if(!(file instanceof File)||file.type!=='application/pdf')return Response.json({error:'Apenas arquivos PDF são permitidos.'},{status:400});
    const max=Number(process.env.MAX_UPLOAD_MB||20)*1024*1024;
    if(file.size>max)return Response.json({error:'Arquivo excede o limite configurado.'},{status:413});
    const bytes=Buffer.from(await file.arrayBuffer());
    if(bytes.subarray(0,4).toString()!=='%PDF')return Response.json({error:'O conteúdo não é um PDF válido.'},{status:400});
    const db=supabaseAdmin(),officeId=await getOfficeId(),id=randomUUID(),hash=createHash('sha256').update(bytes).digest('hex'),path=`${officeId}/${id}.pdf`;
    const duplicate=await db.from('documents').select('id').eq('office_id',officeId).eq('hash',hash).maybeSingle();
    if(duplicate.error)throw new Error(duplicate.error.message);
    if(duplicate.data)return Response.json({error:'Este arquivo já foi importado.',documentId:duplicate.data.id},{status:409});
    const upload=await db.storage.from('das-documents').upload(path,bytes,{contentType:'application/pdf',upsert:false});
    if(upload.error)throw new Error(upload.error.message);
    const document=await db.from('documents').insert({id,office_id:officeId,original_name:file.name,hash,storage_path:path,competence:String(form.get('competence')||''),status:'Na fila'}).select().single();
    if(document.error){await db.storage.from('das-documents').remove([path]);throw new Error(document.error.message)}
    const processing=await db.from('processings').insert({office_id:officeId,document_id:id,status:'Na fila',progress:0}).select().single();
    if(processing.error)throw new Error(processing.error.message);
    const signed=await db.storage.from('das-documents').createSignedUrl(path,3600);
    if(signed.error)throw new Error(signed.error.message);
    if(!process.env.N8N_WEBHOOK_URL)throw new Error('N8N_WEBHOOK_URL não configurada.');
    await db.from('processings').update({status:'Aguardando n8n',progress:10,started_at:new Date().toISOString()}).eq('id',processing.data.id);
    await db.from('documents').update({status:'Processando'}).eq('id',id);
    const response=await fetch(process.env.N8N_WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json','x-webhook-secret':process.env.N8N_WEBHOOK_SECRET||''},body:JSON.stringify({documentId:id,processingId:processing.data.id,originalName:file.name,fileUrl:signed.data.signedUrl,officeId,competence:form.get('competence')})});
    const responseText=(await response.text()).slice(0,2000);
    await db.from('attempts').insert({office_id:officeId,processing_id:processing.data.id,attempt:1,request:{documentId:id,originalName:file.name,competence:form.get('competence')},response:{status:response.status,body:responseText}});
    if(!response.ok){await db.from('processings').update({status:'Erro',progress:0,error_message:`n8n respondeu ${response.status}: ${responseText.slice(0,300)}`}).eq('id',processing.data.id);await db.from('documents').update({status:'Erro'}).eq('id',id);throw new Error(`Falha ao iniciar automação no n8n (${response.status}).`)}
    return Response.json({id,processingId:processing.data.id,hash,status:'Processando'});
  }catch(error){return apiError(error)}
}
