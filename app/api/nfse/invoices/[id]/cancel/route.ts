import {z} from "zod";
import {authError,requireAppContext,supabaseForSession} from "@/lib/auth-context";
import {localMode,localTransaction} from "@/lib/local-db";

const input=z.object({reasonCode:z.enum(["1","2","9"]),reason:z.string().trim().min(15).max(255)});

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const context=await requireAppContext(request,"nfse",["admin","operator"]),{id}=await params,parsed=input.safeParse(await request.json());
  if(!/^[0-9a-f-]{36}$/i.test(id))return Response.json({error:"Nota inválida."},{status:400});
  if(!parsed.success)return Response.json({error:"Informe o motivo e uma justificativa entre 15 e 255 caracteres."},{status:400});
  if(localMode()){
   const result=await localTransaction(async db=>{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[context.userId]);return db.query("select (enqueue_nfse_cancellation($1,$2,$3)).*",[id,parsed.data.reasonCode,parsed.data.reason])});
   if(!result.rows[0])return Response.json({error:"Nota não encontrada."},{status:404});
   return Response.json({jobId:result.rows[0].id,status:result.rows[0].status},{status:202});
  }
  const db=supabaseForSession(request),invoice=await db.from("nfse_invoices").select("issuer_id").eq("id",id).maybeSingle();
  if(invoice.error)throw new Error(invoice.error.message);
  if(!invoice.data)return Response.json({error:"Nota não encontrada."},{status:404});
  if(context.issuerScope&&!context.issuerScope.includes(invoice.data.issuer_id))return Response.json({error:"Emitente fora do escopo."},{status:403});
  const result=await db.rpc("enqueue_nfse_cancellation",{p_invoice:id,p_reason_code:parsed.data.reasonCode,p_reason:parsed.data.reason});
  if(result.error)return Response.json({error:translate(result.error.message)},{status:409});
  return Response.json({jobId:result.data.id,status:result.data.status},{status:202});
 }catch(error){return authError(error)}
}

function translate(message:string){
 if(message.includes("invoice_already_cancelled"))return "Esta NFS-e já foi cancelada.";
 if(message.includes("invoice_not_cancellable"))return "Somente uma NFS-e autorizada pode ser cancelada.";
 if(message.includes("cancellation_authorization_required"))return "O certificado atual não possui autorização para cancelar esta NFS-e.";
 if(message.includes("invalid_cancellation_reason"))return "Informe uma justificativa entre 15 e 255 caracteres.";
 return "Não foi possível solicitar o cancelamento.";
}
