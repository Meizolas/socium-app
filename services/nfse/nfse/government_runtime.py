from __future__ import annotations
import base64,gzip,hashlib,json,os,ssl,tempfile,time,urllib.error,urllib.parse,urllib.request,uuid
from datetime import datetime,timedelta,timezone
from decimal import Decimal
from pathlib import Path
import psycopg
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.serialization import pkcs12
from .core import NationalDpsData,build_national_dps,validate_xsd,sign_national_dps,transmission_body,classify,build_cancellation_request,sign_event_request,event_transmission_body,SEFIN_HOMOLOGATION,SEFIN_PRODUCTION,DANFSE_HOMOLOGATION,DANFSE_PRODUCTION
from .danfse_v2 import LAYOUT_VERSION,render_danfse_v2

def required(name:str)->str:
 value=os.getenv(name,'');
 if not value:raise RuntimeError(f'{name} não configurada.')
 return value

def enabled()->bool:
 provider=os.getenv('NFSE_PROVIDER');environment=os.getenv('NFSE_ENVIRONMENT')
 if provider=='government_homologation':return environment=='2'
 return provider=='government_production' and environment=='1' and os.getenv('NFSE_ENABLE_PRODUCTION')=='true'

def fiscal_now()->datetime:
 value=required('NFSE_FISCAL_UTC_OFFSET')
 if len(value)!=6 or value[0] not in '+-' or value[3]!=':' or not(value[1:3].isdigit() and value[4:6].isdigit()):raise RuntimeError('NFSE_FISCAL_UTC_OFFSET deve usar o formato -03:00.')
 hours,minutes=int(value[1:3]),int(value[4:6])
 if hours>14 or minutes>59:raise RuntimeError('NFSE_FISCAL_UTC_OFFSET inválido.')
 delta=timedelta(hours=hours,minutes=minutes)
 if value[0]=='-':delta=-delta
 return datetime.now(timezone(delta))

def iss_rate_for_dps(issuer:dict,tax:dict)->Decimal|None:
 # SEFIN E0625: ME/EPP with ISS inside Simples and no withholding must not send pAliq.
 if issuer.get('simple_national_option')=='3' and issuer.get('simple_national_taxation_regime')=='1' and tax.get('issWithholding')!='withheld':return None
 return Decimal(str(tax['issRate'])) if tax.get('issRate') else None

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

class SupabaseRpc:
 def __init__(self):self.base=required('SUPABASE_URL').rstrip('/');self.key=required('SUPABASE_SERVICE_ROLE_KEY')
 def call(self,name:str,payload:dict|None=None):
  req=urllib.request.Request(f'{self.base}/rest/v1/rpc/{name}',data=json.dumps(payload or {}).encode(),method='POST',headers={'apikey':self.key,'Authorization':'Bearer '+self.key,'Content-Type':'application/json','Accept':'application/json'})
  try:
   with urllib.request.urlopen(req,timeout=45) as response:
    raw=response.read();return None if not raw else json.loads(raw)
  except urllib.error.HTTPError as error:
   detail=error.read().decode(errors='replace')[:500];raise RuntimeError(f'RPC {name} HTTP {error.code}: {detail}') from error

