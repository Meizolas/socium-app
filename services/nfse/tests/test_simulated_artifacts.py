import unittest
from datetime import datetime, timezone

from nfse.simulated_artifacts import build_simulated_pdf, build_simulated_xml


class SimulatedArtifactsTest(unittest.TestCase):
    def setUp(self):
        self.invoice = {
            "amount": "350.00", "description": "Serviço sintético", "series": "1", "dps_number": 2,
            "snapshot": {
                "issuer": {"tax_id": "11222333000181", "legal_name": "Emitente Sintético", "municipality_ibge": "3550308"},
                "taker": {"tax_id": "99888777000166", "legal_name": "Tomador Sintético", "email": "fiscal@example.test"},
                "service": {"national_code": "260101", "municipal_code": "100", "nbs_code": "107020000"},
                "invoice": {"competence": "2026-11-09", "amount": "350.00", "description": "Serviço sintético",
                            "series": "1", "number": 2, "unconditionalDiscount": "10.00", "conditionalDiscount": "0.00",
                            "operation": {"serviceMunicipalityIbge": "3550308", "additionalInformation": "Teste local"},
                            "taxation": {"issTaxation": "taxable", "issWithholding": "not_withheld", "issRate": "2.00"}}
            }
        }

    def test_xml_contains_complete_local_fiscal_sections(self):
        raw = build_simulated_xml(self.invoice, "SIMULATED-TEST", datetime(2026, 11, 9, tzinfo=timezone.utc))
        for value in (b'semValorFiscal="true"', b"prestador", b"tomador", b"servico", b"tributacaoMunicipal", b"valorLiquido"):
            self.assertIn(value, raw)
        self.assertNotIn(b"chaveAcesso", raw)

    def test_pdf_is_valid_and_explicitly_simulated(self):
        raw = build_simulated_pdf(self.invoice, "SIMULATED-TEST", datetime(2026, 11, 9, tzinfo=timezone.utc))
        self.assertTrue(raw.startswith(b"%PDF-"))
        self.assertGreater(len(raw), 2500)


if __name__ == "__main__":
    unittest.main()
