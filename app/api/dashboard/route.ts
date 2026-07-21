import {apiError,getOfficeId,supabaseAdmin} from '@/lib/supabase-server';

export async function GET(){
  try{
    const db=supabaseAdmin(),officeId=await getOfficeId();
    const [clients,documents,processings,alerts]=await Promise.all([
      db.from('clients').select('*').eq('office_id',officeId).order('legal_name'),
      db.from('documents').select('*').eq('office_id',officeId).order('created_at',{ascending:false}).limit(100),
      db.from('processings').select('*').eq('office_id',officeId).order('updated_at',{ascending:false}).limit(100),
      db.from('alerts').select('*').eq('office_id',officeId).is('resolved_at',null).order('created_at',{ascending:false}).limit(20),
    ]);
    for(const result of [clients,documents,processings,alerts]) if(result.error) throw new Error(result.error.message);
    const clientMap=new Map((clients.data||[]).map(c=>[c.id,c]));
    const processingMap=new Map((processings.data||[]).map(p=>[p.document_id,p]));
    const jobs=(documents.data||[]).map(d=>({
      id:d.id,file:d.final_name||d.original_name,size:'—',client:d.client_id?clientMap.get(d.client_id)?.legal_name||'Cliente não identificado':'Cliente não identificado',
      cnpj:d.extracted_cnpj||'',stage:processingMap.get(d.id)?.status||d.status,progress:processingMap.get(d.id)?.progress||0,
      status:d.status,time:d.updated_at||d.created_at,duration:'—',competence:d.competence
    }));
    return Response.json({officeId,clients:clients.data||[],jobs,alerts:alerts.data||[]});
  }catch(error){return apiError(error)}
}
