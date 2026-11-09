import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {sessionToken} from '@/lib/auth-context';

const input=z.object({
  name:z.string().trim().min(2).max(120),
  officeName:z.string().trim().min(2).max(200),
  taxId:z.string().trim().max(32).optional().default(''),
  offer:z.enum(['documentos','nfse','completo']),
  idempotencyKey:z.string().uuid(),
}).strict();

export async function POST(request:Request){
  try{
    const token=sessionToken(request);
    if(!token)return Response.json({error:'Autenticação necessária.'},{status:401});
    const parsed=input.safeParse(await request.json());
    if(!parsed.success)return Response.json({error:'Dados de cadastro inválidos.',issues:parsed.error.issues},{status:400});
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if(!url||!anon)return Response.json({error:'Auth não configurado.'},{status:503});
    const db=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:userError}=await db.auth.getUser(token);
    if(userError||!user||!user.email_confirmed_at)return Response.json({error:'Sessão inválida ou e-mail não confirmado.'},{status:401});
    const value=parsed.data;
    const result=await db.rpc('complete_public_onboarding',{p_name:value.name,p_office_name:value.officeName,p_tax_id:value.taxId,p_offer:value.offer,p_key:value.idempotencyKey});
    if(result.error){
      if(result.error.message.includes('membership_already_exists'))return Response.json({error:'Esta conta já possui um contratante.'},{status:409});
      throw new Error(result.error.message);
    }
    return Response.json({officeId:result.data,status:'pending_activation'},{status:201});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:'Não foi possível concluir o cadastro.'},{status:500});
  }
}
