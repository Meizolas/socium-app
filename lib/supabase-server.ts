import {createClient} from '@supabase/supabase-js';

export function supabaseAdmin(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('Supabase não configurado no servidor.');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}

export async function getOfficeId(){
  const db=supabaseAdmin();
  const configured=process.env.SUPABASE_OFFICE_ID;
  if(configured) return configured;
  const {data,error}=await db.from('offices').select('id').order('created_at').limit(1).maybeSingle();
  if(error) throw new Error(`Banco não inicializado: ${error.message}`);
  if(data) return data.id as string;
  const created=await db.from('offices').insert({name:process.env.OFFICE_NAME||'Socium Contábil'}).select('id').single();
  if(created.error) throw new Error(created.error.message);
  return created.data.id as string;
}

export function apiError(error:unknown,status=500){
  const message=error instanceof Error?error.message:'Erro interno.';
  return Response.json({error:message},{status});
}
