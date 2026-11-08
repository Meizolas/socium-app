"""Prova de integração NFS-e. Apenas homologação; certificado A1 local."""
import argparse
import base64
import gzip
import hashlib
import json
import os
import ssl
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone
from getpass import getpass
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.serialization.pkcs12 import load_key_and_certificates
from lxml import etree as E

NS = 'http://www.sped.fazenda.gov.br/nfse'
DS = 'http://www.w3.org/2000/09/xmldsig#'
BASE = 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional'


def canonical(node):
    # Materializar o contexto de namespaces antes de canonicalizar o subelemento.
    # Evita divergências ao sombrear o namespace padrão da DPS dentro da assinatura.
    isolated = E.fromstring(E.tostring(node, with_tail=False), E.XMLParser(
        resolve_entities=False, no_network=True))
    return E.tostring(isolated, method='c14n', exclusive=False, with_comments=False)


def read_xml(path):
    raw = Path(path).read_bytes()
    if len(raw) > 2_000_000 or b'<!DOCTYPE' in raw.upper():
        raise ValueError('XML grande demais ou com DOCTYPE.')
    # Normalizar ANTES da assinatura: não assinar a indentação de apresentação.
    # Não modificar os bytes após a assinatura ou a compactação.
    root = E.fromstring(raw, E.XMLParser(
        resolve_entities=False, no_network=True, remove_blank_text=True))
    if root.tag != '{' + NS + '}DPS':
        raise ValueError('A raiz precisa ser DPS no namespace nacional.')
    info = root.find('{' + NS + '}infDPS')
    if info is None or not info.get('Id'):
        raise ValueError('infDPS/Id ausente.')
    if info.findtext('{' + NS + '}tpAmb') != '2':
        raise ValueError('Bloqueado: tpAmb precisa ser 2 (homologação).')
    ids = root.xpath('//@Id')
    if len(ids) != len(set(ids)):
        raise ValueError('Identificadores XML repetidos.')
    if root.find('{' + DS + '}Signature') is not None:
        raise ValueError('Forneça DPS sem assinatura; o programa assina localmente.')
    return root, info


def sign(root, info, key, cert, algorithm):
    # O perfil deve ser confirmado no leiaute vigente antes de enviar.
    algo = hashes.SHA256() if algorithm == 'sha256' else hashes.SHA1()
    digest_uri = 'http://www.w3.org/2001/04/xmlenc#sha256' if algorithm == 'sha256' else DS + 'sha1'
    signature_uri = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256' if algorithm == 'sha256' else DS + 'rsa-sha1'
    # A SEFIN rejeita prefixos de namespace (E1228). Usar XMLDSig como
    # namespace padrão de Signature; canonical() isola o contexto antes do hash.
    sig = E.SubElement(root, '{' + DS + '}Signature', nsmap={None: DS})
    signed = E.SubElement(sig, '{' + DS + '}SignedInfo')
    E.SubElement(signed, '{' + DS + '}CanonicalizationMethod', Algorithm='http://www.w3.org/TR/2001/REC-xml-c14n-20010315')
    E.SubElement(signed, '{' + DS + '}SignatureMethod', Algorithm=signature_uri)
    ref = E.SubElement(signed, '{' + DS + '}Reference', URI='#' + info.get('Id'))
    transforms = E.SubElement(ref, '{' + DS + '}Transforms')
    E.SubElement(transforms, '{' + DS + '}Transform', Algorithm=DS + 'enveloped-signature')
    E.SubElement(transforms, '{' + DS + '}Transform', Algorithm='http://www.w3.org/TR/2001/REC-xml-c14n-20010315')
    E.SubElement(ref, '{' + DS + '}DigestMethod', Algorithm=digest_uri)
    digest = hashlib.new(algorithm, canonical(info)).digest()
    E.SubElement(ref, '{' + DS + '}DigestValue').text = base64.b64encode(digest).decode()
    signature = key.sign(canonical(signed), padding.PKCS1v15(), algo)
    E.SubElement(sig, '{' + DS + '}SignatureValue').text = base64.b64encode(signature).decode()
    ki = E.SubElement(sig, '{' + DS + '}KeyInfo')
    xd = E.SubElement(ki, '{' + DS + '}X509Data')
    E.SubElement(xd, '{' + DS + '}X509Certificate').text = base64.b64encode(cert.public_bytes(serialization.Encoding.DER)).decode()
    raw = E.tostring(root, encoding='UTF-8', xml_declaration=True)
    # Verificar após serializar, sem reformatar o XML.
    parsed = E.fromstring(raw)
    checked_info = parsed.find('{' + NS + '}infDPS')
    checked_signed = parsed.find('.//{' + DS + '}SignedInfo')
    if hashlib.new(algorithm, canonical(checked_info)).digest() != digest:
        raise ValueError('Digest mudou após serialização.')
    cert.public_key().verify(signature, canonical(checked_signed), padding.PKCS1v15(), algo)
    # Verificação adicional de interoperabilidade com leitor sem espaços de
    # indentação. Essa leitura não altera conteúdo textual significativo.
    compact = E.fromstring(raw, E.XMLParser(
        resolve_entities=False, no_network=True, remove_blank_text=True))
    compact_info = compact.find('{' + NS + '}infDPS')
    compact_signed = compact.find('.//{' + DS + '}SignedInfo')
    if hashlib.new(algorithm, canonical(compact_info)).digest() != digest:
        raise ValueError('Digest depende de espaços de indentação.')
    cert.public_key().verify(signature, canonical(compact_signed), padding.PKCS1v15(), algo)
    return raw


