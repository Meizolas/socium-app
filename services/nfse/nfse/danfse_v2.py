from __future__ import annotations

import base64
from datetime import datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO
from xml.etree import ElementTree as ET

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

PORTAL_QUERY = "https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave="
LAYOUT_VERSION = "DANFSe v2.0 / NT 008"
_LOGO_NFSE = base64.b64decode(
    "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"
)


def _decode_xml(raw: bytes) -> str:
    """Decode SEFIN XML without mutating the stored/signed original document."""
    try:
        text = raw.decode("utf-8")
        if "\ufffd" not in text:
            return text
    except UnicodeDecodeError:
        pass
    return raw.decode("latin-1")


def _local(node: ET.Element) -> str:
    return node.tag.rsplit("}", 1)[-1]


def _first(parent: ET.Element, name: str) -> ET.Element | None:
    return next((node for node in parent.iter() if _local(node) == name), None)


def _direct(parent: ET.Element | None, name: str) -> ET.Element | None:
    if parent is None:
        return None
    return next((node for node in list(parent) if _local(node) == name), None)


def _value(parent: ET.Element | None, name: str, default: str = "-") -> str:
    node = _direct(parent, name)
    value = (node.text or "").strip() if node is not None else ""
    return value or default


def _desc(parent: ET.Element | None, name: str, default: str = "-") -> str:
    if parent is None:
        return default
    node = _first(parent, name)
    value = (node.text or "").strip() if node is not None else ""
    return value or default


def _digits(value: str) -> str:
    return "".join(character for character in value if character.isdigit())


def _tax_id(value: str) -> str:
    value = _digits(value)
    if len(value) == 14:
        return f"{value[:2]}.{value[2:5]}.{value[5:8]}/{value[8:12]}-{value[12:]}"
    if len(value) == 11:
        return f"{value[:3]}.{value[3:6]}.{value[6:9]}-{value[9:]}"
    return value or "-"


def _phone(value: str) -> str:
    value = _digits(value)
    if len(value) == 11:
        return f"({value[:2]}) {value[2:7]}-{value[7:]}"
    if len(value) == 10:
        return f"({value[:2]}) {value[2:6]}-{value[6:]}"
    return value or "-"


def _cep(value: str) -> str:
    value = _digits(value)
    return f"{value[:2]}.{value[2:5]}-{value[5:]}" if len(value) == 8 else value or "-"


def _ibge(value: str) -> str:
    value = _digits(value)
    return f"{value[:2]}.{value[2:]}" if len(value) == 7 else value or "-"


def _service_code(value: str) -> str:
    value = _digits(value)
    return f"{value[:2]}.{value[2:4]}.{value[4:]}" if len(value) == 6 else value or "-"


def _nbs(value: str) -> str:
    value = _digits(value)
    return f"{value[:1]}.{value[1:5]}.{value[5:7]}.{value[7:]}" if len(value) == 9 else value or "-"


def _date(value: str, with_time: bool = False) -> str:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.strftime("%d/%m/%Y %H:%M:%S" if with_time else "%d/%m/%Y")
    except (ValueError, TypeError):
        try:
            return datetime.strptime(value, "%Y-%m-%d").strftime("%d/%m/%Y")
        except (ValueError, TypeError):
            return value or "-"


def _money(value: str) -> str:
    try:
        number = Decimal(value).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return "-"
    return f"R$ {number:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")


def _address(node: ET.Element | None) -> str:
    address = _direct(node, "enderNac")
    if address is None:
        address = _direct(node, "end")
    if address is None:
        return "-"
    parts = [_value(address, "xLgr", ""), _value(address, "nro", ""), _value(address, "xBairro", "")]
    complement = _value(address, "xCpl", "")
    if complement:
        parts.insert(2, complement)
    return ", ".join(part for part in parts if part) or "-"


def _municipality(node: ET.Element | None, fallback_name: str = "-", fallback_uf: str = "-") -> str:
    address = _direct(node, "enderNac")
    if address is None:
        address = _direct(node, "end")
    name = _value(address, "xMun", fallback_name) if address is not None else fallback_name
    uf = _value(address, "UF", fallback_uf) if address is not None else fallback_uf
    return f"{name} / {uf}" if name != "-" or uf != "-" else "-"


def _wrap(text: str, width: float, font: str, size: float, max_lines: int = 3) -> list[str]:
    words = str(text or "-").replace("\n", " ").split()
    lines: list[str] = []
    while words and len(lines) < max_lines:
        line = words.pop(0)
        while words and stringWidth(line + " " + words[0], font, size) <= width:
            line += " " + words.pop(0)
        lines.append(line)
    if words and lines:
        while lines[-1] and stringWidth(lines[-1] + "...", font, size) > width:
            lines[-1] = lines[-1][:-1]
        lines[-1] += "..."
    return lines or ["-"]


