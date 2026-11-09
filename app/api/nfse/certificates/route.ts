import forge from 'node-forge';
import {createHash,randomUUID} from 'node:crypto';
import {requireAppContext,authError} from '@/lib/auth-context';
import {sealSecret,custodyReady} from '@/lib/nfse/custody';
import {supabaseAdmin} from '@/lib/supabase-server';
import {localMode,localQuery} from '@/lib/local-db';
import {localWrite} from '@/lib/local-storage';
const digits=(value:string)=>value.replace(/\D/g,'');
export async function POST(request:Request){
 let stored='';
 try{
  const context=await requireAppContext(request,'nfse',['admin']);
  if(!custodyReady())return Response.json({error:'Custódia NFS-e não configurada.'},{status:503});
  const form=await request.formData(),file=form.get('certificate'),password=String(form.get('password')||''),issuerId=String(form.get('issuerId')||'');
  if(!(file instanceof File)||!['application/x-pkcs12','application/octet-stream'].includes(file.type)||file.size<1||file.size>5_000_000||!password||!/^[0-9a-f-]{36}$/i.test(issuerId))return Response.json({error:'Arquivo, senha ou emitente inválido.'},{status:400});
  if(localMode())return uploadLocalCertificate(context.officeId,issuerId,file,password);
  const db=supabaseAdmin(),issuer=await db.from('nfse_issuers').select('id,tax_id').eq('id',issuerId).eq('office_id',context.officeId).maybeSingle();
  if(issuer.error)throw new Error(issuer.error.message);if(!issuer.data)return Response.json({error:'Emitente não encontrado.'},{status:404});
  const bytes=Buffer.from(await file.arrayBuffer());let p12:forge.pkcs12.Pkcs12Pfx;
  try{p12=forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bytes.toString('binary')),false,password)}catch{return Response.json({error:'PFX/P12 inválido ou senha incorreta.'},{status:400})}
  const certBag=p12.getBags({bagType:forge.pki.oids.certBag})[forge.pki.oids.certBag]?.[0];
  const keyBag=(p12.getBags({bagType:forge.pki.oids.pkcs8ShroudedKeyBag})[forge.pki.oids.pkcs8ShroudedKeyBag]||p12.getBags({bagType:forge.pki.oids.keyBag})[forge.pki.oids.keyBag])?.[0];
  const cert=certBag?.cert,key=keyBag?.key;if(!cert||!key)return Response.json({error:'O PKCS#12 precisa conter certificado e chave privada.'},{status:400});
  const publicKey=cert.publicKey as forge.pki.rsa.PublicKey,privateKey=key as forge.pki.rsa.PrivateKey;
  if(!publicKey.n||!privateKey.n||publicKey.n.compareTo(privateKey.n)!==0)return Response.json({error:'A chave privada não corresponde ao certificado.'},{status:400});
  const now=new Date();if(now<cert.validity.notBefore||now>cert.validity.notAfter)return Response.json({error:'Certificado fora da validade.'},{status:400});
  const subject=cert.subject.attributes.map(x=>String(x.value)).join(' '),subjectTaxIds:string[]=subject.match(/\d{14}/g)??[];
  if(!subjectTaxIds.includes(digits(issuer.data.tax_id)))return Response.json({error:'Titular do certificado incompatível com o emitente.'},{status:400});
  const fingerprint=createHash('sha256').update(Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(),'binary')).digest('hex');
  const reference=`${context.officeId}/${issuerId}/${randomUUID()}.enc`,aad=`${context.officeId}:${issuerId}:v1`;
  const sealed=sealSecret(Buffer.from(JSON.stringify({pfx:bytes.toString('base64'),password})),aad);stored=reference;
  const upload=await db.storage.from('nfse-custody').upload(reference,Buffer.from(sealed),{contentType:'application/octet-stream',upsert:false});if(upload.error)throw new Error(upload.error.message);
  const prior=await db.from('nfse_certificates').update({status:'replaced'}).eq('issuer_id',issuerId).eq('office_id',context.officeId).eq('status','active');if(prior.error)throw new Error(prior.error.message);
  const saved=await db.from('nfse_certificates').insert({office_id:context.officeId,issuer_id:issuerId,custody_provider:'supabase-encrypted',custody_reference:reference,key_version:'v1',fingerprint_sha256:fingerprint,subject_tax_id:digits(issuer.data.tax_id),not_before:cert.validity.notBefore.toISOString(),not_after:cert.validity.notAfter.toISOString(),status:'active'});if(saved.error)throw new Error(saved.error.message);
  return Response.json({uploaded:true,fingerprint,notAfter:cert.validity.notAfter.toISOString()},{status:201});
 }catch(error){if(stored)await supabaseAdmin().storage.from('nfse-custody').remove([stored]).catch(()=>{});return authError(error)}
}

