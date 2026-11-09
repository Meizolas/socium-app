import json,os,ssl,threading,unittest
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from nfse.core import classify
from nfse.government_runtime import http

class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  size=int(self.headers.get('content-length','0'));payload=json.loads(self.rfile.read(size));
  if self.path!='/nfse' or 'dpsXmlGZipB64' not in payload:self.send_response(400);self.end_headers();return
  body=b'{"chaveAcesso":"12345678901234567890123456789012345678901234567890","nfseXmlGZipB64":"H4sI"}';self.send_response(201);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def do_GET(self):
  if not self.path.startswith('/danfse/') and not self.path.startswith('/dps/'):self.send_response(404);self.end_headers();return
  body=b'%PDF-1.7\n% synthetic official transport test';self.send_response(200);self.send_header('Content-Type','application/pdf');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)

class GovernmentTransportTest(unittest.TestCase):
 def setUp(self):
  self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();os.environ['APP_ENV']='test';os.environ['NFSE_TEST_BASE_URL']=f'http://127.0.0.1:{self.server.server_port}'
 def tearDown(self):
  self.server.shutdown();self.server.server_close();os.environ.pop('NFSE_TEST_BASE_URL',None);os.environ.pop('APP_ENV',None)
 def test_real_http_contract_against_fake_fiscal_server(self):
  status,body=http(ssl.create_default_context(),'POST','/nfse',{'dpsXmlGZipB64':'synthetic'});self.assertEqual(status,201);self.assertEqual(classify(status,body),'authorized')
  pdf_status,pdf=http(ssl.create_default_context(),'GET','/danfse/SYNTHETIC',service='danfse');self.assertEqual(pdf_status,200);self.assertTrue(pdf.startswith(b'%PDF-'))
 def test_external_override_is_blocked(self):
  os.environ['NFSE_TEST_BASE_URL']='https://example.test';
  with self.assertRaisesRegex(RuntimeError,'servidor falso local'):http(ssl.create_default_context(),'GET','/dps/x')

if __name__=='__main__':unittest.main()
