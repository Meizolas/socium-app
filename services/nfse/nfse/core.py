from __future__ import annotations
import base64,gzip,hashlib,json
from datetime import datetime
from dataclasses import dataclass
from decimal import Decimal
from lxml import etree as E
from cryptography import x509
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import padding,rsa

NS='http://www.sped.fazenda.gov.br/nfse'; DS='http://www.w3.org/2000/09/xmldsig#'
SEFIN_HOMOLOGATION='https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional'
SEFIN_PRODUCTION='https://sefin.nfse.gov.br/SefinNacional'
DANFSE_HOMOLOGATION='https://adn.producaorestrita.nfse.gov.br'
DANFSE_PRODUCTION='https://adn.nfse.gov.br'
ADN_HOMOLOGATION='https://adn.producaorestrita.nfse.gov.br/parametrizacao'
@dataclass(frozen=True)
class InvoiceData: issuer_tax_id:str; taker_tax_id:str; competence:str; amount:Decimal; description:str; series:str; number:int; environment:int=2
@dataclass(frozen=True)
class NationalDpsData:
 issuer_tax_id:str;issuer_municipality:str;taker_tax_id:str;taker_name:str
 competence:str;amount:Decimal;description:str;series:str;number:int
 national_code:str;service_municipality:str;nbs_code:str|None=None;municipal_code:str|None=None
 simple_option:str='3';simple_tax_regime:str='1';special_tax_regime:str='0'
 iss_taxation:str='1';iss_withholding:str='1';iss_rate:Decimal|None=None
 approximate_simple_tax_rate:Decimal|None=None;ibs_cbs:dict|None=None;environment:int=2
def build_national_dps(data:NationalDpsData,issued_at:datetime)->bytes:
 if data.environment not in (1,2):raise ValueError('Ambiente fiscal inválido.')
 if not(data.issuer_tax_id.isdigit() and len(data.issuer_tax_id)==14 and data.taker_tax_id.isdigit() and len(data.taker_tax_id) in (11,14)):raise ValueError('CPF/CNPJ inválido para o cenário nacional.')
 if not(data.issuer_municipality.isdigit() and len(data.issuer_municipality)==7 and data.service_municipality.isdigit() and len(data.service_municipality)==7):raise ValueError('Município IBGE inválido.')
 if data.amount<=0 or data.number<1:raise ValueError('Valor e número da DPS devem ser positivos.')
 national_code=''.join(x for x in data.national_code if x.isdigit())
 municipal_code=''.join(x for x in (data.municipal_code or '') if x.isdigit()) or None
 nbs_code=''.join(x for x in (data.nbs_code or '') if x.isdigit()) or None
 if len(national_code)!=6:raise ValueError('Código de tributação nacional inválido.')
 q=lambda name:f'{{{NS}}}{name}';root=E.Element(q('DPS'),nsmap={None:NS},versao='1.01');identifier=f'DPS{data.issuer_municipality}2{data.issuer_tax_id}{int(data.series):05d}{data.number:015d}';info=E.SubElement(root,q('infDPS'),Id=identifier)
 def add(parent,name,value=None):
  node=E.SubElement(parent,q(name));node.text=None if value is None else str(value);return node
 for name,value in [('tpAmb',str(data.environment)),('dhEmi',issued_at.isoformat(timespec='seconds')),('verAplic','Socium_1.0'),('serie',data.series),('nDPS',data.number),('dCompet',data.competence),('tpEmit','1'),('cLocEmi',data.issuer_municipality)]:add(info,name,value)
 prest=add(info,'prest');add(prest,'CNPJ',data.issuer_tax_id);reg=add(prest,'regTrib');add(reg,'opSimpNac',data.simple_option);add(reg,'regApTribSN',data.simple_tax_regime);add(reg,'regEspTrib',data.special_tax_regime)
 taker=add(info,'toma');add(taker,'CPF' if len(data.taker_tax_id)==11 else 'CNPJ',data.taker_tax_id);add(taker,'xNome',data.taker_name)
 service=add(info,'serv');add(add(service,'locPrest'),'cLocPrestacao',data.service_municipality);codes=add(service,'cServ');add(codes,'cTribNac',national_code)
 if municipal_code:add(codes,'cTribMun',municipal_code)
 add(codes,'xDescServ',data.description)
 if nbs_code:add(codes,'cNBS',nbs_code)
 values=add(info,'valores');add(add(values,'vServPrest'),'vServ',format(data.amount,'.2f'));taxes=add(values,'trib');municipal=add(taxes,'tribMun');add(municipal,'tribISSQN',data.iss_taxation);add(municipal,'tpRetISSQN',data.iss_withholding)
 if data.iss_rate is not None:add(municipal,'pAliq',format(data.iss_rate,'.2f'))
 total_taxes=add(taxes,'totTrib')
 if data.approximate_simple_tax_rate is not None:add(total_taxes,'pTotTribSN',format(data.approximate_simple_tax_rate,'.2f'))
 else:add(total_taxes,'indTotTrib','0')
 if data.ibs_cbs and data.ibs_cbs.get('enabled'):
  rtc=add(info,'IBSCBS');add(rtc,'finNFSe',data.ibs_cbs['purpose']);add(rtc,'cIndOp',data.ibs_cbs['operationIndicator']);add(rtc,'indDest',data.ibs_cbs['destinationIndicator']);rtc_values=add(rtc,'valores');rtc_taxes=add(rtc_values,'trib');group=add(rtc_taxes,'gIBSCBS');add(group,'CST',data.ibs_cbs['taxSituation']);add(group,'cClassTrib',data.ibs_cbs['classification'])
 return E.tostring(root,encoding='UTF-8',xml_declaration=True)