def safe_response_details(body:bytes)->dict:
 if not body:return {}
 try:payload=json.loads(body)
 except Exception:return {'responseFormat':'non_json'}
 if not isinstance(payload,dict):return {'responseFormat':'json_non_object'}
 allowed=('cStat','status','codigo','descricao','mensagem','message','erro','erros','errors')
 details={key:payload[key] for key in allowed if key in payload}
 if len(json.dumps(details,ensure_ascii=False))>8000:return {'responseFormat':'structured_too_large','topLevelKeys':sorted(payload.keys())[:30]}
 return details

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
  self.environment=int(required('NFSE_ENVIRONMENT'));self.provider='SEFIN_PRODUCTION' if self.environment==1 else 'SEFIN_HOMOLOGATION';self.backend=os.getenv('NFSE_WORKER_BACKEND','postgres');self.rpc=SupabaseRpc() if self.backend=='supabase_rpc' else None;self.db=None if self.rpc else required('NFSE_DATABASE_URL');self.storage=Storage();self.worker=('production-' if self.environment==1 else 'homolog-')+str(uuid.uuid4());self.xsd=required('NFSE_DPS_XSD')
 def once(self)->int:
  if self.rpc:jobs=self.rpc.call('nfse_worker_claim_jobs',{'p_worker':self.worker,'p_batch':10}) or []
  else:
   with psycopg.connect(self.db,row_factory=psycopg.rows.dict_row) as conn:
    jobs=conn.execute('select * from claim_nfse_jobs(%s,10)',(self.worker,)).fetchall();conn.commit()
  for job in jobs:self.process(job)
  return len(jobs)
 def process(self,job:dict)->None:
  if self.rpc:record=self.rpc.call('nfse_worker_load_job',{'p_job':job['id'],'p_worker':self.worker,'p_fence':job['fence_token']})
  else:
   with psycopg.connect(self.db,row_factory=psycopg.rows.dict_row) as conn:
    if job['kind']=='issue':
     record=conn.execute("select i.*,c.custody_reference,c.issuer_id custody_aad_issuer_id,c.id signing_certificate_id from nfse_invoices i join profiles p on p.id=i.created_by and p.office_id=i.office_id and p.role in ('admin','operator','client') join office_modules m on m.office_id=i.office_id and m.module='nfse' and m.status='active' join nfse_certificates c on c.id=active_nfse_certificate(i) where i.id=%s and can_access_nfse_issuer_for_profile(p.id,i.issuer_id)",(job['invoice_id'],)).fetchone()
    elif job['kind']=='cancel':
     record=conn.execute("select i.*,to_jsonb(x) cancellation,c.custody_reference,c.issuer_id custody_aad_issuer_id,c.id signing_certificate_id,c.subject_tax_id signing_subject_tax_id from nfse_invoices i join nfse_cancellations x on x.invoice_id=i.id and x.status in ('queued','processing') join nfse_certificates c on c.id=active_nfse_cancellation_certificate(i) where i.id=%s and i.status='authorized'",(job['invoice_id'],)).fetchone()
    else:
     record=conn.execute("select i.*,c.custody_reference,c.issuer_id custody_aad_issuer_id,c.id signing_certificate_id from nfse_invoices i join nfse_certificates c on c.id=active_nfse_certificate(i) where i.id=%s and i.status in ('unknown','reconciling','persistence_pending')",(job['invoice_id'],)).fetchone()
  if not record:
   if job['kind']=='cancel':self.finish_cancellation(job,'technical_failure',b'',None)
   else:self.finish(job,'cancelled',b'',None)
   return
  if job['kind']=='issue':self.issue(job,record)
  elif job['kind']=='cancel':self.cancel(job,record)
  else:self.reconcile(job,record)
 def certificate_context(self,invoice:dict):
  custody_issuer=invoice.get('custody_aad_issuer_id') or invoice['issuer_id'];aad=f"{invoice['office_id']}:{custody_issuer}:v1";secret=decrypt_envelope(self.storage.read_custody(invoice['custody_reference']),aad);key,cert,chain=pkcs12.load_key_and_certificates(base64.b64decode(secret['pfx']),secret['password'].encode());
  if key is None or cert is None:raise RuntimeError('Certificado de custódia inválido.')
  temp=tempfile.TemporaryDirectory(prefix='socium-nfse-');pem=Path(temp.name)/'client.pem';pem.write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())+cert.public_bytes(serialization.Encoding.PEM)+b''.join(x.public_bytes(serialization.Encoding.PEM) for x in (chain or [])));os.chmod(pem,0o600);context=ssl.create_default_context();context.load_cert_chain(str(pem));return temp,context,key,cert
 def issue(self,job:dict,invoice:dict)->None:
  snap=invoice['snapshot'];issuer=snap['issuer'];taker=snap['taker'];service=snap['service'];data=snap['invoice'];operation=data.get('operation') or {};tax=data.get('taxation') or {}
  if tax.get('issTaxation')!='taxable':self.finish(job,'rejected',json.dumps({'error':'Cenário tributário ainda não suportado pelo gerador.'}).encode(),None);return
  required_fiscal=[issuer.get('simple_national_option'),issuer.get('simple_national_taxation_regime'),issuer.get('special_tax_regime'),service.get('national_code'),operation.get('serviceMunicipalityIbge')]
  if not all(required_fiscal):self.finish(job,'rejected',json.dumps({'error':'Cadastro fiscal incompleto para o cenário declarado.'}).encode(),None);return
  service_tax=service.get('taxation') or {};approximate_rate=service_tax.get('approximateSimpleTaxRate')
  dps=NationalDpsData(issuer_tax_id=issuer['tax_id'],issuer_municipality=issuer['municipality_ibge'],taker_tax_id=taker['tax_id'],taker_name=taker['legal_name'],competence=str(data['competence']),amount=Decimal(str(data['amount'])),description=data['description'],series=str(data['series']),number=int(data['number']),national_code=service['national_code'],municipal_code=service.get('municipal_code'),nbs_code=service.get('nbs_code'),service_municipality=operation['serviceMunicipalityIbge'],simple_option=issuer['simple_national_option'],simple_tax_regime=issuer['simple_national_taxation_regime'],special_tax_regime=issuer['special_tax_regime'],iss_taxation='1',iss_withholding='2' if tax.get('issWithholding')=='withheld' else '1',iss_rate=iss_rate_for_dps(issuer,tax),approximate_simple_tax_rate=Decimal(str(approximate_rate)) if approximate_rate is not None else None,ibs_cbs=tax.get('ibsCbs'),environment=self.environment)
  temp,context,key,cert=self.certificate_context(invoice)
  try:
   try:unsigned=build_national_dps(dps,fiscal_now());signed=sign_national_dps(unsigned,key,cert,self.environment);validate_xsd(signed,self.xsd)
   except Exception as error:
    self.finish(job,'technical_failure',json.dumps({'error':'Não foi possível gerar o XML fiscal com os dados informados.','stage':'xml_generation','type':type(error).__name__}).encode(),None);return
   digest=hashlib.sha256(signed).hexdigest();path=f"{invoice['office_id']}/{invoice['id']}/signed-{digest}.xml";self.storage.write_document(path,signed)
   try:
    if self.rpc:self.rpc.call('mark_nfse_post_started',{'p_job':job['id'],'p_worker':self.worker,'p_fence':job['fence_token'],'p_request_hash':digest,'p_storage_path':path,'p_size':len(signed)})
    else:
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
 def cancel(self,job:dict,invoice:dict)->None:
  cancellation=invoice['cancellation'];snap=invoice['snapshot'];issuer=snap['issuer'];temp,context,key,cert=self.certificate_context(invoice)
  try:
   author_tax_id=''.join(x for x in str(invoice.get('signing_subject_tax_id') or issuer['tax_id']) if x.isdigit());unsigned=build_cancellation_request(author_tax_id,invoice['official_key'],str(cancellation['reason_code']),cancellation['reason'],self.environment,fiscal_now());signed=sign_event_request(unsigned,key,cert,self.environment);event_xsd=os.getenv('NFSE_EVENT_XSD',str(Path(self.xsd).with_name('pedRegEvento_v1.01.xsd')));validate_xsd(signed,event_xsd);digest=hashlib.sha256(signed).hexdigest();path=f"{invoice['office_id']}/{invoice['id']}/signed-cancellation-{digest}.xml";self.storage.write_document(path,signed)
   try:
    if self.rpc:self.rpc.call('mark_nfse_cancellation_post_started',{'p_job':job['id'],'p_worker':self.worker,'p_fence':job['fence_token'],'p_request_hash':digest,'p_storage_path':path,'p_size':len(signed)})
    else:
     with psycopg.connect(self.db) as conn:conn.execute('select mark_nfse_cancellation_post_started(%s,%s,%s,%s,%s,%s)',(job['id'],self.worker,job['fence_token'],digest,path,len(signed)));conn.commit()
   except Exception:self.storage.delete_document(path);raise
   try:status,body=http(context,'POST','/nfse/'+urllib.parse.quote(invoice['official_key'],safe='')+'/eventos',event_transmission_body(signed))
   except TimeoutError:self.finish_cancellation(job,'unknown',b'',None);return
   result='technical_failure' if status>=500 else 'unknown';event_xml=None
   try:
    payload=json.loads(body);packed=payload.get('eventoXmlGZipB64');errors=payload.get('erros') or payload.get('errors') or []
    if status in (200,201) and packed:event_xml=gzip.decompress(base64.b64decode(packed,validate=True));result='authorized'
    elif errors or status in (400,409,422):result='rejected'
   except Exception:pass
   self.finish_cancellation(job,result,body,status,event_xml)
  finally:temp.cleanup()
 def finish_cancellation(self,job:dict,result:str,body:bytes,http_status:int|None,event_xml:bytes|None=None)->None:
  response_hash=hashlib.sha256(body).hexdigest() if body else None;event_path=None;details=safe_response_details(body);error_message=None
  if result!='authorized':
   candidate=details.get('mensagem') or details.get('message') or details.get('descricao') or details.get('erro')
   if isinstance(candidate,str):error_message=candidate[:500]
   elif result=='rejected':error_message='O ambiente nacional rejeitou o pedido de cancelamento.'
   elif result=='technical_failure':error_message='Houve uma falha de comunicação ao cancelar. A nota permanece autorizada.'
   else:error_message='Não foi possível confirmar o cancelamento. A nota permanece autorizada.'
  if event_xml:
   event_path=f"{job['office_id']}/{job['invoice_id']}/cancellation-{hashlib.sha256(event_xml).hexdigest()}.xml";self.storage.write_document(event_path,event_xml)
  payload={'p_job':job['id'],'p_worker':self.worker,'p_fence':job['fence_token'],'p_result':result,'p_response_hash':response_hash,'p_http_status':http_status,'p_safe_details':{'provider':self.provider,**details},'p_error':error_message,'p_event_path':event_path,'p_event_hash':hashlib.sha256(event_xml).hexdigest() if event_xml else None,'p_event_size':len(event_xml) if event_xml else None}
  if self.rpc:
   try:self.rpc.call('nfse_worker_finish_cancellation',payload)
   except Exception:
    if event_path:self.storage.delete_document(event_path)
    raise
  else:
   with psycopg.connect(self.db) as conn:conn.execute('select nfse_worker_finish_cancellation(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',tuple(payload.values()));conn.commit()
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
   if official_key:
    official_pdf=render_danfse_v2(official_xml)
    pdf_path=f"{job['office_id']}/{job['invoice_id']}/danfse-v2-{official_key}.pdf"
    self.storage.write_document(pdf_path,official_pdf,'application/pdf')
  if self.rpc:
   try:self.rpc.call('nfse_worker_finish_job',{'p_job':job['id'],'p_worker':self.worker,'p_fence':job['fence_token'],'p_result':result,'p_response_hash':response_hash,'p_http_status':http_status,'p_safe_details':{'provider':self.provider,'danfse':bool(official_pdf),'danfseLayout':LAYOUT_VERSION if official_pdf else None,**safe_response_details(body)},'p_official_key':official_key,'p_xml_path':path,'p_xml_hash':hashlib.sha256(official_xml).hexdigest() if official_xml else None,'p_xml_size':len(official_xml) if official_xml else None,'p_pdf_path':pdf_path,'p_pdf_hash':hashlib.sha256(official_pdf).hexdigest() if official_pdf else None,'p_pdf_size':len(official_pdf) if official_pdf else None})
   except Exception:
    if path:self.storage.delete_document(path)
    if pdf_path:self.storage.delete_document(pdf_path)
    raise
   return
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
   except Exception as error:print(f'worker {self.provider.lower()}: {type(error).__name__}: {error}',flush=True);time.sleep(2)

def main():GovernmentRuntime().forever()
