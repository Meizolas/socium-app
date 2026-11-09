"""Exercita RLS e grants com o papel authenticated real do banco local."""
import os,psycopg
from psycopg.errors import InsufficientPrivilege

url=os.getenv('LOCAL_DATABASE_URL','postgresql://postgres:local-only@127.0.0.1:55433/socium_local')
operator='10000000-0000-4000-8000-000000000003'
with psycopg.connect(url) as conn:
 allowed=conn.execute('select issuer_id from nfse_profile_issuer_access where profile_id=%s and allowed',(operator,)).fetchone()[0]
 outside=conn.execute('select id from nfse_issuers where office_id=%s and id<>%s limit 1',('11000000-0000-4000-8000-000000000001',allowed)).fetchone()[0]
 invoice=conn.execute('select id from nfse_invoices where issuer_id=%s limit 1',(outside,)).fetchone()[0]
 conn.execute('set local role authenticated');conn.execute("select set_config('request.jwt.claim.sub',%s,true)",(operator,))
 visible=[row[0] for row in conn.execute('select id from nfse_issuers order by id')]
 if visible!=[allowed]:raise AssertionError(('issuer_scope',visible,allowed))
 technical_blocked=False
 try:conn.execute("update nfse_invoices set official_key='FORGED' where id=%s",(invoice,))
 except InsufficientPrivilege:technical_blocked=True;conn.execute('rollback');conn.execute('begin');conn.execute('set local role authenticated');conn.execute("select set_config('request.jwt.claim.sub',%s,true)",(operator,))
 if not technical_blocked:raise AssertionError('authenticated alterou estado técnico por CRUD')
 rpc_blocked=False
 try:conn.execute('select enqueue_nfse_issue(%s)',(invoice,))
 except psycopg.Error as error:rpc_blocked=error.sqlstate in ('42501','P0001')
 if not rpc_blocked:raise AssertionError('RPC aceitou emitente fora do escopo')
 conn.rollback();print({'ok':True,'directIssuerScope':True,'technicalCrudBlocked':True,'queueScopeBlocked':True})
