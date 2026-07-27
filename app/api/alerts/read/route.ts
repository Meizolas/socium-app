import {apiError,getOfficeId,supabaseAdmin} from '@/lib/supabase-server';

export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>({}));
    const parsed=new Date(String(body.readBefore||new Date().toISOString()));
    if(Number.isNaN(parsed.getTime()))return Response.json({error:'Data de leitura inválida.'},{status:400});
    const readBefore=parsed.toISOString(),readAt=new Date().toISOString();
    const db=supabaseAdmin(),officeId=await getOfficeId();
    const result=await db.from('alerts')
      .update({read_at:readAt})
      .eq('office_id',officeId)
      .is('read_at',null)
      .lte('created_at',readBefore)
      .select('id');
    if(result.error)throw new Error(result.error.message);
    const remaining=await db.from('alerts')
      .select('id',{count:'exact',head:true})
      .eq('office_id',officeId)
      .is('resolved_at',null)
      .is('read_at',null);
    if(remaining.error)throw new Error(remaining.error.message);
    return Response.json({read:true,readAt,updated:result.data?.length||0,unread:remaining.count||0});
  }catch(error){return apiError(error)}
}
