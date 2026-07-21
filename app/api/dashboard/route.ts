import {apiError,getOfficeId,supabaseAdmin} from '@/lib/supabase-server';

export async function GET(){
  try{
    const db=supabaseAdmin(),officeId=await getOfficeId();
    const [clients,documents,processings,alerts,deliveries]=await Promise.all([
      db.from('clients').select('*').eq('office_id',officeId).order('legal_name'),
      db.from('documents').select('*').eq('office_id',officeId).order('created_at',{ascending:false}).limit(100),
      db.from('processings').select('*').eq('office_id',officeId).order('updated_at',{ascending:false}).limit(100),
      db.from('alerts').select('*').eq('office_id',officeId).is('resolved_at',null).order('created_at',{ascending:false}).limit(20),
      db.from('deliveries').select('document_id,channel,status,sent_at,error_message').eq('office_id',officeId),
    ]);
    for(const result of [clients,documents,processings,alerts,deliveries])if(result.error)throw new Error(result.error.message);
    const clientMap=new Map((clients.data||[]).map(client=>[client.id,client]));
    const processingMap=new Map((processings.data||[]).map(processing=>[processing.document_id,processing]));
    const deliveryMap=new Map<string,{email:boolean,whatsapp:boolean,hasError:boolean}>();
    for(const delivery of deliveries.data||[]){
      const state=deliveryMap.get(delivery.document_id)||{email:false,whatsapp:false,hasError:false};
      if(delivery.status==='Enviado'&&delivery.channel==='email')state.email=true;
      if(delivery.status==='Enviado'&&delivery.channel==='whatsapp')state.whatsapp=true;
      if(delivery.status==='Erro')state.hasError=true;
      deliveryMap.set(delivery.document_id,state);
    }
    const jobs=(documents.data||[]).map(document=>{
      const client=document.client_id?clientMap.get(document.client_id):null,delivery=deliveryMap.get(document.id),preference=String(client?.preference||'');
      let displayStatus=String(document.status);
      if(delivery?.email&&delivery.whatsapp)displayStatus='Enviado no e-mail + WhatsApp';
      else if(delivery?.email)displayStatus=/whatsapp/i.test(preference)?'Parcial — enviado no e-mail':'Enviado no e-mail';
      else if(delivery?.whatsapp)displayStatus=/e-mail|email/i.test(preference)?'Parcial — enviado no WhatsApp':'Enviado no WhatsApp';
      else if(delivery?.hasError)displayStatus='Erro no envio';
      return {id:document.id,file:document.final_name||document.original_name,size:'—',client:client?.legal_name||'Cliente não identificado',cnpj:document.extracted_cnpj||'',stage:processingMap.get(document.id)?.status||document.status,progress:processingMap.get(document.id)?.progress||0,status:displayStatus,time:document.updated_at||document.created_at,duration:'—',competence:document.competence};
    });
    return Response.json({officeId,clients:clients.data||[],jobs,alerts:alerts.data||[]});
  }catch(error){return apiError(error)}
}
