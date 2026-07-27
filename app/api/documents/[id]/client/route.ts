import {normalizeCnpj} from '@/lib/format';
import {apiError,getOfficeId,supabaseAdmin} from '@/lib/supabase-server';

function nameFromFile(value:string){
  const parts=value.replace(/\.pdf$/i,'').split(/\s+-\s+/).map(part=>part.trim()).filter(Boolean);
  if(parts.length>=3)return parts.slice(1,-1).join(' - ');
  return parts[1]||'Cliente extraído da guia';
}

export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params,db=supabaseAdmin(),officeId=await getOfficeId();
    const document=await db.from('documents').select('id,client_id,extracted_cnpj,extracted_legal_name,extracted_short_name,final_name,original_name').eq('id',id).eq('office_id',officeId).single();
    if(document.error)throw new Error(document.error.message);
    if(document.data.client_id)return Response.json({clientId:document.data.client_id,created:false});
    const cnpj=normalizeCnpj(document.data.extracted_cnpj);
    if(cnpj.length!==14)return Response.json({error:'O documento não possui um CNPJ válido extraído.'},{status:400});
    let client=await db.from('clients').select('id').eq('office_id',officeId).eq('cnpj',cnpj).maybeSingle();
    if(client.error)throw new Error(client.error.message);
    let clientId=client.data?.id;
    if(!clientId){
      const legalName=document.data.extracted_legal_name||nameFromFile(document.data.final_name||document.data.original_name);
      const created=await db.from('clients').insert({office_id:officeId,legal_name:legalName,trade_name:document.data.extracted_short_name||null,cnpj,email:null,whatsapp:null,preference:'Envio manual',active:false,auto_created:true,notes:'Cadastro provisório criado automaticamente a partir de uma guia. Complete os contatos antes do envio.'}).select('id').single();
      if(created.error)throw new Error(created.error.message);
      clientId=created.data.id;
    }
    const linked=await db.from('documents').update({client_id:clientId,status:'Revisão necessária'}).eq('id',id).eq('office_id',officeId);
    if(linked.error)throw new Error(linked.error.message);
    return Response.json({clientId,created:!client.data});
  }catch(error){return apiError(error,400)}
}
