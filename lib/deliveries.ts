import {getCredential} from './credentials';
import {supabaseAdmin} from './supabase-server';

type Channel='email'|'whatsapp';
type ChannelResult={channel:Channel,status:'sent'|'already_sent'|'error',error?:string};

async function documentData(documentId:string){
  const db=supabaseAdmin();
  const doc=await db.from('documents').select('*,clients(*)').eq('id',documentId).single();
  if(doc.error)throw new Error(doc.error.message);
  const file=await db.storage.from('das-documents').download(doc.data.storage_path);
  if(file.error)throw new Error(file.error.message);
  return {db,doc:doc.data,client:doc.data.clients,bytes:Buffer.from(await file.data.arrayBuffer())};
}

async function record(documentId:string,officeId:string,channel:Channel,status:'Enviado'|'Erro',error?:string){
  const result=await supabaseAdmin().from('deliveries').insert({office_id:officeId,document_id:documentId,channel,status,sent_at:status==='Enviado'?new Date().toISOString():null,error_message:error?.slice(0,500)||null});
  if(result.error)throw new Error(result.error.message);
}

export async function sendWhatsApp(documentId:string){
  const credential=await getCredential('evolution');
  if(!credential)throw new Error('Evolution API não configurada.');
  const {db,doc,client,bytes}=await documentData(documentId);
  const number=String(client?.whatsapp||'').replace(/\D/g,'');
  if(!number)throw new Error('Cliente sem número de WhatsApp cadastrado.');
  const fileName=doc.final_name?.endsWith('.pdf')?doc.final_name:`${doc.final_name||doc.original_name.replace(/\.pdf$/i,'')}.pdf`;
  const response=await fetch(`${credential.config.baseUrl}/message/sendMedia/${encodeURIComponent(credential.config.instance)}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:credential.secrets.apiKey},body:JSON.stringify({number,mediatype:'document',mimetype:'application/pdf',caption:`Olá! Segue ${fileName}.`,media:bytes.toString('base64'),fileName})});
  const text=await response.text();
  if(!response.ok)throw new Error(`Evolution API: ${response.status} ${text.slice(0,200)}`);
  await record(documentId,doc.office_id,'whatsapp','Enviado');
  return true;
}

export async function sendGmail(documentId:string){
  const credential=await getCredential('gmail');
  if(!credential)throw new Error('Conta Google ainda não conectada.');
  const clientId=process.env.GOOGLE_CLIENT_ID||credential.secrets.clientId;
  const clientSecret=process.env.GOOGLE_CLIENT_SECRET||credential.secrets.clientSecret;
  if(!clientId||!clientSecret||!credential.secrets.refreshToken)throw new Error('OAuth do Google incompleto. Reconecte a conta em Configurações.');
  const {doc,client,bytes}=await documentData(documentId);
  if(!client?.email)throw new Error('Cliente sem e-mail cadastrado.');
  const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:credential.secrets.refreshToken,grant_type:'refresh_token'})});
  const tokenBody=await token.json();
  if(!token.ok)throw new Error(`Google OAuth: ${tokenBody.error_description||tokenBody.error}`);
  const fileName=doc.final_name?.endsWith('.pdf')?doc.final_name:`${doc.final_name||doc.original_name.replace(/\.pdf$/i,'')}.pdf`;
  const boundary=`socium_${Date.now()}`;
  const mime=[`From: ${credential.config.fromEmail}`,`To: ${client.email}`,`Subject: Documento ${fileName}`,'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset="UTF-8"','','Olá! Segue o documento em anexo.','',`--${boundary}`,`Content-Type: application/pdf; name="${fileName}"`,'Content-Transfer-Encoding: base64',`Content-Disposition: attachment; filename="${fileName}"`,'',bytes.toString('base64'),`--${boundary}--`].join('\r\n');
  const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:`Bearer ${tokenBody.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({raw:Buffer.from(mime).toString('base64url')})});
  const text=await response.text();
  if(!response.ok)throw new Error(`Gmail API: ${response.status} ${text.slice(0,200)}`);
  await record(documentId,doc.office_id,'email','Enviado');
  return true;
}

export async function attemptDocumentDelivery(documentId:string){
  const db=supabaseAdmin();
  const document=await db.from('documents').select('id,office_id,status,clients(preference,auto_created,email,whatsapp)').eq('id',documentId).single();
  if(document.error)throw new Error(document.error.message);
  const client=Array.isArray(document.data.clients)?document.data.clients[0]:document.data.clients;
  if(!client)return {status:'blocked',message:'Cliente não cadastrado. Cadastre o cliente e informe e-mail/WhatsApp antes de enviar.',results:[] as ChannelResult[]};
  if(client.auto_created||(!client.email&&!client.whatsapp))return {status:'blocked',message:'Cadastro incompleto. Informe e-mail/WhatsApp e escolha a preferência de envio.',results:[] as ChannelResult[]};
  const preference=String(client?.preference||'Envio manual');
  const channels:Channel[]=[];
  if(/e-mail|email/i.test(preference))channels.push('email');
  if(/whatsapp/i.test(preference))channels.push('whatsapp');
  if(!channels.length)return {status:'manual',message:'Cliente configurado para envio manual.',results:[] as ChannelResult[]};

  await db.from('documents').update({status:'Enviando'}).eq('id',documentId);
  const previous=await db.from('deliveries').select('channel').eq('document_id',documentId).eq('status','Enviado').in('channel',channels);
  if(previous.error)throw new Error(previous.error.message);
  const sentBefore=new Set((previous.data||[]).map(row=>row.channel));
  const results:ChannelResult[]=[];
  for(const channel of channels){
    if(sentBefore.has(channel)){results.push({channel,status:'already_sent'});continue}
    try{
      if(channel==='email')await sendGmail(documentId);else await sendWhatsApp(documentId);
      results.push({channel,status:'sent'});
    }catch(error){
      const message=error instanceof Error?error.message:'Falha desconhecida no envio.';
      await record(documentId,document.data.office_id,channel,'Erro',message);
      results.push({channel,status:'error',error:message});
    }
  }
  const successful=results.filter(result=>result.status!=='error').length;
  const status=successful===channels.length?'Enviado':successful>0?'Parcial':'Erro';
  await db.from('documents').update({status}).eq('id',documentId);
  const errors=results.filter(result=>result.error).map(result=>`${result.channel==='email'?'E-mail':'WhatsApp'}: ${result.error}`);
  if(errors.length)await db.from('alerts').insert({office_id:document.data.office_id,document_id:documentId,type:'Falha de envio',severity:'Crítico',title:errors.join(' | ').slice(0,300)});
  return {status:status.toLowerCase(),message:errors.length?errors.join(' | '):'Envio concluído com sucesso.',results};
}
