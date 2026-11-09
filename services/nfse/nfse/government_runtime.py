from __future__ import annotations
import base64,gzip,hashlib,json,os,ssl,tempfile,time,urllib.error,urllib.parse,urllib.request,uuid
from datetime import datetime,timezone
from decimal import Decimal
from pathlib import Path
import psycopg
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.serialization import pkcs12
from .core import NationalDpsData,build_national_dps,validate_xsd,sign_national_dps,transmission_body,classify,SEFIN_HOMOLOGATION,SEFIN_PRODUCTION,DANFSE_HOMOLOGATION,DANFSE_PRODUCTION

def required(name:str)->str:
 value=os.getenv(name,'');
 if not value:raise RuntimeError(f'{name} não configurada.')
 return value

def enabled()->bool:
 provider=os.getenv('NFSE_PROVIDER');environment=os.getenv('NFSE_ENVIRONMENT')
 if provider=='government_homologation':return environment=='2'
 return provider=='government_production' and environment=='1' and os.getenv('NFSE_ENABLE_PRODUCTION')=='true'

class Storage:
 def __init__(self):self.base=required('SUPABASE_URL').rstrip('/');self.key=required('SUPABASE_SERVICE_ROLE_KEY')
 def request(self,method:str,bucket:str,path:str,data:bytes|None=None,content_type='application/octet-stream')->bytes:
  encoded='/'.join(urllib.parse.quote(x,safe='') for x in path.split('/'));url=f'{self.base}/storage/v1/object/{bucket}/{encoded}'
  req=urllib.request.Request(url,data=data,method=method,headers={'apikey':self.key,'Authorization':'Bearer '+self.key,'Content-Type':content_type,'x-upsert':'false'})
  try:
   with urllib.request.urlopen(req,timeout=45) as response:return response.read()
  except urllib.error.HTTPError as error:raise RuntimeError(f'Storage HTTP {error.code}') from error
 def read_custody(self,path:str)->bytes:return self.request('GET','nfse-custody',path)
 def write_document(self,path:str,data:bytes,content_type='application/xml')->None:self.request('POST','nfse-documents',path,data,content_type)
 def delete_document(self,path:str)->None:
  try:self.request('DELETE','nfse-documents',path)
  except RuntimeError:pass

def decrypt_envelope(raw:bytes,aad:str)->dict:
 version,iv,tag,data=raw.decode().split('.');
 if version!='v1':raise RuntimeError('Versão de custódia não suportada.')
 key=base64.b64decode(required('NFSE_CUSTODY_KEY_V1'))
 if len(key)!=32:raise RuntimeError('Chave de custódia inválida.')
 decode=lambda value:base64.urlsafe_b64decode(value+'='*((4-len(value)%4)%4))
 return json.loads(AESGCM(key).decrypt(decode(iv),decode(data)+decode(tag),aad.encode()))

def http(context:ssl.SSLContext,method:str,path:str,body:dict|None=None,service='sefin')->tuple[int,bytes]:
 if not path.startswith('/'):raise ValueError('Caminho fiscal inválido.')
 environment=int(os.getenv('NFSE_ENVIRONMENT','0'));base=(SEFIN_PRODUCTION if environment==1 else SEFIN_HOMOLOGATION) if service=='sefin' else (DANFSE_PRODUCTION if environment==1 else DANFSE_HOMOLOGATION);override=os.getenv('NFSE_TEST_BASE_URL','')
 if override:
  if os.getenv('APP_ENV')!='test' or not(override.startswith('http://127.0.0.1:') or override.startswith('http://localhost:')):raise RuntimeError('Override fiscal permitido somente para servidor falso local em testes.')
  base=override.rstrip('/')
 request=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),method=method,headers={'Content-Type':'application/json','Accept':'application/json'})
 class NoRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,*args,**kwargs):return None
 opener=urllib.request.build_opener(NoRedirect(),urllib.request.HTTPSHandler(context=context))
 try:
  with opener.open(request,timeout=45) as response:return response.status,response.read()
 except urllib.error.HTTPError as error:return error.code,error.read()
 except (TimeoutError,urllib.error.URLError) as error:raise TimeoutError() from error

