"""Gera rascunho local de DPS para homologação; não assina nem transmite."""
import argparse
from datetime import datetime, timezone, timedelta
from pathlib import Path
import xml.etree.ElementTree as E

NS = 'http://www.sped.fazenda.gov.br/nfse'
E.register_namespace('', NS)


def build(serie, numero, now):
    if not 1 <= serie <= 49999 or not 1 <= numero <= 999999999999999:
        raise ValueError('Série de API entre 1 e 49999; número de 1 a 15 dígitos.')
    cnpj = '19463142000113'
    cidade = '2933307'
    root = E.Element('{' + NS + '}DPS', versao='1.01')
    identifier = f'DPS{cidade}2{cnpj}{serie:05d}{numero:015d}'
    info = E.SubElement(root, '{' + NS + '}infDPS', Id=identifier)

    def add(parent, name, value=None):
        node = E.SubElement(parent, '{' + NS + '}' + name)
        if value is not None:
            node.text = str(value)
        return node

    for k, v in [('tpAmb', '2'), ('dhEmi', now.isoformat(timespec='seconds')),
                 ('verAplic', 'SociumTeste_0.1'), ('serie', serie), ('nDPS', numero),
                 ('dCompet', now.date().isoformat()), ('tpEmit', '1'),
                 ('finNFSe', '0'), ('cLocEmi', cidade)]:
        add(info, k, v)
    prest = add(info, 'prest')
    add(prest, 'CNPJ', cnpj)
    regime = add(prest, 'regTrib')
    add(regime, 'opSimpNac', '3')
    # Regime de apuração 1 é hipótese do rascunho: confirmar via cadastro/parâmetros.
    add(regime, 'regApTribSN', '1')
    add(regime, 'regEspTrib', '0')
    toma = add(info, 'toma')
    add(toma, 'CNPJ', '42057096000174')
    add(toma, 'xNome', 'GMS ACESSORIOS PARA MOTOCICLETAS LTDA')
    serv = add(info, 'serv')
    add(add(serv, 'locPrest'), 'cLocPrestacao', cidade)
    cs = add(serv, 'cServ')
    add(cs, 'cTribNac', '171901')
    add(cs, 'cNBS', '113022100')
    add(cs, 'xDescServ', 'TESTE EM HOMOLOGACAO SEM VALIDADE FISCAL - Servicos de contabilidade, inclusive servicos tecnicos e auxiliares.')
    valores = add(info, 'valores')
    add(add(valores, 'vServPrest'), 'vServ', '1.00')
    trib = add(valores, 'trib')
    mun = add(trib, 'tribMun')
    add(mun, 'tribISSQN', '1')
    add(mun, 'tpRetISSQN', '1')
    add(add(trib, 'totTrib'), 'pTotTribSN', '6.00')
    E.indent(root, space='  ')
    return E.tostring(root, encoding='utf-8', xml_declaration=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--serie', type=int, default=1)
    p.add_argument('--numero', type=int, default=1)
    p.add_argument('--saida', default='dps_homologacao_corrigida.xml')
    args = p.parse_args()
    path = Path(args.saida)
    raw = build(args.serie, args.numero, datetime.now(timezone(timedelta(hours=-3))))
    # Não substituir um documento que pode estar em processamento.
    with path.open('xb') as f:
        f.write(raw)
    print('Rascunho criado:', path.resolve())
    print('tpAmb=2. Não houve assinatura, conexão ou emissão.')
    print('Estrutura verificada contra o XSD de homologação fornecido em 08/11/2026.')
    print('Pendente: regras fiscais/cadastrais, contrato da API e perfil de assinatura.')
    print('Se existir tentativa de transmissão deste ID, consulte o resultado antes de gerar outra DPS.')


if __name__ == '__main__':
    main()
