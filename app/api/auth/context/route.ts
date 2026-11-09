import {requireAppContext,authError} from '@/lib/auth-context';
import {cookies} from 'next/headers';import {localMode} from '@/lib/local-db';import {createLocalSession,localCookie} from '@/lib/local-session';

export async function GET(request:Request){
  try{
    const context=await requireAppContext(request);
    if(localMode())(await cookies()).set(localCookie.name,createLocalSession(context.userId),localCookie.options);
    return Response.json(context,{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    return authError(error);
  }
}
