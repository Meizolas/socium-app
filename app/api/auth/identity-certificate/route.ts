import { randomUUID } from "node:crypto";
import { authError, requireAppContext } from "@/lib/auth-context";
import { custodyReady, sealSecret } from "@/lib/nfse/custody";
import { CertificateInputError, parseIdentityCertificate } from "@/lib/nfse/store-certificate";
import { localMode } from "@/lib/local-db";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function POST(request: Request) {
	let stored = "";
	try {
		const context = await requireAppContext(request, undefined, ["admin"]);
		if (localMode()) return Response.json({ error: "A validação de identidade por A1 exige o ambiente integrado." }, { status: 409 });
		if (!custodyReady()) return Response.json({ error: "Custódia NFS-e não configurada." }, { status: 503 });
		const form = await request.formData();
		const file = form.get("certificate"), password = String(form.get("password") || "");
		if (!(file instanceof File) || file.size < 1 || file.size > 5_000_000 || !password)
			return Response.json({ error: "Informe um arquivo PFX/P12 válido e sua senha." }, { status: 400 });

		const db = supabaseAdmin();
		const [account, claim] = await Promise.all([
			db.from("helians_accounts").select("login_tax_id,status").eq("auth_user_id", context.userId).maybeSingle(),
			db.from("office_legal_entity_links").select("legal_entity_id").eq("office_id", context.officeId)
				.eq("relationship", "managed").eq("status", "pending").eq("source", "self_registration").maybeSingle(),
		]);
		if (account.error || claim.error) throw new Error(account.error?.message || claim.error?.message);
		if (!account.data || account.data.status !== "active" || !claim.data)
			return Response.json({ error: "Não existe uma identidade pendente para esta conta." }, { status: 409 });

		const bytes = Buffer.from(await file.arrayBuffer());
		const parsed = parseIdentityCertificate(bytes, password, account.data.login_tax_id);
		const entityId = claim.data.legal_entity_id;
		const reference = `${context.officeId}/identity/${entityId}/${randomUUID()}.enc`;
		const aad = `${context.officeId}:${entityId}:v1`;
		const sealed = sealSecret(Buffer.from(JSON.stringify({ pfx: bytes.toString("base64"), password })), aad);
		stored = reference;
		const upload = await db.storage.from("nfse-custody").upload(reference, Buffer.from(sealed), {
			contentType: "application/octet-stream", upsert: false,
		});
		if (upload.error) throw new Error(upload.error.message);
		const activated = await db.rpc("activate_self_registered_identity_certificate", {
			p_office: context.officeId, p_user: context.userId, p_provider: "supabase-encrypted",
			p_reference: reference, p_key_version: "v1", p_fingerprint: parsed.fingerprint,
			p_subject_tax_id: account.data.login_tax_id,
			p_not_before: parsed.cert.validity.notBefore.toISOString(), p_not_after: parsed.cert.validity.notAfter.toISOString(),
		});
		if (activated.error) throw new Error(activated.error.message);
		stored = "";
		const offer = await db.from("offer_interests").select("offer").eq("office_id", context.officeId)
			.order("created_at", { ascending: false }).limit(1).maybeSingle();
		if (offer.error) throw new Error(offer.error.message);
		const ready = offer.data?.offer === "documentos";
		return Response.json({ verified: true, ready, certificateId: activated.data, notAfter: parsed.cert.validity.notAfter.toISOString() }, { status: 201 });
	} catch (error) {
		if (stored) await supabaseAdmin().storage.from("nfse-custody").remove([stored]).catch(() => undefined);
		if (error instanceof CertificateInputError) return Response.json({ error: error.message }, { status: 400 });
		return authError(error);
	}
}