class _Layout:
    def __init__(self, pdf: canvas.Canvas):
        self.pdf = pdf
        self.page_width, self.page_height = A4
        self.left, self.right = 3 * mm, A4[0] - 3 * mm
        self.width = self.right - self.left
        self.y = A4[1] - 3 * mm

    def line(self, y: float | None = None, width: float = 0.55):
        self.pdf.setLineWidth(width)
        self.pdf.setStrokeColor(colors.HexColor("#282828"))
        target = self.y if y is None else y
        self.pdf.line(self.left, target, self.right, target)

    def section(self, title: str, subtitle: str | None = None, height: float = 7 * mm):
        top = self.y
        self.pdf.setFillColor(colors.HexColor("#ededed"))
        self.pdf.rect(self.left, top - height, self.width, height, fill=1, stroke=0)
        self.line(top); self.line(top - height)
        self.pdf.setFillColor(colors.black)
        self.pdf.setFont("Helvetica-Bold", 7)
        self.pdf.drawString(self.left + 1.5 * mm, top - 2.8 * mm, title.upper())
        if subtitle:
            self.pdf.setFont("Helvetica", 7)
            self.pdf.drawString(self.left + 1.5 * mm, top - 5.8 * mm, subtitle)
        self.y -= height

    def cells(self, cells: list[tuple[str, str]], widths: list[float] | None = None,
              height: float = 10 * mm, max_lines: int = 2, shaded_last: bool = False):
        widths = widths or [self.width / len(cells)] * len(cells)
        x, top = self.left, self.y
        for index, ((label, value), width) in enumerate(zip(cells, widths)):
            if shaded_last and index == len(cells) - 1:
                self.pdf.setFillColor(colors.HexColor("#ededed"))
                self.pdf.rect(x, top - height, width, height, fill=1, stroke=0)
            if index:
                self.pdf.setStrokeColor(colors.HexColor("#b5b5b5")); self.pdf.setLineWidth(.25)
                self.pdf.line(x, top, x, top - height)
            self.pdf.setFillColor(colors.black); self.pdf.setFont("Helvetica-Bold", 6)
            self.pdf.drawString(x + 1.5 * mm, top - 2.5 * mm, label)
            self.pdf.setFont("Helvetica", 7)
            for line_index, line in enumerate(_wrap(value, width - 3 * mm, "Helvetica", 7, max_lines)):
                self.pdf.drawString(x + 1.5 * mm, top - (5.2 + line_index * 2.7) * mm, line)
            x += width
        self.y -= height
        self.line(self.y, .35)

    def centered_band(self, value: str, height: float = 4.5 * mm):
        self.pdf.setFont("Helvetica", 7)
        self.pdf.setFillColor(colors.black)
        self.pdf.drawCentredString(self.left + self.width / 2, self.y - height / 2 - 2, value)
        self.y -= height
        self.line(self.y, .35)


def _logo(pdf: canvas.Canvas, x: float, y: float):
    pdf.setFont("Helvetica-Bold", 25)
    pdf.setFillColor(colors.HexColor("#248b5b")); pdf.drawString(x, y, "N")
    pdf.setFillColor(colors.HexColor("#70a947")); pdf.drawString(x + 14, y, "F")
    pdf.setFillColor(colors.HexColor("#318bb2")); pdf.drawString(x + 26, y, "S")
    pdf.setFont("Helvetica-Bold", 12); pdf.drawString(x + 42, y + 1, "e")
    pdf.setFont("Helvetica", 5.2); pdf.setFillColor(colors.HexColor("#666666"))
    pdf.drawString(x + 51, y + 10, "Nota Fiscal de")
    pdf.drawString(x + 51, y + 4, "Serviço eletrônica")


def _qr(pdf: canvas.Canvas, key: str, x: float, y: float, size: float = 18 * mm):
    widget = QrCodeWidget(PORTAL_QUERY + key)
    bounds = widget.getBounds(); width, height = bounds[2] - bounds[0], bounds[3] - bounds[1]
    drawing = Drawing(size, size, transform=[size / width, 0, 0, size / height, 0, 0])
    drawing.add(widget)
    renderPDF.draw(drawing, pdf, x, y)


