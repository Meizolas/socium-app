import { authError, requireAppContext } from "@/lib/auth-context";
import { supabaseAdmin } from "@/lib/supabase-server";
import { CertificateInputError, storeNfseCertificate } from "@/lib/nfse/store-certificate";

export async function POST(request: Request) {
	try {
		const context = await requireAppContext(request, undefined, ["admin"]);
		const form = await request.formData();
		const file = form.get("certificate"), password = String(form.get("password") || ""), issuerId = String(form.get("issuerId") || "");
		if (!(file instanceof File) || !["application/x-pkcs12", "application/octet-stream"].includes(file.type)
			|| file.size < 1 || file.size > 5_000_000 || !password || !/^[0-9a-f-]{36}$/i.test(issuerId))
			return Response.json({ error: "Arquivo, senha ou emitente inválido." }, { status: 400 });
		const db = supabaseAdmin();
		const setup = await db.from("nfse_onboarding_setups")
			.select("issuer_id,legal_entity_id").eq("office_id", context.officeId)
			.eq("issuer_id", issuerId).maybeSingle();
		if (setup.error) throw new Error(setup.error.message);
		if (!setup.data) return Response.json({ error: "Configuração fiscal não autorizada para esta conta." }, { status: 403 });
		const ownership = await db.from("office_legal_entity_links").select("id")
			.eq("office_id", context.officeId).eq("legal_entity_id", setup.data.legal_entity_id)
			.eq("relationship", "owner").eq("status", "active").eq("source", "certificate").maybeSingle();
		if (ownership.error) throw new Error(ownership.error.message);
		if (!ownership.data) return Response.json({ error: "Titularidade da empresa não confirmada." }, { status: 403 });
		const result = await storeNfseCertificate(context.officeId, issuerId, file, password);
		const marked = await db.rpc("mark_nfse_onboarding_certificate_ready", { p_office: context.officeId, p_issuer: issuerId });
		if (marked.error) throw new Error(marked.error.message);
		return Response.json({ uploaded: true, ...result }, { status: 201 });
	} catch (error) {
		if (error instanceof CertificateInputError) return Response.json({ error: error.message }, { status: 400 });
		return authError(error);
	}
}
