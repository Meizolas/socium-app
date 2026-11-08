import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabase-server";

export type AppModule = "documentos" | "nfse";
export type AppRole = "admin" | "operator";
export type AppContext = { userId:string; officeId:string; role:AppRole; effectiveModules:AppModule[]; issuerScope:string[]|null };

export class AuthError extends Error { constructor(message:string,public status:401|403){super(message)} }

function bearer(request:Request){
  const value=request.headers.get("authorization")||"";
  return value.startsWith("Bearer ")?value.slice(7):"";
}

export async function requireAppContext(request:Request,module?:AppModule,roles?:AppRole[]):Promise<AppContext>{
  const token=bearer(request);
  if(!token)throw new AuthError("Autenticação necessária.",401);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!anon)throw new Error("Supabase Auth não configurado.");
  const auth=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await auth.auth.getUser(token);
  if(error||!user||!user.email_confirmed_at)throw new AuthError("Sessão inválida ou e-mail não confirmado.",401);
  const db=supabaseAdmin();
  const profile=await db.from("profiles").select("office_id,role").eq("id",user.id).maybeSingle();
  if(profile.error)throw new Error(profile.error.message);
  if(!profile.data)throw new AuthError("Cadastro do escritório ainda não concluído.",403);
  const modules=await db.from("office_modules").select("module,status").eq("office_id",profile.data.office_id);
  const restrictions=await db.from("profile_module_access").select("module,allowed").eq("profile_id",user.id);
  if(modules.error||restrictions.error)throw new Error(modules.error?.message||restrictions.error?.message);
  const denied=new Set((restrictions.data||[]).filter(x=>!x.allowed).map(x=>x.module));
  const effectiveModules=(modules.data||[]).filter(x=>x.status==="active"&&!denied.has(x.module)).map(x=>x.module) as AppModule[];
  const scope=await db.from("nfse_profile_issuer_access").select("issuer_id,allowed").eq("profile_id",user.id);
  const context:AppContext={userId:user.id,officeId:profile.data.office_id,role:profile.data.role as AppRole,effectiveModules,issuerScope:scope.error?null:(scope.data||[]).filter(x=>x.allowed).map(x=>x.issuer_id)};
  if(module&&!effectiveModules.includes(module))throw new AuthError("Módulo não habilitado para esta conta.",403);
  if(roles&&!roles.includes(context.role))throw new AuthError("Papel sem permissão para esta operação.",403);
  return context;
}

export function authError(error:unknown){
  if(error instanceof AuthError)return Response.json({error:error.message},{status:error.status});
  const message=error instanceof Error?error.message:"Erro interno.";
  return Response.json({error:message},{status:500});
}