def render_danfse_v2(raw_xml: bytes) -> bytes:
    root = ET.fromstring(_decode_xml(raw_xml).encode("utf-8"))
    info = _first(root, "infNFSe")
    if info is None or not info.attrib.get("Id", "").startswith("NFS"):
        raise ValueError("XML oficial de NFS-e inválido para geração do DANFSe.")
    key = info.attrib["Id"][3:]
    if len(_digits(key)) != 50:
        raise ValueError("Chave de acesso da NFS-e inválida.")
    dps = _first(info, "infDPS")
    issuer, taker, service = _direct(info, "emit"), _direct(dps, "toma"), _direct(dps, "serv")
    values, dps_values = _direct(info, "valores"), _direct(dps, "valores")
    municipal = _first(dps_values, "tribMun") if dps_values is not None else None
    total_tax = _first(dps_values, "totTrib") if dps_values is not None else None
    issuer_address = _direct(issuer, "enderNac")
    taker_address = _direct(taker, "end")
    if taker_address is None:
        taker_address = _direct(taker, "enderNac")
    city = _value(info, "xLocEmi")
    uf = _value(issuer_address, "UF")
    environment = _value(dps, "tpAmb")
    issue_status = "NFS-e Gerada" if _value(info, "cStat") == "100" else _value(info, "cStat")
    service_codes = _direct(service, "cServ")
    provider_regime = _first(_direct(dps, "prest"), "regTrib")
    simple = {"1": "Não Optante", "2": "Optante - Microempreendedor Individual (MEI)",
              "3": "Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)"}.get(_value(provider_regime, "opSimpNac"), "-")
    simple_regime = {"1": "Regime de apuração dos tributos federais e municipal pelo Simples Nacional",
                     "2": "Regime de apuração dos tributos federais pelo Simples Nacional e ISSQN pela NFS-e"}.get(_value(provider_regime, "regApTribSN"), "-")
    withholding = "Retido" if _value(municipal, "tpRetISSQN") == "2" else "Não Retido"
    iss_type = {"1": "Operação Tributável", "2": "Imunidade", "3": "Exportação de Serviço",
                "4": "Não Incidência"}.get(_value(municipal, "tribISSQN"), "-")
    amount = _desc(dps_values, "vServ")
    net = _value(values, "vLiq", amount)
    approximate = _value(total_tax, "pTotTribSN", "")

    output = BytesIO(); pdf = canvas.Canvas(output, pagesize=A4, pageCompression=1)
    pdf.setTitle(f"DANFSe {key}"); pdf.setAuthor("Socium - representação conforme NT 008")
    layout = _Layout(pdf)
    pdf.setStrokeColor(colors.HexColor("#222222")); pdf.setLineWidth(.7)
    pdf.rect(layout.left, 3 * mm, layout.width, A4[1] - 6 * mm, fill=0, stroke=1)

    header_top = layout.y; header_height = 13 * mm
    _logo(pdf, layout.left + 2 * mm, header_top - 10.2 * mm)
    pdf.setFillColor(colors.black); pdf.setFont("Helvetica-Bold", 9)
    pdf.drawCentredString(A4[0] / 2, header_top - 5.1 * mm, "DANFSe v2.0")
    pdf.drawCentredString(A4[0] / 2, header_top - 9.1 * mm, "Documento Auxiliar da NFS-e")
    if environment == "2":
        pdf.setFillColor(colors.red); pdf.drawCentredString(A4[0] / 2, header_top - 12.2 * mm, "NFS-e SEM VALIDADE JURÍDICA")
    pdf.setFillColor(colors.black); pdf.setFont("Helvetica", 7.5)
    pdf.drawString(layout.right - 51 * mm, header_top - 4.5 * mm, f"Município: {city} - {uf}")
    pdf.setFont("Helvetica", 6)
    pdf.drawString(layout.right - 51 * mm, header_top - 7.4 * mm, f"Ambiente Gerador: {_value(info, 'ambGer')}")
    pdf.drawString(layout.right - 51 * mm, header_top - 10.1 * mm, f"Tipo de Ambiente: {environment}")
    layout.y -= header_height; layout.line()

    id_top, id_height = layout.y, 30 * mm
    id_width = layout.width - 51 * mm
    pdf.setFont("Helvetica-Bold", 7); pdf.drawString(layout.left + 1.5 * mm, id_top - 3 * mm, "CHAVE DE ACESSO DA NFS-e")
    pdf.setFont("Helvetica", 7); pdf.drawString(layout.left + 1.5 * mm, id_top - 6 * mm, key)
    columns = [layout.left, layout.left + 52 * mm, layout.left + 104 * mm]
    labels = [("NÚMERO DA NFS-e", _value(info, "nNFSe")), ("COMPETÊNCIA DA NFS-e", _date(_value(dps, "dCompet"))),
              ("DATA E HORA DA EMISSÃO DA NFS-e", _date(_value(info, "dhProc"), True)),
              ("NÚMERO DA DPS", _value(dps, "nDPS")), ("SÉRIE DA DPS", _value(dps, "serie")),
              ("DATA E HORA DA EMISSÃO DA DPS", _date(_value(dps, "dhEmi"), True))]
    for index, (label, value) in enumerate(labels):
        row, column = divmod(index, 3); x = columns[column]; y = id_top - (10 + row * 9) * mm
        pdf.setFont("Helvetica-Bold", 7); pdf.drawString(x + 1.5 * mm, y, label)
        pdf.setFont("Helvetica", 7); pdf.drawString(x + 1.5 * mm, y - 3 * mm, value)
    _qr(pdf, key, layout.right - 34 * mm, id_top - 19.5 * mm)
    pdf.setFont("Helvetica", 5.8)
    message = ["A autenticidade desta NFS-e pode ser verificada", "pela leitura deste código QR ou pela consulta da", "chave de acesso no portal nacional da NFS-e"]
    for index, line in enumerate(message): pdf.drawString(layout.right - 50 * mm, id_top - (22.5 + index * 2.4) * mm, line)
    layout.y -= id_height; layout.line()

    layout.cells([("EMITENTE DA NFS-e", "Prestador"), ("SITUAÇÃO DA NFS-e", issue_status), ("FINALIDADE", "-")], height=8 * mm)
    layout.section("PRESTADOR / FORNECEDOR", height=4.5 * mm)
    layout.cells([("CNPJ / CPF / NIF", _tax_id(_value(issuer, "CNPJ", _value(issuer, "CPF")))),
                  ("Indicador Municipal (Inscrição)", _value(issuer, "IM")), ("Telefone", _phone(_value(issuer, "fone")))], height=8 * mm)
    layout.cells([("Nome / Nome Empresarial", _value(issuer, "xNome")), ("Município / Sigla UF", f"{city} / {uf}"),
                  ("Código IBGE / CEP", f"{_ibge(_value(issuer_address, 'cMun', _value(dps, 'cLocEmi')))} / {_cep(_value(issuer_address, 'CEP'))}")], height=8 * mm)
    layout.cells([("Endereço", _address(issuer)), ("E-mail", _value(issuer, "email"))], widths=[layout.width / 2] * 2, height=8 * mm)
    layout.cells([("Simples Nacional na Data de Competência", simple), ("Regime de Apuração Tributária pelo SN", simple_regime)], widths=[layout.width * .25, layout.width * .75], height=8 * mm)

    layout.section("TOMADOR / ADQUIRENTE", height=4.5 * mm)
    layout.cells([("CNPJ / CPF / NIF", _tax_id(_value(taker, "CNPJ", _value(taker, "CPF")))),
                  ("Indicador Municipal (Inscrição)", _value(taker, "IM")), ("Telefone", _phone(_value(taker, "fone")))], height=8 * mm)
    taker_city = _value(taker_address, "xMun") if taker_address is not None else "-"; taker_uf = _value(taker_address, "UF") if taker_address is not None else "-"
    layout.cells([("Nome / Nome Empresarial", _value(taker, "xNome")), ("Município / Sigla UF", f"{taker_city} / {taker_uf}" if taker_city != "-" else "-"),
                  ("Código IBGE / CEP", f"{_ibge(_value(taker_address, 'cMun'))} / {_cep(_value(taker_address, 'CEP'))}" if taker_address is not None else "-")], height=8 * mm)
    layout.cells([("Endereço", _address(taker)), ("E-mail", _value(taker, "email"))], widths=[layout.width / 2] * 2, height=8 * mm)
    layout.centered_band("DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e")
    layout.centered_band("INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e")

    layout.section("SERVIÇO PRESTADO", height=4.5 * mm)
    layout.cells([("Código de Tributação Nacional/Municipal", f"{_service_code(_value(service_codes, 'cTribNac'))} / {_value(service_codes, 'cTribMun')}"),
                  ("Código da NBS", _nbs(_value(service_codes, "cNBS"))), ("Local da Prestação / Sigla UF / País", f"{_value(info, 'xLocPrestacao')} / {uf} / -")], height=8 * mm)
    layout.cells([("", _value(info, "xTribNac")), ("", "")], widths=[layout.width, 0], height=5.5 * mm, max_lines=2)
    layout.cells([("Descrição do Serviço", _value(service_codes, "xDescServ"))], height=8 * mm)

    layout.section("TRIBUTAÇÃO MUNICIPAL (ISSQN)", height=4.5 * mm)
    layout.cells([("Tipo de Tributação do ISSQN", iss_type), ("Município / Sigla UF / País de Incidência do ISSQN", f"{_value(info, 'xLocIncid')} / {uf} / -")], widths=[layout.width / 2] * 2, height=8 * mm)
    layout.cells([("BC ISSQN", _money(_value(values, "vBC"))), ("Alíquota Aplicada", (_value(municipal, "pAliq") + "%") if _value(municipal, "pAliq") != "-" else "-"),
                  ("Retenção do ISSQN", withholding), ("ISSQN Apurado", _money(_value(values, "vISSQN")))], height=8 * mm)

    layout.section("TRIBUTAÇÃO FEDERAL (EXCETO CBS)", height=4.5 * mm)
    layout.cells([("IRRF", "-"), ("Contribuição Previdenciária - Retida", "-"), ("Contribuições Sociais - Retidas", "-")], height=7 * mm)
    layout.cells([("PIS - Débito Apuração Própria", "-"), ("COFINS - Débito Apuração Própria", "-"), ("Descrição Contrib. Sociais - Retidas", "-")], height=7 * mm)

    layout.section("TRIBUTAÇÃO IBS/CBS", height=4.5 * mm)
    layout.cells([("CST / cClassTrib", "- / -"), ("Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF", "- / - / - / -")], widths=[layout.width * .25, layout.width * .75], height=7 * mm)
    layout.cells([("Exclusões e Reduções da Base de Cálculo", "R$ 0,00"), ("Base de Cálculo Após Exclusões e Reduções", "-"),
                  ("Red. Alíquota IBS / Red. Alíquota CBS", "- / - / -"), ("Alíquota - IBS UF / IBS Mun", "- / -")], height=7 * mm)
    layout.cells([("Alíq. Efetiva Municipal - IBS", "-"), ("Valor Apurado Municipal - IBS", "-"),
                  ("Alíq. Efetiva Estadual - IBS", "-"), ("Valor Apurado Estadual - IBS", "-")], height=7 * mm)
    layout.cells([("Valor Total Apurado - IBS", "-"), ("Alíquota - CBS", "-"), ("Alíquota Efetiva - CBS", "-"), ("Valor Total Apurado - CBS", "-")], height=7 * mm)

    layout.section("VALOR TOTAL DA NFS-e", height=4.5 * mm)
    layout.cells([("VALOR DA OPERAÇÃO / SERVIÇO", _money(amount)), ("Desconto Incondicionado", _money(_desc(dps_values, "vDescIncond"))),
                  ("Desconto Condicionado", _money(_desc(dps_values, "vDescCond")))], height=7 * mm)
    layout.cells([("Total das Retenções (ISSQN / Federais)", "-"), ("VALOR LÍQUIDO DA NFS-e", _money(net)),
                  ("Total do IBS/CBS", "R$ 0,00"), ("VALOR LÍQUIDO DA NFS-e + IBS/CBS", _money(net))], height=7 * mm, shaded_last=True)

    layout.section("INFORMAÇÕES COMPLEMENTARES", height=4.5 * mm)
    extra = f"Totais aproximados dos Tributos cfe. Lei nº 12.741/2012: Federais: -; Estaduais: -; Municipais: {approximate + '%' if approximate else '-'};"
    pdf.setFont("Helvetica", 7); pdf.drawString(layout.left + 1.5 * mm, layout.y - 6 * mm, extra)

    footer_y = 6 * mm; footer_h = 8 * mm
    pdf.setLineWidth(.7); pdf.rect(layout.left + 1.5 * mm, footer_y, layout.width - 3 * mm, footer_h, fill=0, stroke=1)
    footer_widths = [49 * mm, 49 * mm, layout.width - 101 * mm]
    x = layout.left + 1.5 * mm
    for index, (label, value) in enumerate([("DATA CIENTIFICAÇÃO:", ""), ("IDENTIFICAÇÃO E ASSINATURA", ""), ("Nº NFS-e / CHAVE NFS-e", f"{_value(info, 'nNFSe')} / {key}")]):
        if index:
            pdf.line(x, footer_y, x, footer_y + footer_h)
        pdf.setFont("Helvetica-Bold", 5.5); pdf.drawString(x + 1 * mm, footer_y + 5.5 * mm, label)
        pdf.setFont("Helvetica", 5.5); pdf.drawString(x + 1 * mm, footer_y + 2.4 * mm, value)
        x += footer_widths[index]

    pdf.setSubject(f"Representação do XML oficial da NFS-e; {LAYOUT_VERSION}")
    pdf.showPage(); pdf.save()
    return output.getvalue()