def validate_xsd(raw:bytes,xsd_path:str)->None:
 parser=E.XMLParser(resolve_entities=False,no_network=True);schema=E.XMLSchema(E.parse(xsd_path,parser));schema.assertValid(E.fromstring(raw,parser))
def canonical(node:E._Element)->bytes:
 isolated=E.fromstring(E.tostring(node,with_tail=False),E.XMLParser(resolve_entities=False,no_network=True));return E.tostring(isolated,method='c14n',exclusive=False,with_comments=False)
def parse_unsigned(raw:bytes,expected_environment:int|None=None):
 if len(raw)>2_000_000 or b'<!DOCTYPE' in raw.upper():raise ValueError('XML inválido ou grande demais.')
 root=E.fromstring(raw,E.XMLParser(resolve_entities=False,no_network=True,remove_blank_text=True));info=root.find(f'{{{NS}}}infDPS')
 if root.tag!=f'{{{NS}}}DPS' or info is None or not info.get('Id'):raise ValueError('DPS/infDPS inválida.')
 environment=info.findtext(f'{{{NS}}}tpAmb');
 if environment not in ('1','2') or (expected_environment is not None and environment!=str(expected_environment)):raise ValueError('Ambiente fiscal divergente ou inválido.')
 if root.find(f'{{{DS}}}Signature') is not None:raise ValueError('DPS já assinada.')
 return root,info
def sign_national_dps(raw:bytes,key:rsa.RSAPrivateKey,cert:x509.Certificate,expected_environment:int|None=None)->bytes:
 root,info=parse_unsigned(raw,expected_environment);sig=E.SubElement(root,f'{{{DS}}}Signature',nsmap={None:DS});signed=E.SubElement(sig,f'{{{DS}}}SignedInfo')
 E.SubElement(signed,f'{{{DS}}}CanonicalizationMethod',Algorithm='http://www.w3.org/TR/2001/REC-xml-c14n-20010315');E.SubElement(signed,f'{{{DS}}}SignatureMethod',Algorithm=DS+'rsa-sha1')
 ref=E.SubElement(signed,f'{{{DS}}}Reference',URI='#'+info.get('Id'));trans=E.SubElement(ref,f'{{{DS}}}Transforms');E.SubElement(trans,f'{{{DS}}}Transform',Algorithm=DS+'enveloped-signature');E.SubElement(trans,f'{{{DS}}}Transform',Algorithm='http://www.w3.org/TR/2001/REC-xml-c14n-20010315');E.SubElement(ref,f'{{{DS}}}DigestMethod',Algorithm=DS+'sha1')
 digest=hashlib.sha1(canonical(info)).digest();E.SubElement(ref,f'{{{DS}}}DigestValue').text=base64.b64encode(digest).decode();signature=key.sign(canonical(signed),padding.PKCS1v15(),hashes.SHA1());E.SubElement(sig,f'{{{DS}}}SignatureValue').text=base64.b64encode(signature).decode();ki=E.SubElement(sig,f'{{{DS}}}KeyInfo');xd=E.SubElement(ki,f'{{{DS}}}X509Data');E.SubElement(xd,f'{{{DS}}}X509Certificate').text=base64.b64encode(cert.public_bytes(serialization.Encoding.DER)).decode()
 result=E.tostring(root,encoding='UTF-8',xml_declaration=True);parsed=E.fromstring(result);key.public_key().verify(signature,canonical(parsed.find('.//'+f'{{{DS}}}SignedInfo')),padding.PKCS1v15(),hashes.SHA1());return result
