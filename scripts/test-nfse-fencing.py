"""Teste integrado do lease/fencing contra o Postgres local sintético."""
import os
from datetime import datetime,timedelta,timezone
import psycopg

url=os.getenv('LOCAL_DATABASE_URL','postgresql://postgres:local-only@127.0.0.1:55433/socium_local')
with psycopg.connect(url) as conn:
 conn.execute("set local role postgres")
 row=conn.execute("select j.id,j.invoice_id from nfse_jobs j where j.kind='issue' order by j.created_at desc limit 1").fetchone()
 if not row:raise SystemExit('Execute o fluxo local antes do teste de fencing.')
 job_id,invoice_id=row
 conn.execute("delete from nfse_jobs where invoice_id=%s and kind='reconcile'",(invoice_id,))
 conn.execute("update nfse_invoices set status='transmitting' where id=%s",(invoice_id,))
 conn.execute("update nfse_jobs set status='claimed',claimed_by='crashed-worker',lease_until=%s,post_started_at=now(),fence_token=fence_token+1 where id=%s",(datetime.now(timezone.utc)-timedelta(seconds=5),job_id))
 claimed=conn.execute("select kind,status from claim_nfse_jobs('recovery-worker',10)").fetchall()
 invoice=conn.execute("select status from nfse_invoices where id=%s",(invoice_id,)).fetchone()[0]
 issue=conn.execute("select status from nfse_jobs where id=%s",(job_id,)).fetchone()[0]
 reconcile=conn.execute("select count(*) from nfse_jobs where invoice_id=%s and kind='reconcile'",(invoice_id,)).fetchone()[0]
 if invoice!='unknown' or issue!='done' or reconcile!=1:raise AssertionError((invoice,issue,reconcile,claimed))
 conn.rollback()
 print({'ok':True,'expiredIssueReposted':False,'invoiceStatus':'unknown','reconciliationJobs':1})
