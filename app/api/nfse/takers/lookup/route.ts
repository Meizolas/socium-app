import {z} from "zod";
import {authError,requireAppContext,requireIssuer} from "@/lib/auth-context";
import {localMode,localQuery} from "@/lib/local-db";
import {supabaseAdmin} from "@/lib/supabase-server";

const input=z.object({issuerId:z.string().uuid(),taxId:z.string().transform(v=>v.replace(/\D/g,"")),legalName:z.string().trim().min(2).max(200).optional()});
function repeated(value:string){return /^(\d)\1+$/.test(value)}
function validCpf(value:string){if(!/^\d{11}$/.test(value)||repeated(value))return false;let sum=0;for(let i=0;i<9;i++)sum+=Number(value[i])*(10-i);let digit=(sum*10)%11;if(digit===10)digit=0;if(digit!==Number(value[9]))return false;sum=0;for(let i=0;i<10;i++)sum+=Number(value[i])*(11-i);digit=(sum*10)%11;if(digit===10)digit=0;return digit===Number(value[10])}
function validCnpj(value:string){if(!/^\d{14}$/.test(value)||repeated(value))return false;const calc=(length:number)=>{let sum=0,weight=length-7;for(let i=0;i<length;i++){sum+=Number(value[i])*weight--;if(weight<2)weight=9}const rest=sum%11;return rest<2?0:11-rest};return calc(12)===Number(value[12])&&calc(13)===Number(value[13])}

export async function POST(request:Request){
 try{
  const context=await requireAppContext(request,"nfse",["admin","operator","client"]),parsed=input.safeParse(await request.json());
  if(!parsed.success)return Response.json({error:"Informe um CPF ou CNPJ válido."},{status:400});
  const {issuerId,taxId}=parsed.data;requireIssuer(context,issuerId);
  if(!validCpf(taxId)&&!validCnpj(taxId))return Response.json({error:"CPF/CNPJ inválido."},{status:400});
  if(localMode()){
   const prior=await localQuery("select id,tax_id,legal_name,email,address from nfse_takers where office_id=$1 and issuer_id=$2 and tax_id=$3",[context.officeId,issuerId,taxId]);
   if(prior.rows[0])return Response.json({taker:prior.rows[0],existing:true});
   const identity=await identityFor(taxId,parsed.data.legalName);if(identity.requiresName)return Response.json(identity,{status:422});
   const saved=await localQuery("insert into nfse_takers(office_id,issuer_id,tax_id,legal_name,email,address) values($1,$2,$3,$4,$5,$6) on conflict(issuer_id,tax_id) do update set legal_name=excluded.legal_name,email=coalesce(excluded.email,nfse_takers.email),address=excluded.address returning id,tax_id,legal_name,email,address",[context.officeId,issuerId,taxId,identity.legalName,identity.email||null,JSON.stringify(identity.address||{})]);
   return Response.json({taker:saved.rows[0],created:true},{status:201});
  }
  const db=supabaseAdmin(),prior=await db.from("nfse_takers").select("id,tax_id,legal_name,email,address").eq("office_id",context.officeId).eq("issuer_id",issuerId).eq("tax_id",taxId).maybeSingle();
  if(prior.error)throw new Error(prior.error.message);if(prior.data)return Response.json({taker:prior.data,existing:true});
  const identity=await identityFor(taxId,parsed.data.legalName);if(identity.requiresName)return Response.json(identity,{status:422});
  const saved=await db.from("nfse_takers").upsert({office_id:context.officeId,issuer_id:issuerId,tax_id:taxId,legal_name:identity.legalName,email:identity.email||null,address:identity.address||{}},{onConflict:"issuer_id,tax_id"}).select("id,tax_id,legal_name,email,address").single();
  if(saved.error)throw new Error(saved.error.message);return Response.json({taker:saved.data,created:true},{status:201});
 }catch(error){return authError(error)}
}

async function identityFor(taxId:string,legalName?:string):Promise<{requiresName?:boolean;message?:string;legalName?:string;email?:string;address?:Record<string,string>} >{
 if(taxId.length===11&&!legalName)return {requiresName:true,message:"Por proteção de dados, informe somente o nome do tomador para este CPF."};
 if(taxId.length===11)return {legalName};
 const response=await fetch(`https://brasilapi.com.br/api/cnpj/v1/${taxId}`,{headers:{Accept:"application/json","User-Agent":"Helians-NFSe/1.0"},signal:AbortSignal.timeout(7000),cache:"no-store"});
 if(!response.ok)throw Object.assign(new Error("Não foi possível identificar este CNPJ agora."),{status:503});
 const company=await response.json();return {legalName:company.razao_social||company.nome_fantasia,email:company.email||undefined,address:{street:company.logradouro||"",number:company.numero||"",complement:company.complemento||"",district:company.bairro||"",city:company.municipio||"",uf:company.uf||"",postalCode:String(company.cep||"").replace(/\D/g,"")}};
}
