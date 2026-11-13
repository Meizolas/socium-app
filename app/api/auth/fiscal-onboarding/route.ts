import { z } from "zod";
import { authError, requireAppContext, supabaseForSession } from "@/lib/auth-context";
import { supabaseAdmin } from "@/lib/supabase-server";

const fiscalInput = z.object({
	legalEntityId: z.string().uuid(),
	legalName: z.string().trim().min(2).max(200),
	municipalRegistration: z.string().trim().max(40).nullable().optional(),
	municipalityIbge: z.string().regex(/^\d{7}$/),
	taxRegime: z.string().trim().min(2).max(80),
	dpsSeries: z.string().regex(/^[A-Za-z0-9]{1,5}$/),
	simpleNationalOption: z.enum(["1", "2", "3"]),
	simpleNationalTaxationRegime: z.enum(["1", "2", "3"]),
	specialTaxRegime: z.enum(["0", "1", "2", "3", "4", "5", "6"]),
}).strict();

export async function GET(request: Request) {
	try {
		const context = await requireAppContext(request, undefined, ["admin"]);
		const db = supabaseAdmin();
		const links = await db.from("office_legal_entity_links")
			.select("legal_entity_id,legal_entities(id,tax_id,entity_type,canonical_name,identity_verified_at)")
			.eq("office_id", context.officeId).eq("relationship", "owner")
			.eq("status", "active").eq("source", "certificate");
		if (links.error) throw new Error(links.error.message);
		const raw = links.data?.[0]?.legal_entities;
		const entity = (Array.isArray(raw) ? raw[0] : raw) as {
			id: string; tax_id: string; entity_type: string; canonical_name: string | null;
			identity_verified_at: string | null;
		} | null | undefined;
		if (!entity)
			return Response.json({ error: "A identidade titular ainda não foi validada por certificado." }, { status: 403 });
		if (entity.entity_type !== "company")
			return Response.json({ entity, requiresCompanyCertificate: true, status: "identity_only" });
		const [issuer, setup, certificate] = await Promise.all([
			db.from("nfse_issuers").select("id,legal_name,municipal_registration,municipality_ibge,tax_regime,dps_series,simple_national_option,simple_national_taxation_regime,special_tax_regime")
				.eq("office_id", context.officeId).eq("legal_entity_id", entity.id).maybeSingle(),
			db.from("nfse_onboarding_setups").select("status,issuer_id,completed_at")
				.eq("office_id", context.officeId).eq("legal_entity_id", entity.id).maybeSingle(),
			db.from("nfse_certificates").select("issuer_id,not_after,status")
				.eq("office_id", context.officeId).eq("status", "active"),
		]);
		if (issuer.error || setup.error || certificate.error)
			throw new Error(issuer.error?.message || setup.error?.message || certificate.error?.message);
		const activeCertificate = (certificate.data || []).find((item) => item.issuer_id === issuer.data?.id) || null;
		return Response.json({ entity, issuer: issuer.data, setup: setup.data, activeCertificate }, { headers: { "Cache-Control": "no-store" } });
	} catch (error) { return authError(error); }
}

export async function POST(request: Request) {
	try {
		await requireAppContext(request, undefined, ["admin"]);
		const parsed = fiscalInput.safeParse(await request.json());
		if (!parsed.success)
			return Response.json({ error: "Confira os dados fiscais informados." }, { status: 400 });
		const value = parsed.data;
		const result = await supabaseForSession(request).rpc("complete_verified_owner_nfse_setup", {
			p_legal_entity: value.legalEntityId,
			p_legal_name: value.legalName,
			p_municipal_registration: value.municipalRegistration || null,
			p_municipality_ibge: value.municipalityIbge,
			p_tax_regime: value.taxRegime,
			p_dps_series: value.dpsSeries,
			p_simple_option: value.simpleNationalOption,
			p_simple_regime: value.simpleNationalTaxationRegime,
			p_special_regime: value.specialTaxRegime,
		});
		if (result.error) {
			if (result.error.message.includes("verified_company_owner_required"))
				return Response.json({ error: "Somente o titular da empresa validado por e-CNPJ pode concluir esta etapa." }, { status: 403 });
			if (result.error.message.includes("invalid_fiscal_setup"))
				return Response.json({ error: "Os dados fiscais informados são inválidos." }, { status: 400 });
			throw new Error(result.error.message);
		}
		return Response.json({ issuerId: result.data, status: "fiscal_ready" }, { status: 201 });
	} catch (error) { return authError(error); }
}