async function uploadLocalCertificate(officeId:string,issuerId:string,file:File,password:string){
 const issuer=await localQuery<{tax_id:string}>('select tax_id from nfse_issuers where id=$1 and office_id=$2',[issuerId,officeId]);if(!issuer.rows[0])return Response.json({error:'Emitente não encontrado.'},{status:404});
 const bytes=Buffer.from(await file.arrayBuffer());let p12:forge.pkcs12.Pkcs12Pfx;try{p12=forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bytes.toString('binary')),false,password)}catch{return Response.json({error:'PFX/P12 inválido ou senha incorreta.'},{status:400})}
 const certBag=p12.getBags({bagType:forge.pki.oids.certBag})[forge.pki.oids.certBag]?.[0],keyBag=(p12.getBags({bagType:forge.pki.oids.pkcs8ShroudedKeyBag})[forge.pki.oids.pkcs8ShroudedKeyBag]||p12.getBags({bagType:forge.pki.oids.keyBag})[forge.pki.oids.keyBag])?.[0],cert=certBag?.cert,key=keyBag?.key;if(!cert||!key)return Response.json({error:'O PKCS#12 precisa conter certificado e chave privada.'},{status:400});
 const publicKey=cert.publicKey as forge.pki.rsa.PublicKey,privateKey=key as forge.pki.rsa.PrivateKey;if(!publicKey.n||!privateKey.n||publicKey.n.compareTo(privateKey.n)!==0)return Response.json({error:'A chave privada não corresponde ao certificado.'},{status:400});const now=new Date();if(now<cert.validity.notBefore||now>cert.validity.notAfter)return Response.json({error:'Certificado fora da validade.'},{status:400});const subject=cert.subject.attributes.map(x=>String(x.value)).join(' '),cnpj=digits(issuer.rows[0].tax_id),subjectIds:string[]=subject.match(/\d{14}/g)||[];if(!subjectIds.includes(cnpj))return Response.json({error:'Titular do certificado incompatível com o emitente.'},{status:400});
 const fingerprint=createHash('sha256').update(Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(),'binary')).digest('hex'),reference=`custody/${officeId}/${issuerId}/${randomUUID()}.enc`,aad=`${officeId}:${issuerId}:v1`,sealed=sealSecret(Buffer.from(JSON.stringify({pfx:bytes.toString('base64'),password})),aad);await localWrite(reference,Buffer.from(sealed));
 await localQuery("update nfse_certificates set status='replaced' where issuer_id=$1 and office_id=$2 and status='active'",[issuerId,officeId]);await localQuery("insert into nfse_certificates(office_id,issuer_id,custody_provider,custody_reference,key_version,fingerprint_sha256,subject_tax_id,not_before,not_after,status) values($1,$2,'local-encrypted',$3,'v1',$4,$5,$6,$7,'active')",[officeId,issuerId,reference,fingerprint,cnpj,cert.validity.notBefore,cert.validity.notAfter]);return Response.json({uploaded:true,simulation:true,fingerprint,notAfter:cert.validity.notAfter.toISOString()},{status:201});
}
