from __future__ import annotations
import base64,hashlib,json,os,time,uuid
from pathlib import Path
import psycopg
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.serialization import pkcs12
from .simulated_artifacts import build_simulated_pdf,build_simulated_xml

def enabled():
 return os.getenv('SOCIUM_LOCAL_E2E')=='true' and os.getenv('NFSE_PROVIDER')=='simulated' and os.getenv('APP_ENV','local') in ('local','test')
def decrypt_envelope(raw:bytes,aad:str)->dict:
 parts=raw.decode().split('.');key=base64.b64decode(os.environ['NFSE_CUSTODY_KEY_V1']);iv=base64.urlsafe_b64decode(parts[1]+'==');tag=base64.urlsafe_b64decode(parts[2]+'==');data=base64.urlsafe_b64decode(parts[3]+'==');plain=AESGCM(key).decrypt(iv,data+tag,aad.encode());return json.loads(plain)
class Runtime:
 def __init__(self):
  if not enabled():raise RuntimeError('Provedor simulado bloqueado fora do modo local/teste explícito.')
  self.db=os.environ['LOCAL_DATABASE_URL'];self.root=Path(os.getenv('LOCAL_STORAGE_ROOT','.local-data')).resolve();self.worker='local-'+str(uuid.uuid4())
 def once(self):
  with psycopg.connect(self.db) as conn:
   jobs=conn.execute('select * from public.claim_nfse_jobs(%s::text,10)',(self.worker,)).fetchall();cols=[x.name for x in conn.execute('select * from public.nfse_jobs limit 0').description]
   for row in jobs:self.process(conn,dict(zip(cols,row)))
   conn.commit();return len(jobs)
 def process(self,conn,job):
  record=conn.execute("select i.*,c.custody_reference from nfse_invoices i join profiles p on p.id=i.created_by and p.office_id=i.office_id and p.role in ('admin','operator') join office_modules m on m.office_id=i.office_id and m.module='nfse' and m.status='active' join nfse_certificates c on c.issuer_id=i.issuer_id and c.status='active' where i.id=%s and (not exists(select 1 from nfse_profile_issuer_access r where r.profile_id=p.id) or exists(select 1 from nfse_profile_issuer_access r where r.profile_id=p.id and r.issuer_id=i.issuer_id and r.allowed))",(job['invoice_id'],)).fetchone() if job['kind']=='issue' else conn.execute("select i.*,c.custody_reference from nfse_invoices i join nfse_certificates c on c.issuer_id=i.issuer_id and c.status='active' where i.id=%s",(job['invoice_id'],)).fetchone()
  if not record:conn.execute("update nfse_jobs set status='cancelled' where id=%s",(job['id'],));return
  names=[x.name for x in conn.execute('select i.*,null::text custody_reference from nfse_invoices i limit 0').description];invoice=dict(zip(names,record));reference=invoice.pop('custody_reference');aad=f"{invoice['office_id']}:{invoice['issuer_id']}:v1";secret=decrypt_envelope((self.root/reference).read_bytes(),aad);pkcs12.load_key_and_certificates(base64.b64decode(secret['pfx']),secret['password'].encode())
  if job['kind']=='issue':
   key='SIMULATED-'+uuid.uuid4().hex.upper();xml=build_simulated_xml(invoice,key);pdf=build_simulated_pdf(invoice,key);base=f'documents/{invoice["office_id"]}/{invoice["id"]}';artifacts=(("simulated_xml",f'{base}/simulated.xml',xml),("simulated_pdf",f'{base}/danfse-simulado.pdf',pdf))
   for kind,relative,content in artifacts:
    target=self.root/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(content);digest=hashlib.sha256(content).hexdigest();conn.execute("insert into nfse_files(office_id,invoice_id,kind,storage_path,sha256,size_bytes) values(%s,%s,%s,%s,%s,%s)",(invoice['office_id'],invoice['id'],kind,relative,digest,len(content)))
   digest=hashlib.sha256(xml).hexdigest();conn.execute("insert into nfse_attempts(office_id,invoice_id,job_id,classification,response_hash,safe_details) values(%s,%s,%s,'simulated_authorized',%s,%s)",(invoice['office_id'],invoice['id'],job['id'],digest,json.dumps({'provider':'SIMULATED_LOCAL','external':False,'artifacts':['xml','pdf']})));conn.execute("update nfse_invoices set status='authorized',simulation_reference=%s,official_key=null,dps_id=coalesce(dps_id,'DPS'||id::text) where id=%s",(key,invoice['id']));conn.execute("update nfse_jobs set status='done',lease_until=null where id=%s",(job['id'],))
  else:conn.execute("update nfse_jobs set status='done',lease_until=null where id=%s",(job['id'],))
 def forever(self):
  while True:
   try:self.once()
   except Exception as error:print(f'worker local: {error}',flush=True)
   time.sleep(1)
def main():Runtime().forever()
