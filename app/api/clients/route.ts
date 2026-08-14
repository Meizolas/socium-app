import {apiError,getOfficeId,supabaseAdmin} from '@/lib/supabase-server';
import {normalizeCnpj} from '@/lib/format';

export async function POST(req:Request){
  try{
    const db=supabaseAdmin(),officeId=await getOfficeId(),body=await req.json();
    const cnpj=normalizeCnpj(body.cnpj);if(cnpj.length!==14)return Response.json({error:'CNPJ deve conter 14 dígitos.'},{status:400});
    const additionalEmails=[...new Set(String(body.additionalEmails||'').split(/[;,\n]/).map((email:string)=>email.trim().toLowerCase()).filter(Boolean))];
    const invalidEmail=additionalEmails.find((email:string)=>!/^\S+@\S+\.\S+$/.test(email));if(invalidEmail)return Response.json({error:`E-mail adicional inválido: ${invalidEmail}`},{status:400});
    const hasContact=Boolean(String(body.email||'').trim()||additionalEmails.length||String(body.phone||'').trim());
    const payload={office_id:officeId,legal_name:body.name,trade_name:body.tradeName||null,cnpj,owner_name:body.owner||null,email:body.email||null,additional_emails:additionalEmails,whatsapp:body.phone||null,preference:body.pref||'Somente e-mail',active:hasContact&&body.active!==false,auto_created:body.id?!hasContact:Boolean(body.autoCreated),notes:body.notes||null};
    const result=body.id?await db.from('clients').update(payload).eq('id',body.id).eq('office_id',officeId).select().single():await db.from('clients').insert(payload).select().single();
    if(result.error) throw new Error(result.error.message);
    return Response.json(result.data,{status:body.id?200:201});
  }catch(error){return apiError(error,400)}
}
