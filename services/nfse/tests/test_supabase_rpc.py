import json,os,threading,unittest
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from nfse.government_runtime import SupabaseRpc

class Handler(BaseHTTPRequestHandler):
 seen=[]
 def log_message(self,*args):pass
 def do_POST(self):
  size=int(self.headers.get('content-length','0'));payload=json.loads(self.rfile.read(size) or b'{}')
  Handler.seen.append((self.path,self.headers.get('apikey'),self.headers.get('authorization'),payload))
  if self.path.endswith('/nfse_worker_health'):body=b'true'
  elif self.path.endswith('/nfse_worker_claim_jobs'):body=b'[]'
  else:self.send_response(404);self.end_headers();return
  self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)

class SupabaseRpcTest(unittest.TestCase):
 def setUp(self):
  Handler.seen=[];self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=self.server.serve_forever,daemon=True).start();os.environ['SUPABASE_URL']=f'http://127.0.0.1:{self.server.server_port}';os.environ['SUPABASE_SERVICE_ROLE_KEY']='service-test-secret'
 def tearDown(self):self.server.shutdown();self.server.server_close();os.environ.pop('SUPABASE_URL',None);os.environ.pop('SUPABASE_SERVICE_ROLE_KEY',None)
 def test_service_role_headers_and_payload(self):
  rpc=SupabaseRpc();self.assertTrue(rpc.call('nfse_worker_health'));self.assertEqual(rpc.call('nfse_worker_claim_jobs',{'p_worker':'w','p_batch':10}),[])
  path,key,auth,payload=Handler.seen[1];self.assertEqual(path,'/rest/v1/rpc/nfse_worker_claim_jobs');self.assertEqual(key,'service-test-secret');self.assertEqual(auth,'Bearer service-test-secret');self.assertEqual(payload,{'p_worker':'w','p_batch':10})

if __name__=='__main__':unittest.main()
