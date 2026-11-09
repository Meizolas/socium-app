from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
from xml.etree import ElementTree as ET

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

NS = "urn:socium:nfse:simulacao:1"
ET.register_namespace("", NS)


def _q(name: str) -> str:
    return f"{{{NS}}}{name}"


def _text(parent: ET.Element, name: str, value) -> ET.Element:
    node = ET.SubElement(parent, _q(name))
    node.text = "" if value is None else str(value)
    return node


def _money(value) -> str:
    number = Decimal(str(value or 0)).quantize(Decimal("0.01"))
    return f"R$ {number:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")


def _tax_id(value: str) -> str:
    digits = "".join(x for x in str(value or "") if x.isdigit())
    if len(digits) == 14:
        return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"
    return value or "—"


def build_simulated_xml(invoice: dict, reference: str, issued_at: datetime | None = None) -> bytes:
    snapshot = invoice.get("snapshot") or {}
    issuer, taker, service = (snapshot.get(x) or {} for x in ("issuer", "taker", "service"))
    data = snapshot.get("invoice") or {}
    operation, taxation = data.get("operation") or {}, data.get("taxation") or {}
    issued = issued_at or datetime.now(timezone.utc)
    amount = Decimal(str(data.get("amount", invoice.get("amount", 0))))
    unconditional = Decimal(str(data.get("unconditionalDiscount") or 0))
    conditional = Decimal(str(data.get("conditionalDiscount") or 0))

    root = ET.Element(_q("NFSeSimulada"), versao="1.01", ambiente="local", semValorFiscal="true")
    info = ET.SubElement(root, _q("infNFSe"), Id=reference)
    for name, value in (("referencia", reference), ("ambienteGerador", "SIMULATED_LOCAL"),
                        ("dataHoraEmissao", issued.isoformat(timespec="seconds")),
                        ("competencia", data.get("competence", invoice.get("competence"))),
                        ("numeroDPS", data.get("number", invoice.get("dps_number"))),
                        ("serieDPS", data.get("series", invoice.get("series")))):
        _text(info, name, value)

    provider = ET.SubElement(info, _q("prestador"))
    for name, value in (("CNPJ", issuer.get("tax_id")), ("razaoSocial", issuer.get("legal_name")),
                        ("inscricaoMunicipal", issuer.get("municipal_registration")),
                        ("codigoMunicipioIBGE", issuer.get("municipality_ibge")),
                        ("opcaoSimplesNacional", issuer.get("simple_national_option")),
                        ("regimeApuracaoSN", issuer.get("simple_national_taxation_regime")),
                        ("regimeEspecialTributacao", issuer.get("special_tax_regime"))):
        _text(provider, name, value)

    customer = ET.SubElement(info, _q("tomador"))
    for name, value in (("CNPJ", taker.get("tax_id")), ("razaoSocial", taker.get("legal_name")),
                        ("email", taker.get("email"))):
        _text(customer, name, value)
    address = ET.SubElement(customer, _q("endereco"))
    for name, value in (taker.get("address") or {}).items():
        _text(address, str(name), value)

    provided = ET.SubElement(info, _q("servico"))
    for name, value in (("codigoTributacaoNacional", service.get("national_code")),
                        ("codigoTributacaoMunicipal", service.get("municipal_code")),
                        ("codigoNBS", service.get("nbs_code")),
                        ("municipioPrestacaoIBGE", operation.get("serviceMunicipalityIbge")),
                        ("descricao", data.get("description", invoice.get("description")))):
        _text(provided, name, value)

    tax = ET.SubElement(info, _q("tributacaoMunicipal"))
    for name, value in (("enquadramentoISS", taxation.get("issTaxation")),
                        ("retencaoISS", taxation.get("issWithholding")),
                        ("aliquotaISS", taxation.get("issRate"))):
        _text(tax, name, value)
    values = ET.SubElement(info, _q("valores"))
    for name, value in (("valorServico", f"{amount:.2f}"), ("descontoIncondicionado", f"{unconditional:.2f}"),
                        ("descontoCondicionado", f"{conditional:.2f}"),
                        ("valorLiquido", f"{amount-unconditional-conditional:.2f}")):
        _text(values, name, value)
    _text(info, "informacoesComplementares", operation.get("additionalInformation"))
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def build_simulated_pdf(invoice: dict, reference: str, issued_at: datetime | None = None) -> bytes:
    snapshot = invoice.get("snapshot") or {}
    issuer, taker, service = (snapshot.get(x) or {} for x in ("issuer", "taker", "service"))
    data = snapshot.get("invoice") or {}
    operation, taxation = data.get("operation") or {}, data.get("taxation") or {}
    issued = issued_at or datetime.now(timezone.utc)
    amount = Decimal(str(data.get("amount", invoice.get("amount", 0))))
    unconditional = Decimal(str(data.get("unconditionalDiscount") or 0))
    conditional = Decimal(str(data.get("conditionalDiscount") or 0))
    styles = getSampleStyleSheet()
    normal = ParagraphStyle("cell", parent=styles["Normal"], fontName="Helvetica", fontSize=7.2, leading=9)
    title = ParagraphStyle("title", parent=normal, fontName="Helvetica-Bold", fontSize=12, leading=14, alignment=TA_CENTER)
    warning = ParagraphStyle("warning", parent=title, textColor=colors.HexColor("#b42318"), fontSize=16, leading=18)
    label = ParagraphStyle("label", parent=normal, fontName="Helvetica-Bold", fontSize=6.5, textColor=colors.HexColor("#344054"))
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=8*mm, rightMargin=8*mm, topMargin=8*mm, bottomMargin=8*mm)

    def cell(name, value):
        return Paragraph(f"<b>{name}</b><br/>{'—' if value in (None, '') else value}", normal)

    def section(name):
        table = Table([[Paragraph(name, label)]], colWidths=[194*mm])
        table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eaecf0")),
                                   ("BOX", (0, 0), (-1, -1), .5, colors.HexColor("#667085")),
                                   ("LEFTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 3),
                                   ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        return table

    def grid(rows, widths=None):
        table = Table(rows, colWidths=widths or [194*mm/len(rows[0])]*len(rows[0]), hAlign="LEFT")
        table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), .35, colors.HexColor("#98a2b3")),
                                   ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 4),
                                   ("RIGHTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 4),
                                   ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
        return table

    story = [Paragraph("SIMULAÇÃO — SEM VALOR FISCAL", warning),
             Paragraph("DANFSe LOCAL — Documento Auxiliar da NFS-e Simulada", title), Spacer(1, 3*mm),
             grid([[cell("REFERÊNCIA LOCAL", reference), cell("NÚMERO DA DPS", data.get("number", invoice.get("dps_number"))),
                    cell("SÉRIE DA DPS", data.get("series", invoice.get("series")))] ]),
             grid([[cell("COMPETÊNCIA", data.get("competence", invoice.get("competence"))),
                    cell("DATA E HORA DA SIMULAÇÃO", issued.astimezone().strftime("%d/%m/%Y %H:%M:%S")),
                    cell("AMBIENTE", "Local — sem comunicação governamental")]]),
             section("PRESTADOR / FORNECEDOR"),
             grid([[cell("CNPJ", _tax_id(issuer.get("tax_id"))), cell("NOME EMPRESARIAL", issuer.get("legal_name")),
                    cell("INSCRIÇÃO MUNICIPAL", issuer.get("municipal_registration"))],
                   [cell("CÓDIGO IBGE", issuer.get("municipality_ibge")), cell("SIMPLES NACIONAL", issuer.get("simple_national_option")),
                    cell("REGIME ESPECIAL", issuer.get("special_tax_regime"))]]),
             section("TOMADOR / ADQUIRENTE"),
             grid([[cell("CNPJ", _tax_id(taker.get("tax_id"))), cell("NOME EMPRESARIAL", taker.get("legal_name")),
                    cell("E-MAIL", taker.get("email"))]]),
             section("SERVIÇO PRESTADO"),
             grid([[cell("TRIBUTAÇÃO NACIONAL / MUNICIPAL", f"{service.get('national_code') or '—'} / {service.get('municipal_code') or '—'}"),
                    cell("CÓDIGO NBS", service.get("nbs_code")), cell("LOCAL DA PRESTAÇÃO (IBGE)", operation.get("serviceMunicipalityIbge"))],
                   [cell("DESCRIÇÃO DO SERVIÇO", data.get("description", invoice.get("description"))), "", ""]]),
             section("TRIBUTAÇÃO MUNICIPAL (ISSQN)"),
             grid([[cell("TIPO DE TRIBUTAÇÃO", taxation.get("issTaxation")), cell("RETENÇÃO DO ISSQN", taxation.get("issWithholding")),
                    cell("ALÍQUOTA", f"{taxation.get('issRate')}%" if taxation.get("issRate") else "—")]]),
             section("VALOR TOTAL DA NFS-e SIMULADA"),
             grid([[cell("VALOR DO SERVIÇO", _money(amount)), cell("DESCONTO INCONDICIONADO", _money(unconditional)),
                    cell("DESCONTO CONDICIONADO", _money(conditional)), cell("VALOR LÍQUIDO", _money(amount-unconditional-conditional))]]),
             section("INFORMAÇÕES COMPLEMENTARES"),
             grid([[Paragraph(str(operation.get("additionalInformation") or "—"), normal)]]), Spacer(1, 5*mm),
             Paragraph("Este documento foi produzido por um provedor simulado local. Não possui chave de acesso nacional, QR Code governamental, validade fiscal ou autorização da administração tributária.",
                       ParagraphStyle("foot", parent=normal, textColor=colors.HexColor("#b42318"), fontName="Helvetica-Bold"))]
    doc.build(story)
    return buffer.getvalue()