class GovernmentRuntime:
 def __init__(self):
  if not enabled():raise RuntimeError('Ambiente governamental não habilitado de forma explícita.')
  self.environment=int(required('NFSE_ENVIRONMENT'));self.provider='SEFIN_PRODUCTION' if self.environment==1 else 'SEFIN_HOMOLOGATION';self.db=required('NFSE_DATABASE_URL');self.storage=Storage();self.worker=('production-' if self.environment==1 else 'homolog-')+str(uuid.uuid4());self.xsd=required('NFSE_DPS_XSD')
 def once(self)->int:
  with psycopg.connect(self.db,row_factory=psycopg.rows.dict_row) as conn:
   jobs=conn.execute('select * from claim_nfse_jobs(%s,10)',(self.worker,)).fetchall();conn.commit()
  for job in jobs:self.process(job)
  return len(jobs)
 def process(self,job:dict)->None:
  with psycopg.connect(self.db,row_factory=psycopg.rows.dict_row) as conn:
   if job['kind']=='issue':
    record=conn.execute("select i.*,c.custody_reference from nfse_invoices i join profiles p on p.id=i.created_by and p.office_id=i.office_id and p.role in ('admin','operator') join office_modules m on m.office_id=i.office_id and m.module='nfse' and m.status='active' join nfse_certificates c on c.issuer_id=i.issuer_id and c.status='active' where i.id=%s and (not exists(select 1 from nfse_profile_issuer_access r where r.profile_id=p.id) or exists(select 1 from nfse_profile_issuer_access r where r.profile_id=p.id and r.issuer_id=i.issuer_id and r.allowed))",(job['invoice_id'],)).fetchone()
   else:
    record=conn.execute("select i.*,c.custody_reference from nfse_invoices i join nfse_certificates c on c.issuer_id=i.issuer_id and c.status='active' where i.id=%s and i.status in ('unknown','reconciling','persistence_pending')",(job['invoice_id'],)).fetchone()
  if not record:
   self.finish(job,'cancelled',b'',None);return
  if job['kind']=='issue':self.issue(job,record)
  else:self.reconcile(job,record)
 def certificate_context(self,invoice:dict):
  aad=f"{invoice['office_id']}:{invoice['issuer_id']}:v1";secret=decrypt_envelope(self.storage.read_custody(invoice['custody_reference']),aad);key,cert,chain=pkcs12.load_key_and_certificates(base64.b64decode(secret['pfx']),secret['password'].encode());
  if key is None or cert is None:raise RuntimeError('Certificado de custódia inválido.')
  temp=tempfile.TemporaryDirectory(prefix='socium-nfse-');pem=Path(temp.name)/'client.pem';pem.write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())+cert.public_bytes(serialization.Encoding.PEM)+b''.join(x.public_bytes(serialization.Encoding.PEM) for x in (chain or [])));os.chmod(pem,0o600);context=ssl.create_default_context();context.load_cert_chain(str(pem));return temp,context,key,cert
 def issue(self,job:dict,invoice:dict)->None:
  snap=invoice['snapshot'];issuer=snap['issuer'];taker=snap['taker'];service=snap['service'];data=snap['invoice'];operation=data.get('operation') or {};tax=data.get('taxation') or {}
  if tax.get('issTaxation')!='taxable':self.finish(job,'rejected',json.dumps({'error':'Cenário tributário ainda não suportado pelo gerador.'}).encode(),None);return
  required_fiscal=[issuer.get('simple_national_option'),issuer.get('simple_national_taxation_regime'),issuer.get('special_tax_regime'),service.get('national_code'),operation.get('serviceMunicipalityIbge')]
  if not all(required_fiscal):self.finish(job,'rejected',json.dumps({'error':'Cadastro fiscal incompleto para o cenário declarado.'}).encode(),None);return
  dps=NationalDpsData(issuer_tax_id=issuer['tax_id'],issuer_municipality=issuer['municipality_ibge'],taker_tax_id=taker['tax_id'],taker_name=taker['legal_name'],competence=str(data['competence']),amount=Decimal(str(data['amount'])),description=data['description'],series=str(data['series']),number=int(data['number']),national_code=service['national_code'],municipal_code=service.get('municipal_code'),nbs_code=service.get('nbs_code'),service_municipality=operation['serviceMunicipalityIbge'],simple_option=issuer['simple_national_option'],simple_tax_regime=issuer['simple_national_taxation_regime'],special_tax_regime=issuer['special_tax_regime'],iss_taxation='1',iss_withholding='2' if tax.get('issWithholding')=='withheld' else '1',iss_rate=Decimal(tax['issRate']) if tax.get('issRate') else None,environment=self.environment)
  temp,context,key,cert=self.certificate_context(invoice)
  try:
   unsigned=build_national_dps(dps,datetime.now(timezone.utc));signed=sign_national_dps(unsigned,key,cert,self.environment);validate_xsd(signed,self.xsd);digest=hashlib.sha256(signed).hexdigest();path=f"{invoice['office_id']}/{invoice['id']}/signed-{digest}.xml";self.storage.write_document(path,signed)
   try:
    with psycopg.connect(self.db) as conn:conn.execute('select mark_nfse_post_started(%s,%s,%s,%s,%s,%s)',(job['id'],self.worker,job['fence_token'],digest,path,len(signed)));conn.commit()
   except Exception:self.storage.delete_document(path);raise
   try:status,body=http(context,'POST','/nfse',transmission_body(signed))
   except TimeoutError:self.finish(job,'unknown',b'',None);return
   self.finish(job,classify(status,body),body,status,context)
  finally:temp.cleanup()
 def reconcile(self,job:dict,invoice:dict)->None:
  temp,context,_,_=self.certificate_context(invoice)
  try:
   try:status,body=http(context,'GET','/dps/'+urllib.parse.quote(invoice['dps_id'],safe=''))
   except TimeoutError:return
   result=classify(status,body);self.finish(job,result if result!='unknown' else 'reconciling',body,status,context)
  finally:temp.cleanup()
 def finish(self,job:dict,result:str,body:bytes,http_status:int|None,context:ssl.SSLContext|None=None)->None:
  response_hash=hashlib.sha256(body).hexdigest() if body else None;official_key=None;official_xml=None;official_pdf=None
  if result=='authorized':
   payload=json.loads(body);official_key=payload.get('chaveAcesso');packed=payload.get('nfseXmlGZipB64');
   if not official_key or not packed:result='unknown'
   else:
    try:official_xml=gzip.decompress(base64.b64decode(packed,validate=True))
    except Exception:result='persistence_pending'
  path=None;pdf_path=None
  if official_xml is not None:
   if b'NFSeSimulada' in official_xml:raise RuntimeError('Artefato simulado rejeitado pelo adaptador governamental.')
   path=f"{job['office_id']}/{job['invoice_id']}/official-{hashlib.sha256(official_xml).hexdigest()}.xml";self.storage.write_document(path,official_xml)
   if context is not None and official_key:
    try:
     pdf_status,pdf_body=http(context,'GET','/danfse/'+urllib.parse.quote(official_key,safe=''),service='danfse')
     if pdf_status==200 and pdf_body.startswith(b'%PDF-'):
      official_pdf=pdf_body;pdf_path=f"{job['office_id']}/{job['invoice_id']}/danfse-{official_key}.pdf";self.storage.write_document(pdf_path,official_pdf,'application/pdf')
    except (TimeoutError,RuntimeError):pass
  with psycopg.connect(self.db) as conn:
   current=conn.execute('select 1 from nfse_jobs where id=%s and claimed_by=%s and fence_token=%s for update',(job['id'],self.worker,job['fence_token'])).fetchone()
   if not current:raise RuntimeError('Worker perdeu o fencing token.')
   conn.execute('insert into nfse_attempts(office_id,invoice_id,job_id,classification,response_hash,http_status,safe_details) values(%s,%s,%s,%s,%s,%s,%s)',(job['office_id'],job['invoice_id'],job['id'],result,response_hash,http_status,json.dumps({'provider':self.provider,'danfse':bool(official_pdf)})))
   if path:conn.execute("insert into nfse_files(office_id,invoice_id,kind,storage_path,sha256,size_bytes) values(%s,%s,'official_xml',%s,%s,%s)",(job['office_id'],job['invoice_id'],path,hashlib.sha256(official_xml).hexdigest(),len(official_xml)))
   if pdf_path:conn.execute("insert into nfse_files(office_id,invoice_id,kind,storage_path,sha256,size_bytes) values(%s,%s,'official_pdf',%s,%s,%s)",(job['office_id'],job['invoice_id'],pdf_path,hashlib.sha256(official_pdf).hexdigest(),len(official_pdf)))
   conn.execute('update nfse_invoices set status=%s,official_key=coalesce(%s,official_key) where id=%s',(result,official_key,job['invoice_id']))
   if job['kind']=='issue' and result in ('unknown','reconciling'):
    conn.execute("update nfse_jobs set status='done',lease_until=null,completed_at=now() where id=%s",(job['id'],));conn.execute("insert into nfse_jobs(office_id,invoice_id,kind,status,available_at) values(%s,%s,'reconcile','queued',now()+interval '30 seconds') on conflict(invoice_id,kind) do update set status='queued',available_at=excluded.available_at,claimed_by=null,lease_until=null",(job['office_id'],job['invoice_id']))
   else:
    conn.execute("update nfse_jobs set status=case when %s='reconciling' then 'queued' else 'done' end,available_at=case when %s='reconciling' then now()+interval '30 seconds' else available_at end,lease_until=null,completed_at=case when %s='reconciling' then null else now() end where id=%s",(result,result,result,job['id']))
   conn.commit()
 def forever(self):
  while True:
   try:
    if not self.once():time.sleep(1)
   except Exception as error:print(f'worker homologação: {type(error).__name__}: {error}',flush=True);time.sleep(2)

def main():GovernmentRuntime().forever()
