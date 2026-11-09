import {authError,requireAppContext,requireIssuer} from '@/lib/auth-context';
import {supabaseAdmin} from '@/lib/supabase-server';
import {localMode,localQuery} from '@/lib/local-db';
import {z} from 'zod';

const input=z.object({recipientEmail:z.string().email().max(254),idempotencyKey:z.string().uuid()}).strict();
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const context=await requireAppContext(request,'nfse',['admin','operator']),{id}=await params,parsed=input.safeParse(await request.json());
  if(!parsed.success)return Response.json({error:'Destinatário ou chave idempotente inválidos.',issues:parsed.error.issues},{status:400});
  if(localMode()){
   const invoice=await localQuery<{issuer_id:string;status:string}>('select issuer_id,status from nfse_invoices where id=$1 and office_id=$2',[id,context.officeId]);if(!invoice.rows[0])return Response.json({error:'Nota não encontrada.'},{status:404});requireIssuer(context,invoice.rows[0].issuer_id);if(invoice.rows[0].status!=='authorized')return Response.json({error:'A distribuição só pode ser preparada após resultado concluído.'},{status:409});
   const saved=await localQuery<{id:string;status:string}>("insert into nfse_deliveries(office_id,invoice_id,recipient_email,status,idempotency_key,created_by) values($1,$2,$3,'pending_approval',$4,$5) on conflict(office_id,invoice_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key where nfse_deliveries.recipient_email=excluded.recipient_email returning id,status",[context.officeId,id,parsed.data.recipientEmail,parsed.data.idempotencyKey,context.userId]);if(!saved.rows[0])return Response.json({error:'Chave idempotente reutilizada para outro destinatário.'},{status:409});return Response.json({...saved.rows[0],simulation:true,message:'Distribuição preparada. Nenhum e-mail foi enviado.'},{status:201});
  }
  const db=supabaseAdmin(),invoice=await db.from('nfse_invoices').select('id,issuer_id,status').eq('id',id).eq('office_id',context.officeId).maybeSingle();
  if(invoice.error)throw new Error(invoice.error.message);if(!invoice.data)return Response.json({error:'Nota não encontrada.'},{status:404});requireIssuer(context,invoice.data.issuer_id);
  if(invoice.data.status!=='authorized')return Response.json({error:'A distribuição só pode ser preparada após autorização ou resultado simulado concluído.'},{status:409});
  const prior=await db.from('nfse_deliveries').select('id,status,recipient_email').eq('office_id',context.officeId).eq('invoice_id',id).eq('idempotency_key',parsed.data.idempotencyKey).maybeSingle();
  if(prior.error)throw new Error(prior.error.message);if(prior.data)return prior.data.recipient_email===parsed.data.recipientEmail?Response.json({...prior.data,replayed:true}):Response.json({error:'Chave idempotente reutilizada para outro destinatário.'},{status:409});
  const saved=await db.from('nfse_deliveries').insert({office_id:context.officeId,invoice_id:id,recipient_email:parsed.data.recipientEmail,status:'pending_approval',idempotency_key:parsed.data.idempotencyKey,created_by:context.userId}).select('id,status').single();
  if(saved.error)throw new Error(saved.error.message);return Response.json({...saved.data,message:'Distribuição preparada. Nenhum e-mail foi enviado automaticamente.'},{status:201});
 }catch(error){return authError(error)}
}