def validate_schema(raw, path):
    schema = E.XMLSchema(E.parse(str(path), E.XMLParser(no_network=True, resolve_entities=False)))
    schema.assertValid(E.fromstring(raw))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def request(context, method, path, body=None, base=BASE):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, method=method,
                                 headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
    opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=context))
    try:
        with opener.open(req, timeout=45) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('acao', choices=['conexao', 'validar', 'emitir', 'consultar'])
    p.add_argument('--pfx', required=True, help='Arquivo A1 .pfx ou .p12 local')
    p.add_argument('--xml', help='DPS sem assinatura, com dados validados pelo contador')
    p.add_argument('--xsd', help='XSD raiz da DPS vigente em homologação; manter os includes juntos')
    p.add_argument('--algoritmo', choices=['sha1', 'sha256'], help='Perfil XMLDSig confirmado no manual vigente')
    p.add_argument('--municipio', help='Código IBGE de sete dígitos, para conexão')
    p.add_argument('--chave', help='Chave de acesso para consultar')
    p.add_argument('--saida', default='resultados')
    args = p.parse_args()
    password = getpass('Senha do A1 (não aparece na tela): ').encode()
    key, cert, chain = load_key_and_certificates(Path(args.pfx).read_bytes(), password)
    del password
    if not isinstance(key, rsa.RSAPrivateKey) or cert is None:
        raise ValueError('A1 precisa conter chave RSA e certificado.')
    now = datetime.now(timezone.utc)
    if not cert.not_valid_before_utc <= now <= cert.not_valid_after_utc:
        raise ValueError('Certificado fora da validade.')
    print('Certificado carregado localmente; validade:', cert.not_valid_after_utc.date())
    out = Path(args.saida)
    out.mkdir(parents=True, exist_ok=True)
    raw = None
    info = None
    if args.acao in ['validar', 'emitir']:
        if not args.xml or not args.xsd or not args.algoritmo:
            p.error('Informe --xml, --xsd e --algoritmo confirmado no manual.')
        root, info = read_xml(args.xml)
        raw = sign(root, info, key, cert, args.algoritmo)
        validate_schema(raw, args.xsd)
        signed_path = out / (info.get('Id') + '-assinada.xml')
        signed_path.write_bytes(raw)
        print('DPS de homologação assinada, assinatura verificada e XSD validado.')
        if args.acao == 'validar':
            print('Nenhuma conexão realizada. Arquivo:', signed_path)
            return
    # Chave privada temporária permanece criptografada; removida ao sair.
    with tempfile.TemporaryDirectory(prefix='nfse-local-') as temp:
        secret = os.urandom(32).hex().encode()
        pem = Path(temp) / 'cliente.pem'
        pem.write_bytes(key.private_bytes(serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8, serialization.BestAvailableEncryption(secret)) +
            cert.public_bytes(serialization.Encoding.PEM) + b''.join(
                c.public_bytes(serialization.Encoding.PEM) for c in (chain or [])))
        os.chmod(pem, 0o600)
        ctx = ssl.create_default_context()
        ctx.load_cert_chain(str(pem), password=secret.decode())
        if args.acao == 'conexao':
            if not args.municipio or len(args.municipio) != 7 or not args.municipio.isdigit():
                p.error('Informe --municipio com sete dígitos.')
            status, data = request(ctx, 'GET', '/' + args.municipio + '/convenio', base='https://adn.producaorestrita.nfse.gov.br/parametrizacao',)
        elif args.acao == 'consultar':
            if not args.chave or not args.chave.isdigit() or len(args.chave) != 50:
                p.error('Informe --chave com 50 dígitos.')
            status, data = request(ctx, 'GET', '/nfse/' + args.chave)
        else:
            # Consulta pelo identificador antes de transmitir; sem reenvio cego.
            status, data = request(ctx, 'HEAD', '/dps/' + info.get('Id'))
            if status != 404:
                raise ValueError(f'Pré-consulta retornou HTTP {status}. Não transmitir; investigar/consultar a DPS.')
            print('Destino:', BASE, '| tpAmb=2. Confira empresa, competência e valores no XML.')
            if input('Digite EMITIR HOMOLOGACAO para enviar: ').strip() != 'EMITIR HOMOLOGACAO':
                print('Envio não realizado.')
                return
            # Registro anterior ao POST: mesmo em timeout, preservar ID e consultar depois.
            (out / (info.get('Id') + '-tentativa.json')).write_text(json.dumps({
                'idDPS': info.get('Id'), 'ambiente': 2, 'destino': BASE,
                'instante': now.isoformat(), 'sha256_xml': hashlib.sha256(raw).hexdigest()
            }, indent=2), encoding='utf-8')
            status, data = request(ctx, 'POST', '/nfse', {
                'dpsXmlGZipB64': base64.b64encode(gzip.compress(raw)).decode()})
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')
        result = out / (stamp + '-resposta.json')
        result.write_bytes(data)
        print('HTTP:', status, '| Resposta salva em:', result)
        if status < 200 or status >= 300:
            print('Operação não comprovada. Examine a resposta; não repetir emissão automaticamente.')
            raise SystemExit(2)
        print('Resposta HTTP recebida. Para comprovar emissão, conferir chave e XML e consultar a nota.')


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print('Não foi possível concluir:', type(error).__name__, str(error))
        print('Se houve tentativa de POST, o resultado pode ser desconhecido. Consulte a DPS antes de reenviar.')
        raise SystemExit(1)
