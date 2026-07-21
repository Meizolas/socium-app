import {attemptDocumentDelivery} from '@/lib/deliveries';
import {apiError,getOfficeId,supabaseAdmin} from '@/lib/supabase-server';

export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params,db=supabaseAdmin(),officeId=await getOfficeId(),document=await db.from('documents').select('id').eq('id',id).eq('office_id',officeId).maybeSingle();if(document.error)throw new Error(document.error.message);if(!document.data)return Response.json({error:'Documento não encontrado.'},{status:404});return Response.json(await attemptDocumentDelivery(id))}catch(error){return apiError(error)}}
