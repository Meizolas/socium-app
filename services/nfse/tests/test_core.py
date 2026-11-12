import unittest
from datetime import datetime,timedelta,timezone
from decimal import Decimal
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from nfse.core import DS,NationalDpsData,build_national_dps,validate_xsd,sign_sha1_homologation,sign_national_dps,transmission_body,classify,build_cancellation_request,sign_event_request,event_transmission_body
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
  raw=build_national_dps(data,datetime(2026,11,8,12,0,tzinfo=timezone(timedelta(hours=-3))));root=Path(__file__).parents[3];validate_xsd(raw,str(root/'teste_nfse'/'esquemas_xsd'/'DPS_v1.01.xsd'));self.assertNotIn(b'<indTotTrib>',raw);self.assertIn(b'<pTotTribSN>0.00</pTotTribSN>',raw)
 def test_simple_national_approximate_tax_rate_uses_official_field(self):
  data=NationalDpsData(issuer_tax_id='19463142000113',issuer_municipality='2933307',taker_tax_id='42057096000174',taker_name='TOMADOR SINTETICO LTDA',competence='2026-11-09',amount=Decimal('10.00'),description='Servicos de contabilidade',series='1',number=1,national_code='171901',service_municipality='2933307',nbs_code='113022100',approximate_simple_tax_rate=Decimal('6.00'),environment=1)
  raw=build_national_dps(data,datetime(2026,11,9,12,0,tzinfo=timezone(timedelta(hours=-3))));root=Path(__file__).parents[3];validate_xsd(raw,str(root/'teste_nfse'/'esquemas_xsd'/'DPS_v1.01.xsd'));self.assertIn(b'<pTotTribSN>6.00</pTotTribSN>',raw);self.assertNotIn(b'<indTotTrib>',raw);self.assertIn(b'Id="DPS293330721946314200011300001000000000000001"',raw)
 def test_cancellation_event_is_signed_and_validates_official_xsd(self):
  raw=build_cancellation_request('19463142000113','1'*50,'2','Servico nao prestado pelo emitente',2,datetime(2026,11,12,12,0,tzinfo=timezone(timedelta(hours=-3))));signed=sign_event_request(raw,self.key,self.cert,2);root=Path(__file__).parents[3];validate_xsd(signed,str(root/'teste_nfse'/'esquemas_xsd'/'pedRegEvento_v1.01.xsd'));self.assertIn(b'Id="PRE'+b'1'*50+b'101101"',signed);self.assertTrue(event_transmission_body(signed)['pedidoRegistroEventoXmlGZipB64'])
 def test_individual_taker_uses_cpf_in_official_dps(self):
  data=NationalDpsData(issuer_tax_id='19463142000113',issuer_municipality='2933307',taker_tax_id='52998224725',taker_name='TOMADOR PESSOA FISICA',competence='2026-11-12',amount=Decimal('10.00'),description='Servico prestado a pessoa fisica',series='1',number=2,national_code='171901',service_municipality='2933307')
  raw=build_national_dps(data,datetime(2026,11,12,12,0,tzinfo=timezone(timedelta(hours=-3))));root=Path(__file__).parents[3];validate_xsd(raw,str(root/'teste_nfse'/'esquemas_xsd'/'DPS_v1.01.xsd'));self.assertIn(b'<CPF>52998224725</CPF>',raw);self.assertNotIn(b'<CNPJ>52998224725</CNPJ>',raw)

 def test_formatted_national_service_code_is_normalized(self):
  data=NationalDpsData(issuer_tax_id='19463142000113',issuer_municipality='2933307',taker_tax_id='25101960000179',taker_name='Tomador',competence='2026-11-12',amount=Decimal('100.00'),description='Teste',series='1',number=2,national_code='07.13.01',service_municipality='2933307',nbs_code='1.1803.21.00',environment=1)
  raw=build_national_dps(data,datetime(2026,11,12,12,0,tzinfo=timezone(timedelta(hours=-3))));root=Path(__file__).parents[3];validate_xsd(raw,str(root/'teste_nfse'/'esquemas_xsd'/'DPS_v1.01.xsd'));self.assertIn(b'<cTribNac>071301</cTribNac>',raw);self.assertIn(b'<cNBS>118032100</cNBS>',raw)
 def test_substitution_group_validates_against_official_xsd(self):
  data=NationalDpsData(issuer_tax_id='19463142000113',issuer_municipality='2933307',taker_tax_id='42057096000174',taker_name='TOMADOR SINTETICO LTDA',competence='2026-11-12',amount=Decimal('10.00'),description='Correcao de servico',series='1',number=3,national_code='171901',service_municipality='2933307',substitution_key='1'*50,substitution_reason_code='99',substitution_reason='Correcao dos dados fiscais da nota anterior')
  raw=build_national_dps(data,datetime(2026,11,12,12,0,tzinfo=timezone(timedelta(hours=-3))));root=Path(__file__).parents[3];validate_xsd(raw,str(root/'teste_nfse'/'esquemas_xsd'/'DPS_v1.01.xsd'));self.assertIn(b'<subst><chSubstda>'+b'1'*50+b'</chSubstda><cMotivo>99</cMotivo>',raw)
if __name__=='__main__':unittest.main()
