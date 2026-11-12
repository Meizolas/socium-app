import { requireAppContext, authError } from "@/lib/auth-context";

function validCnpj(value: string) {
	const digits = value.replace(/\D/g, "");
	if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
	const calculate = (length: number) => {
		let sum = 0, weight = length - 7;
		for (let index = 0; index < length; index += 1) {
			sum += Number(digits[index]) * weight--;
			if (weight < 2) weight = 9;
		}
		const remainder = sum % 11;
		return remainder < 2 ? 0 : 11 - remainder;
	};
	return calculate(12) === Number(digits[12]) && calculate(13) === Number(digits[13]);
}

export async function GET(request: Request) {
	try {
		await requireAppContext(request, "nfse", ["admin"]);
		const cnpj = new URL(request.url).searchParams.get("cnpj")?.replace(/\D/g, "") || "";
		if (!validCnpj(cnpj)) return Response.json({ error: "Informe um CNPJ válido." }, { status: 400 });

		const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
			headers: { Accept: "application/json", "User-Agent": "Helians-NFSe/1.0" },
			signal: AbortSignal.timeout(7000),
			cache: "no-store",
		});
		if (response.status === 404) return Response.json({ error: "CNPJ não encontrado na consulta cadastral." }, { status: 404 });
		if (!response.ok) return Response.json({ error: "A consulta cadastral está indisponível. Informe os dados manualmente." }, { status: 503 });
		const company = await response.json();
		const simpleOption = company.opcao_pelo_mei === true ? "2" : company.opcao_pelo_simples === true ? "3" : "1";
		return Response.json({
			cnpj,
			legalName: company.razao_social || company.nome_fantasia || "",
			municipalityIbge: String(company.codigo_municipio_ibge || "").replace(/\D/g, ""),
			municipalityName: company.municipio || "",
			uf: company.uf || "",
			simpleNationalOption: simpleOption,
			source: "BrasilAPI",
		});
	} catch (error) {
		if (error instanceof DOMException && error.name === "TimeoutError")
			return Response.json({ error: "A consulta cadastral demorou mais que o esperado. Informe os dados manualmente." }, { status: 504 });
		return authError(error);
	}
}
