import {createClient} from '@supabase/supabase-js';
import {headers} from 'next/headers';
export function supabaseAdmin(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('Supabase não configurado no servidor.');return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})}
export async function getOfficeId(){const h=await headers(),n8n=h.get('x-n8n-secret'),configured=process.env.SUPABASE_OFFICE_ID;if(n8n&&process.env.N8N_CALLBACK_SECRET&&n8n===process.env.N8N_CALLBACK_SECRET&&configured)return configured;const {requireAppContext}=await import('./auth-context');const request=new Request(process.env.APP_URL||'http://localhost',{headers:new Headers(h)}),context=await requireAppContext(request,'documentos');return context.officeId}
export function apiError(error:unknown,status=500){return Response.json({error:error instanceof Error?error.message:'Erro interno.'},{status})}
