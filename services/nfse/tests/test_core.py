import unittest
from datetime import datetime,timedelta,timezone
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from nfse.core import DS,sign_sha1_homologation,transmission_body,classify
class CoreTest(unittest.TestCase):
 def setUp(self):
  self.key=rsa.generate_private_key(public_exponent=65537,key_size=2048);name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'Synthetic Test')]);now=datetime.now(timezone.utc);self.cert=x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(self.key.public_key()).serial_number(1).not_valid_before(now-timedelta(days=1)).not_valid_after(now+timedelta(days=1)).sign(self.key,hashes.SHA256())
 def test_signature_has_default_namespace_and_roundtrip(self):
  raw=b'<DPS xmlns="http://www.sped.fazenda.gov.br/nfse"><infDPS Id="DPS0001"><tpAmb>2</tpAmb></infDPS></DPS>';signed=sign_sha1_homologation(raw,self.key,self.cert);self.assertIn(b'<Signature xmlns="'+DS.encode()+b'">',signed);self.assertTrue(transmission_body(signed)['dpsXmlGZipB64'])
 def test_production_is_blocked(self):
  with self.assertRaisesRegex(ValueError,'Produção bloqueada'):sign_sha1_homologation(b'<DPS xmlns="http://www.sped.fazenda.gov.br/nfse"><infDPS Id="x"><tpAmb>1</tpAmb></infDPS></DPS>',self.key,self.cert)
 def test_http_is_not_fiscal_state(self):
  self.assertEqual(classify(201,b'{}'),'unknown');self.assertEqual(classify(500,b'{}'),'technical_failure');self.assertEqual(classify(400,b'{"cStat":"E1"}'),'rejected')
if __name__=='__main__':unittest.main()
