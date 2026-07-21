import {getOfficeId} from '@/lib/supabase-server';
import {createOAuthState,googleOAuthConfig} from '@/lib/google-oauth';

export async function GET(){
  try{
    const {clientId,redirectUri}=googleOAuthConfig(),officeId=await getOfficeId();
    const query=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',access_type:'offline',prompt:'consent',include_granted_scopes:'true',scope:'openid email https://www.googleapis.com/auth/gmail.send',state:createOAuthState(officeId)});
    return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${query}`);
  }catch(error){const message=error instanceof Error?error.message:'Erro ao iniciar OAuth.';return Response.json({error:message},{status:500})}
}
