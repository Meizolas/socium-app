import {encryptSecret} from '@/lib/credentials';
import {googleOAuthConfig,readOAuthState} from '@/lib/google-oauth';
import {supabaseAdmin} from '@/lib/supabase-server';

export async function GET(request:Request){
  const appUrl=(process.env.APP_URL||new URL(request.url).origin).replace(/\/$/,'');
  try{
    const url=new URL(request.url),error=url.searchParams.get('error');if(error)throw new Error(`Google recusou a autorização: ${error}`);
    const code=url.searchParams.get('code'),state=url.searchParams.get('state');if(!code||!state)throw new Error('Retorno OAuth incompleto.');
    const {officeId}=readOAuthState(state),{clientId,clientSecret,redirectUri}=googleOAuthConfig();
    const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:'authorization_code'})});
    const body=await token.json();if(!token.ok||!body.refresh_token)throw new Error(body.error_description||'O Google não retornou refresh token. Remova o acesso anterior e conecte novamente.');
    const profile=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${body.access_token}`}}),profileBody=await profile.json();if(!profile.ok||!profileBody.email)throw new Error('Não foi possível identificar o e-mail autorizado.');
    const saved=await supabaseAdmin().from('integration_credentials').upsert({office_id:officeId,provider:'gmail',config:{fromEmail:profileBody.email},encrypted_secret:encryptSecret({refreshToken:body.refresh_token}),enabled:true},{onConflict:'office_id,provider'});if(saved.error)throw new Error(saved.error.message);
    return Response.redirect(`${appUrl}/?gmail=connected`);
  }catch(error){const message=encodeURIComponent(error instanceof Error?error.message:'Erro OAuth.');return Response.redirect(`${appUrl}/?gmail=error&message=${message}`)}
}
