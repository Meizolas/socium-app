import unittest
from nfse.worker import Worker,MemoryRepository
class Provider:
 def __init__(self,result='ok'):self.result=result;self.posts=0;self.reads=0
 def issue(self,dps_id,payload):
  self.posts+=1
  if self.result=='timeout':raise TimeoutError()
  return 201,b'{"cStat":"100","chaveAcesso":"synthetic"}'
 def reconcile(self,dps_id):self.reads+=1;return 200,b'{"cStat":"100","chaveAcesso":"synthetic"}'
def job(kind='issue',active=True):return{'id':'j1','kind':kind,'status':'queued','dps_id':'DPS-SYNTHETIC','signed_xml':b'<signed/>','commercial_active':active}
class WorkerTest(unittest.TestCase):
 def test_issue_persists_evidence_before_single_post(self):
  repo=MemoryRepository([job()]);provider=Provider();Worker(repo,provider,'w1').run_once();self.assertEqual(provider.posts,1);self.assertEqual(repo.events[0][0],'before_post');self.assertEqual(repo.jobs[0]['status'],'authorized')
 def test_timeout_never_reposts_on_restart_and_reconciles(self):
  repo=MemoryRepository([job()]);provider=Provider('timeout');Worker(repo,provider,'w1').run_once();self.assertEqual(repo.jobs[0]['status'],'unknown');Worker(repo,provider,'w2').run_once();self.assertEqual(provider.posts,1);repo.jobs.append(job('reconcile'));repo.jobs[-1]['id']='j2';Worker(repo,provider,'w2').run_once();self.assertEqual(provider.posts,1);self.assertEqual(provider.reads,1);self.assertEqual(repo.jobs[-1]['status'],'authorized')
 def test_revocation_blocks_new_post(self):
  repo=MemoryRepository([job(active=False)]);provider=Provider();Worker(repo,provider,'w').run_once();self.assertEqual(provider.posts,0);self.assertEqual(repo.jobs[0]['status'],'cancelled')
if __name__=='__main__':unittest.main()
