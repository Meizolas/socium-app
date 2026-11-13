import { authError, requireAppContext } from "@/lib/auth-context";
import { supabaseAdmin } from "@/lib/supabase-server";

type CompanyResponse = {
	razao_social?: string; nome_fantasia?: string; codigo_municipio_ibge?: number | string;
	municipio?: string; uf?: string; opcao_pelo_simples?: boolean; opcao_pelo_mei?: boolean;
};

export async function GET(request: Request) {
	try {
		const context = await requireAppContext(request, undefined, ["admin"]);
		const db = supabaseAdmin();
		const link = await db.from("office_legal_entity_links")
			.select("legal_entities(tax_id,entity_type)").eq("office_id", context.officeId)
			.eq("relationship", "owner").eq("status", "active").eq("source", "certificate").maybeSingle();
		if (link.error) throw new Error(link.error.message);
		const raw = link.data?.legal_entities;
		const entity = (Array.isArray(raw) ? raw[0] : raw) as { tax_id: string; entity_type: string } | null | undefined;
		if (!entity || entity.entity_type !== "company")
			return Response.json({ error: "É necessário validar um e-CNPJ da empresa." }, { status: 403 });
		const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${entity.tax_id}`, {
			headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store",
		});
		if (!response.ok) return Response.json({ error: "Não foi possível localizar o CNPJ. Preencha os dados manualmente." }, { status: 404 });
		const company = await response.json() as CompanyResponse;
		const simpleNationalOption = company.opcao_pelo_mei ? "2" : company.opcao_pelo_simples ? "3" : "1";
		return Response.json({
			legalName: company.razao_social || company.nome_fantasia || "",
			municipalityIbge: String(company.codigo_municipio_ibge || "").replace(/\D/g, ""),
			municipalityName: company.municipio || "", uf: company.uf || "", simpleNationalOption,
			source: "BrasilAPI",
		});
	} catch (error) {
		if (error instanceof DOMException && error.name === "TimeoutError")
			return Response.json({ error: "A consulta cadastral demorou demais. Preencha os dados manualmente." }, { status: 504 });
		return authError(error);
	}
}
