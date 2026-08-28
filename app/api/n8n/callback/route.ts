import {attemptBatchDelivery,attemptDocumentDelivery} from '@/lib/deliveries';
import {normalizeCnpj} from '@/lib/format';
import {apiError,supabaseAdmin} from '@/lib/supabase-server';

export async function POST(req:Request){
  if(!process.env.N8N_CALLBACK_SECRET||req.headers.get('x-callback-secret')!==process.env.N8N_CALLBACK_SECRET)return Response.json({error:'Não autorizado'},{status:401});

  let processingId='',documentId='',officeId='';
  try{
    const p=await req.json(),db=supabaseAdmin();
    processingId=String(p.processingId||'').replace(/^=/,'').trim();
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(processingId))return Response.json({error:'processingId inválido'},{status:400});

    const current=await db.from('processings').select('document_id,office_id,documents(batch_id,document_category)').eq('id',processingId).single();
    if(current.error)throw new Error(current.error.message);
    documentId=current.data.document_id;
    officeId=current.data.office_id;

    const finalName=String(p.finalName||'').replace(/^=/,'').trim();
    const extractedShortName=String(p.shortName||'').replace(/^=/,'').trim().slice(0,120);
    const nameFromFile=finalName.replace(/\.pdf$/i,'').split(/\s+-\s+/).slice(1,-1).join(' - ').trim();
    const extractedLegalName=String(p.legalName||extractedShortName||nameFromFile).replace(/^=/,'').trim().slice(0,250);
    let clientId:string|null=null,clientNeedsCompletion=false,clientWasCreated=false;
    const cnpj=normalizeCnpj(p.cnpj);
    if(cnpj){
      const found=await db.from('clients').select('id,email,whatsapp,preference,auto_created').eq('office_id',officeId).eq('cnpj',cnpj).maybeSingle();
      if(found.error)throw new Error(found.error.message);
      if(found.data){
        clientId=found.data.id;
        clientNeedsCompletion=Boolean(found.data.auto_created||(!found.data.email&&!found.data.whatsapp));
      }else if(extractedLegalName){
        const created=await db.from('clients').insert({
          office_id:officeId,
          legal_name:extractedLegalName,
          trade_name:extractedShortName||null,
          cnpj,
          email:null,
          whatsapp:null,
          preference:'Somente e-mail',
          active:false,
          auto_created:true,
          notes:'Cadastro provisório criado automaticamente a partir de uma guia. Complete os contatos antes do envio.',
        }).select('id').single();
        if(created.error)throw new Error(created.error.message);
        clientId=created.data.id;
        clientNeedsCompletion=true;
        clientWasCreated=true;
      }
    }

    const failed=Boolean(p.errorMessage);
    const status=failed?'Erro no processamento':p.currentStep&&p.currentStep<4?'Extraindo dados da guia':'Dados extraídos — identificando cliente';
    const processing=await db.from('processings').update({
      current_step:Number(p.currentStep)||1,
      status,
      progress:failed?100:p.currentStep&&p.currentStep<4?Math.max(35,Math.min(65,Number(p.progress)||50)):70,
      error_message:p.errorMessage||null,
      finished_at:failed?new Date().toISOString():null,
    }).eq('id',processingId);
    if(processing.error)throw new Error(processing.error.message);

    const dateText=String(p.dueDate||'');
    const dateMatch=dateText.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const dueDate=dateMatch?`${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`:dateText||null;
    const amountText=String(p.amount??'').replace(/[^0-9,.-]/g,'');
    const amount=amountText?Number(amountText.includes(',')?amountText.replace(/\./g,'').replace(',','.'):amountText):null;
    const receivedType=String(p.type||'').replace(/^=/,'').trim().toUpperCase().slice(0,30);
    const inferredType=String(finalName).match(/^(DAS|DARF|DAE|DAM|GPS|FGTS)\b/i)?.[1]?.toUpperCase();
    const documentType=receivedType&&receivedType!=='GUIA'?receivedType:inferredType||'GUIA';
    const documentChanges:Record<string,unknown>={
      client_id:clientId,
      extracted_cnpj:cnpj||null,
      extracted_legal_name:extractedLegalName||null,
      extracted_short_name:extractedShortName||null,
      document_type:documentType||'GUIA',
      due_date:dueDate,
      amount:Number.isFinite(amount)?amount:null,
      final_name:finalName||null,
      status:failed?'Erro':clientId&&!clientNeedsCompletion?'Pronto para envio':'Revisão necessária',
    };
    if(/^\d{2}\/\d{4}$/.test(String(p.competence||'')))documentChanges.competence=p.competence;
    const document=await db.from('documents').update(documentChanges).eq('id',documentId);
    if(document.error)throw new Error(document.error.message);

    if(clientNeedsCompletion&&cnpj){
      await db.from('processings').update({status:'Processado — cadastro do cliente incompleto',progress:100,finished_at:new Date().toISOString()}).eq('id',processingId);
      await db.from('alerts').insert({
        office_id:officeId,
        document_id:documentId,
        type:clientWasCreated?'Cadastro provisório criado — complete os contatos':'Cadastro incompleto — envio bloqueado',
        severity:'Atenção',
        title:`${extractedLegalName||'Razão social extraída'} — CNPJ ${cnpj}. Informe e-mail/WhatsApp e escolha a preferência para liberar o envio.`,
      });
    }
    if(!failed&&!(clientNeedsCompletion&&cnpj)&&!(p.currentStep&&p.currentStep<4)){
      const relation=Array.isArray(current.data.documents)?current.data.documents[0]:current.data.documents;
      if(relation?.batch_id)await attemptBatchDelivery(relation.batch_id);
      else if(clientId&&!clientNeedsCompletion)await attemptDocumentDelivery(documentId);
    }
    return Response.json({received:true,processingId});
  }catch(error){
    const message=error instanceof Error?error.message:'Erro desconhecido no callback.';
    if(processingId&&documentId&&officeId){
      const db=supabaseAdmin();
      await Promise.all([
        db.from('processings').update({status:'Erro no processamento',progress:100,error_message:message,finished_at:new Date().toISOString()}).eq('id',processingId),
        db.from('documents').update({status:'Erro'}).eq('id',documentId),
        db.from('alerts').insert({office_id:officeId,document_id:documentId,type:'Erro no processamento',severity:'Crítico',title:message.slice(0,300)}),
      ]);
    }
    return apiError(error);
  }
}