def build_cancellation_request(issuer_tax_id:str,access_key:str,reason_code:str,reason:str,environment:int,event_at:datetime)->bytes:
 if environment not in (1,2):raise ValueError('Ambiente fiscal inválido.')
 if not(issuer_tax_id.isdigit() and len(issuer_tax_id) in (11,14)):raise ValueError('CPF/CNPJ do autor inválido.')
 if not(access_key.isdigit() and len(access_key)==50):raise ValueError('Chave de acesso da NFS-e inválida.')
 if reason_code not in ('1','2','9'):raise ValueError('Motivo de cancelamento inválido.')
 reason=reason.strip()
 if not 15<=len(reason)<=255:raise ValueError('A justificativa deve ter entre 15 e 255 caracteres.')
 q=lambda name:f'{{{NS}}}{name}';root=E.Element(q('pedRegEvento'),nsmap={None:NS},versao='1.01');info=E.SubElement(root,q('infPedReg'),Id=f'PRE{access_key}101101')
 def add(parent,name,value):node=E.SubElement(parent,q(name));node.text=str(value);return node
 add(info,'tpAmb',environment);add(info,'verAplic','Helians_1.0');add(info,'dhEvento',event_at.isoformat(timespec='seconds'));add(info,'CNPJAutor' if len(issuer_tax_id)==14 else 'CPFAutor',issuer_tax_id);add(info,'chNFSe',access_key);event=add(info,'e101101','');event.text=None;add(event,'xDesc','Cancelamento de NFS-e');add(event,'cMotivo',reason_code);add(event,'xMotivo',reason)
 return E.tostring(root,encoding='UTF-8',xml_declaration=True)
def sign_event_request(raw:bytes,key:rsa.RSAPrivateKey,cert:x509.Certificate,expected_environment:int|None=None)->bytes:
 if len(raw)>2_000_000 or b'<!DOCTYPE' in raw.upper():raise ValueError('XML inválido ou grande demais.')
 root=E.fromstring(raw,E.XMLParser(resolve_entities=False,no_network=True,remove_blank_text=True));info=root.find(f'{{{NS}}}infPedReg')
 if root.tag!=f'{{{NS}}}pedRegEvento' or info is None or not info.get('Id'):raise ValueError('Pedido de evento inválido.')
 environment=info.findtext(f'{{{NS}}}tpAmb')
 if environment not in ('1','2') or (expected_environment is not None and environment!=str(expected_environment)):raise ValueError('Ambiente fiscal divergente ou inválido.')
 if root.find(f'{{{DS}}}Signature') is not None:raise ValueError('Pedido de evento já assinado.')
 sig=E.SubElement(root,f'{{{DS}}}Signature',nsmap={None:DS});signed=E.SubElement(sig,f'{{{DS}}}SignedInfo');E.SubElement(signed,f'{{{DS}}}CanonicalizationMethod',Algorithm='http://www.w3.org/TR/2001/REC-xml-c14n-20010315');E.SubElement(signed,f'{{{DS}}}SignatureMethod',Algorithm=DS+'rsa-sha1');ref=E.SubElement(signed,f'{{{DS}}}Reference',URI='#'+info.get('Id'));trans=E.SubElement(ref,f'{{{DS}}}Transforms');E.SubElement(trans,f'{{{DS}}}Transform',Algorithm=DS+'enveloped-signature');E.SubElement(trans,f'{{{DS}}}Transform',Algorithm='http://www.w3.org/TR/2001/REC-xml-c14n-20010315');E.SubElement(ref,f'{{{DS}}}DigestMethod',Algorithm=DS+'sha1');E.SubElement(ref,f'{{{DS}}}DigestValue').text=base64.b64encode(hashlib.sha1(canonical(info)).digest()).decode();signature=key.sign(canonical(signed),padding.PKCS1v15(),hashes.SHA1());E.SubElement(sig,f'{{{DS}}}SignatureValue').text=base64.b64encode(signature).decode();ki=E.SubElement(sig,f'{{{DS}}}KeyInfo');xd=E.SubElement(ki,f'{{{DS}}}X509Data');E.SubElement(xd,f'{{{DS}}}X509Certificate').text=base64.b64encode(cert.public_bytes(serialization.Encoding.DER)).decode();return E.tostring(root,encoding='UTF-8',xml_declaration=True)
def sign_sha1_homologation(raw:bytes,key:rsa.RSAPrivateKey,cert:x509.Certificate)->bytes:return sign_national_dps(raw,key,cert,2)
def transmission_body(signed:bytes)->dict[str,str]:return {'dpsXmlGZipB64':base64.b64encode(gzip.compress(signed)).decode()}
def event_transmission_body(signed:bytes)->dict[str,str]:return {'pedidoRegistroEventoXmlGZipB64':base64.b64encode(gzip.compress(signed)).decode()}
def classify(status:int,body:bytes)->str:
 if status>=500:return 'technical_failure'
 try:data=json.loads(body)
 except Exception:return 'unknown' if status in (200,201,404) else 'technical_failure'
 code=str(data.get('cStat') or data.get('status') or '')
 errors=data.get('erros') or data.get('errors') or []
 if status in (200,201) and data.get('chaveAcesso') and data.get('nfseXmlGZipB64'):return 'authorized'
 if status in (200,201) and code=='100' and (data.get('chaveAcesso') or data.get('nfseXmlGZipB64')):return 'authorized'
 if errors or (status in (400,422) and (code or isinstance(data,dict))):return 'rejected'
 return 'unknown'
