import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'crypto';
import {getOfficeId,supabaseAdmin} from './supabase-server';

type Provider='evolution'|'gmail';
function key(){const source=process.env.CREDENTIALS_ENCRYPTION_KEY;if(!source||source.length<32)throw new Error('CREDENTIALS_ENCRYPTION_KEY deve ter pelo menos 32 caracteres.');return createHash('sha256').update(source).digest()}
export function encryptSecret(value:Record<string,string>){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv),encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`}
export function decryptSecret(value:string){const [iv,tag,data]=value.split('.').map(x=>Buffer.from(x,'base64')),decipher=createDecipheriv('aes-256-gcm',key(),iv);decipher.setAuthTag(tag);return JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8')) as Record<string,string>}
export async function getCredential(provider:Provider){const db=supabaseAdmin(),officeId=await getOfficeId(),result=await db.from('integration_credentials').select('*').eq('office_id',officeId).eq('provider',provider).eq('enabled',true).maybeSingle();if(result.error)throw new Error(result.error.message);return result.data?{...result.data,secrets:decryptSecret(result.data.encrypted_secret)}:null}
