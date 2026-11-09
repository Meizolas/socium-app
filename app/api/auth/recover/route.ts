import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';

const input=z.object({email:z.string().email()}).strict();
export async function POST(request:Request){
  const generic={message:'Se o endereço estiver cadastrado, enviaremos as instruções de recuperação.'};
  try{
    const parsed=input.safeParse(await request.json());
    if(!parsed.success)return Response.json(generic,{status:202});
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if(!url||!anon)return Response.json({error:'Auth não configurado.'},{status:503});
    const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
    const app=(process.env.APP_URL||new URL(request.url).origin).replace(/\/$/,'');
    await auth.auth.resetPasswordForEmail(parsed.data.email,{redirectTo:`${app}/`});
    return Response.json(generic,{status:202});
  }catch{return Response.json(generic,{status:202})}
}
