from __future__ import annotations
import base64,gzip,hashlib,json
from dataclasses import dataclass
from decimal import Decimal
from lxml import etree as E
from cryptography import x509
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import padding,rsa

NS='http://www.sped.fazenda.gov.br/nfse'; DS='http://www.w3.org/2000/09/xmldsig#'
SEFIN_HOMOLOGATION='https://sefin.producaorestrita.nfse.gov.br/SefinNacional'
ADN_HOMOLOGATION='https://adn.producaorestrita.nfse.gov.br/parametrizacao'
@dataclass(frozen=True)
class InvoiceData: issuer_tax_id:str; taker_tax_id:str; competence:str; amount:Decimal; description:str; series:str; number:int; environment:int=2
def canonical(node:E._Element)->bytes:
 isolated=E.fromstring(E.tostring(node,with_tail=False),E.XMLParser(resolve_entities=False,no_network=True));return E.tostring(isolated,method='c14n',exclusive=False,with_comments=False)
def parse_unsigned(raw:bytes):
 if len(raw)>2_000_000 or b'<!DOCTYPE' in raw.upper():raise ValueError('XML inválido ou grande demais.')
 root=E.fromstring(raw,E.XMLParser(resolve_entities=False,no_network=True,remove_blank_text=True));info=root.find(f'{{{NS}}}infDPS')
 if root.tag!=f'{{{NS}}}DPS' or info is None or not info.get('Id'):raise ValueError('DPS/infDPS inválida.')
 if info.findtext(f'{{{NS}}}tpAmb')!='2':raise ValueError('Produção bloqueada: tpAmb deve ser 2.')
 if root.find(f'{{{DS}}}Signature') is not None:raise ValueError('DPS já assinada.')
 return root,info
def sign_sha1_homologation(raw:bytes,key:rsa.RSAPrivateKey,cert:x509.Certificate)->bytes:
 root,info=parse_unsigned(raw);sig=E.SubElement(root,f'{{{DS}}}Signature',nsmap={None:DS});signed=E.SubElement(sig,f'{{{DS}}}SignedInfo')
 E.SubElement(signed,f'{{{DS}}}CanonicalizationMethod',Algorithm='http://www.w3.org/TR/2001/REC-xml-c14n-20010315');E.SubElement(signed,f'{{{DS}}}SignatureMethod',Algorithm=DS+'rsa-sha1')
 ref=E.SubElement(signed,f'{{{DS}}}Reference',URI='#'+info.get('Id'));trans=E.SubElement(ref,f'{{{DS}}}Transforms');E.SubElement(trans,f'{{{DS}}}Transform',Algorithm=DS+'enveloped-signature');E.SubElement(trans,f'{{{DS}}}Transform',Algorithm='http://www.w3.org/TR/2001/REC-xml-c14n-20010315');E.SubElement(ref,f'{{{DS}}}DigestMethod',Algorithm=DS+'sha1')
 digest=hashlib.sha1(canonical(info)).digest();E.SubElement(ref,f'{{{DS}}}DigestValue').text=base64.b64encode(digest).decode();signature=key.sign(canonical(signed),padding.PKCS1v15(),hashes.SHA1());E.SubElement(sig,f'{{{DS}}}SignatureValue').text=base64.b64encode(signature).decode();ki=E.SubElement(sig,f'{{{DS}}}KeyInfo');xd=E.SubElement(ki,f'{{{DS}}}X509Data');E.SubElement(xd,f'{{{DS}}}X509Certificate').text=base64.b64encode(cert.public_bytes(serialization.Encoding.DER)).decode()
 result=E.tostring(root,encoding='UTF-8',xml_declaration=True);parsed=E.fromstring(result);key.public_key().verify(signature,canonical(parsed.find('.//'+f'{{{DS}}}SignedInfo')),padding.PKCS1v15(),hashes.SHA1());return result
def transmission_body(signed:bytes)->dict[str,str]:return {'dpsXmlGZipB64':base64.b64encode(gzip.compress(signed)).decode()}
def classify(status:int,body:bytes)->str:
 if status>=500:return 'technical_failure'
 try:data=json.loads(body)
 except Exception:return 'unknown' if status in (200,201,404) else 'technical_failure'
 code=str(data.get('cStat') or data.get('status') or '')
 if status in (200,201) and code=='100' and (data.get('chaveAcesso') or data.get('nfseXmlGZipB64')):return 'authorized'
 if status in (400,422) and code:return 'rejected'
 return 'unknown'
