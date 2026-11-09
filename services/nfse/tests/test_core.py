import unittest
from datetime import datetime,timedelta,timezone
from decimal import Decimal
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from nfse.core import DS,NationalDpsData,build_national_dps,validate_xsd,sign_sha1_homologation,sign_national_dps,transmission_body,classify
class CoreTest(unittest.TestCase):
 def setUp(self):
  self.key=rsa.generate_private_key(public_exponent=65537,key_size=2048);name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'Synthetic Test')]);now=datetime.now(timezone.utc);self.cert=x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(self.key.public_key()).serial_number(1).not_valid_before(now-timedelta(days=1)).not_valid_after(now+timedelta(days=1)).sign(self.key,hashes.SHA256())
 def test_signature_has_default_namespace_and_roundtrip(self):
  raw=b'<DPS xmlns="http://www.sped.fazenda.gov.br/nfse"><infDPS Id="DPS0001"><tpAmb>2</tpAmb></infDPS></DPS>';signed=sign_sha1_homologation(raw,self.key,self.cert);self.assertIn(b'<Signature xmlns="'+DS.encode()+b'">',signed);self.assertTrue(transmission_body(signed)['dpsXmlGZipB64'])
 def test_environment_must_match_explicit_signer(self):
  production=b'<DPS xmlns="http://www.sped.fazenda.gov.br/nfse"><infDPS Id="x"><tpAmb>1</tpAmb></infDPS></DPS>'
  with self.assertRaisesRegex(ValueError,'Ambiente fiscal'):sign_sha1_homologation(production,self.key,self.cert)
  self.assertIn(b'<Signature',sign_national_dps(production,self.key,self.cert,1))
 def test_http_is_not_fiscal_state(self):
  self.assertEqual(classify(201,b'{}'),'unknown');self.assertEqual(classify(500,b'{}'),'technical_failure');self.assertEqual(classify(400,b'{"cStat":"E1"}'),'rejected')
 def test_real_contract_success_and_structured_rejection(self):
  self.assertEqual(classify(201,b'{"chaveAcesso":"SYNTHETIC","nfseXmlGZipB64":"H4sI"}'),'authorized')
  self.assertEqual(classify(200,b'{"erros":[{"Codigo":"E0714","Descricao":"DPS invalida"}]}'),'rejected')
 def test_supported_national_dps_validates_against_homologation_xsd(self):
  data=NationalDpsData(issuer_tax_id='19463142000113',issuer_municipality='2933307',taker_tax_id='42057096000174',taker_name='TOMADOR SINTETICO LTDA',competence='2026-11-08',amount=Decimal('1.00'),description='Servico sintetico de teste sem valor fiscal',series='1',number=1,national_code='171901',service_municipality='2933307',nbs_code='113022100')
  raw=build_national_dps(data,datetime(2026,11,8,12,0,tzinfo=timezone(timedelta(hours=-3))));root=Path(__file__).parents[3];validate_xsd(raw,str(root/'teste_nfse'/'esquemas_xsd'/'DPS_v1.01.xsd'))
if __name__=='__main__':unittest.main()
