import unittest

from nfse.danfse_v2 import PORTAL_QUERY, render_danfse_v2


def official_xml(environment="1", key="29333072219463142000113000000000000126119189322968"):
    return f'''<?xml version="1.0" encoding="utf-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">
 <infNFSe Id="NFS{key}">
  <xLocEmi>Vitória da Conquista</xLocEmi><xLocPrestacao>Vitória da Conquista</xLocPrestacao>
  <nNFSe>1</nNFSe><xLocIncid>Vitória da Conquista</xLocIncid>
  <xTribNac>Contabilidade, inclusive serviços técnicos e auxiliares.</xTribNac>
  <ambGer>2</ambGer><cStat>100</cStat><dhProc>2026-11-09T19:21:12-03:00</dhProc>
  <emit><CNPJ>19463142000113</CNPJ><xNome>SOCIUM CONTABIL LTDA</xNome>
   <enderNac><xLgr>RUA SINHAZINHA SANTOS</xLgr><nro>85</nro><xBairro>CENTRO</xBairro><cMun>2933307</cMun><UF>BA</UF><CEP>45000505</CEP></enderNac>
   <fone>7799954833</fone><email>FISCALSOCIUM@GMAIL.COM</email></emit><valores><vLiq>10.00</vLiq></valores>
  <DPS><infDPS><tpAmb>{environment}</tpAmb><dhEmi>2026-11-09T19:21:11-03:00</dhEmi><serie>1</serie><nDPS>6</nDPS><dCompet>2026-11-09</dCompet>
   <prest><regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN></regTrib></prest>
   <toma><CNPJ>42057096000174</CNPJ><xNome>GMS ACESSORIOS PARA MOTOCICLETAS LTDA</xNome></toma>
   <serv><cServ><cTribNac>171901</cTribNac><xDescServ>Serviços de contabilidade</xDescServ><cNBS>113022100</cNBS></cServ></serv>
   <valores><vServPrest><vServ>10.00</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><pTotTribSN>6.00</pTotTribSN></totTrib></trib></valores>
  </infDPS></DPS>
 </infNFSe>
</NFSe>'''.encode("utf-8")


class DanfseV2Tests(unittest.TestCase):
    def test_production_pdf_is_generated_from_official_xml(self):
        pdf = render_danfse_v2(official_xml())
        self.assertTrue(pdf.startswith(b"%PDF-1."))
        self.assertGreater(len(pdf), 8_000)

    def test_homologation_pdf_is_generated(self):
        self.assertTrue(render_danfse_v2(official_xml("2")).startswith(b"%PDF-1."))

    def test_rejects_non_official_or_invalid_key(self):
        with self.assertRaisesRegex(ValueError, "XML oficial"):
            render_danfse_v2(b"<NFSe/>")
        with self.assertRaisesRegex(ValueError, "Chave de acesso"):
            render_danfse_v2(official_xml(key="123"))

    def test_qr_uses_public_consultation_url(self):
        self.assertEqual(PORTAL_QUERY, "https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=")


if __name__ == "__main__":
    unittest.main()
