import { z } from "zod";
import { authError, requireAppContext, supabaseForSession } from "@/lib/auth-context";
import { isValidTaxId, normalizeTaxId } from "@/lib/br-tax-id";
import { supabaseAdmin } from "@/lib/supabase-server";

const input = z.object({
	taxId: z.string().transform(normalizeTaxId).refine((value) => value.length === 14 && isValidTaxId(value)),
	legalName: z.string().trim().min(2).max(200),
	municipalRegistration: z.string().trim().max(40).nullable().optional(),
	municipalityIbge: z.string().regex(/^\d{7}$/),
	taxRegime: z.string().trim().min(2).max(80),
	dpsSeries: z.string().regex(/^[A-Za-z0-9]{1,5}$/),
	simpleNationalOption: z.enum(["1", "2", "3"]),
	simpleNationalTaxationRegime: z.enum(["1", "2", "3"]),
	specialTaxRegime: z.enum(["0", "1", "2", "3", "4", "5", "6"]),
	certificateId: z.string().uuid(),
}).strict();

export async function POST(request: Request) {
	try {
		const context = await requireAppContext(request, undefined, ["admin"]);
		const parsed = input.safeParse(await request.json());
		if (!parsed.success) return Response.json({ error: "Confira os dados da empresa representada." }, { status: 400 });
		const value = parsed.data;
		const setup = await supabaseForSession(request).rpc("complete_self_service_representation", {
			p_represented_tax_id: value.taxId, p_legal_name: value.legalName,
			p_municipal_registration: value.municipalRegistration || null, p_municipality_ibge: value.municipalityIbge,
			p_tax_regime: value.taxRegime, p_dps_series: value.dpsSeries,
			p_simple_option: value.simpleNationalOption, p_simple_regime: value.simpleNationalTaxationRegime,
			p_special_regime: value.specialTaxRegime, p_certificate: value.certificateId,
		});
		if (setup.error) {
			if (setup.error.message.includes("verified_representative_certificate_required"))
				return Response.json({ error: "O certificado do representante não está válido para esta conta." }, { status: 403 });
			if (setup.error.message.includes("invalid_representation_setup"))
				return Response.json({ error: "Os dados da empresa representada são inválidos." }, { status: 400 });
			throw new Error(setup.error.message);
		}
		const activated = await supabaseAdmin().rpc("activate_self_service_modules", { p_office: context.officeId });
		if (activated.error) throw new Error(activated.error.message);
		return Response.json({ issuerId: setup.data, status: "ready", modules: activated.data }, { status: 201 });
	} catch (error) { return authError(error); }
}
