import { randomBytes, randomUUID } from "node:crypto";
import { hashCertificateToken, parseGatewayCertificate, trustedCertificateGateway } from "@/lib/certificate-auth";
import { supabaseAdmin } from "@/lib/supabase-server";

function appUrl() {
	const configured = process.env.APP_URL;
	if (!configured) throw new Error("APP_URL_not_configured");
	return new URL(configured);
}

function failure(code: string) {
	if (!process.env.APP_URL) return Response.json({ error: "APP_URL não configurada." }, { status: 500 });
	const destination = appUrl();
	destination.searchParams.set("certificate_error", code);
	return Response.redirect(destination, 303);
}

export async function GET(request: Request) {
	let createdUserId = "";
	try {
		if (!trustedCertificateGateway(request)) return Response.json({ error: "Gateway não autorizado." }, { status: 403 });
		const destination = appUrl();
		const state = new URL(request.url).searchParams.get("state") || "";
		if (state.length < 32 || state.length > 256) return failure("invalid_challenge");
		const certificate = parseGatewayCertificate(request);
		const db = supabaseAdmin();
		const challenge = await db.rpc("consume_certificate_auth_challenge", { p_hash: hashCertificateToken(state) });
		if (challenge.error) return failure("expired_challenge");
		const requestedBy = challenge.data as string | null;
		let authUserId = requestedBy || "";
		if (!authUserId) {
			const entity = await db.from("legal_entities").select("id").eq("tax_id", certificate.taxId).maybeSingle();
			if (entity.error) throw new Error(entity.error.message);
			if (entity.data) {
				const binding = await db.from("certificate_auth_bindings").select("auth_user_id").eq("legal_entity_id", entity.data.id).maybeSingle();
				if (binding.error) throw new Error(binding.error.message);
				authUserId = binding.data?.auth_user_id || "";
			}
			if (!authUserId) {
				const account = await db.from("helians_accounts").select("auth_user_id").eq("login_tax_id", certificate.taxId).eq("status", "active").maybeSingle();
				if (account.error) throw new Error(account.error.message);
				authUserId = account.data?.auth_user_id || "";
			}
			if (!authUserId) {
				const created = await db.auth.admin.createUser({
					email: `certificate-${randomUUID()}@auth.helians.invalid`,
					password: randomBytes(48).toString("base64url"),
					email_confirm: true,
					user_metadata: { name: certificate.canonicalName, account_type: "certificate" },
				});
				if (created.error || !created.data.user) throw new Error(created.error?.message || "certificate_user_creation_failed");
				authUserId = created.data.user.id;
				createdUserId = authUserId;
			}
		}
		const exchange = randomBytes(32).toString("base64url");
		const activation = await db.rpc("activate_certificate_identity", {
			p_auth_user: authUserId,
			p_requested_by: requestedBy,
			p_tax_id: certificate.taxId,
			p_canonical_name: certificate.canonicalName,
			p_fingerprint: certificate.fingerprint,
			p_serial: certificate.serial,
			p_subject: certificate.subject,
			p_not_before: certificate.notBefore,
			p_not_after: certificate.notAfter,
			p_exchange_hash: hashCertificateToken(exchange),
		});
		if (activation.error) throw new Error(activation.error.message);
		destination.searchParams.set("certificate_code", exchange);
		return Response.redirect(destination, 303);
	} catch (error) {
		console.error("Falha na autenticação mTLS", error);
		if (createdUserId) await supabaseAdmin().auth.admin.deleteUser(createdUserId).catch(() => undefined);
		return failure("certificate_validation_failed");
	}
}
