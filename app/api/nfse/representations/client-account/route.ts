import { z } from "zod";
import { authError, requireAppContext, requireIssuer } from "@/lib/auth-context";
import { localMode } from "@/lib/local-db";
import { supabaseAdmin } from "@/lib/supabase-server";

const input = z.object({
	issuerId: z.string().uuid(),
	name: z.string().trim().min(2).max(120),
	password: z.string().min(8).max(128),
	recoveryEmail: z.string().email().nullable().optional(),
}).strict();

export async function POST(request: Request) {
	let createdUserId: string | null = null;
	try {
		const context = await requireAppContext(request, "nfse", ["admin"]);
		if (localMode()) return Response.json({ error: "Criação de contas deve ser testada no ambiente integrado." }, { status: 501 });
		const parsed = input.safeParse(await request.json());
		if (!parsed.success) return Response.json({ error: "Nome, senha ou e-mail inválido." }, { status: 400 });
		const value = parsed.data;
		requireIssuer(context, value.issuerId);
		const db = supabaseAdmin();
		const issuer = await db.from("nfse_issuers").select("id,tax_id,legal_name").eq("id", value.issuerId).eq("office_id", context.officeId).maybeSingle();
		if (issuer.error) throw new Error(issuer.error.message);
		if (!issuer.data) return Response.json({ error: "Empresa representada não encontrada." }, { status: 404 });
		const representation = await db.from("nfse_representations").select("id").eq("office_id", context.officeId).eq("issuer_id", value.issuerId).eq("status", "active").eq("allow_client_issuance", true).lte("valid_from", new Date().toISOString()).or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`).limit(1).maybeSingle();
		if (representation.error) throw new Error(representation.error.message);
		if (!representation.data) return Response.json({ error: "Ative a representação e autorize a emissão pelo cliente antes de criar o acesso." }, { status: 409 });
		const taxId = String(issuer.data.tax_id).replace(/\D/g, "");
		const existing = await db.from("helians_accounts").select("auth_user_id,status").eq("login_tax_id", taxId).maybeSingle();
		if (existing.data) return Response.json({ error: "Este CNPJ já possui uma conta de acesso." }, { status: 409 });
		const internalEmail = value.recoveryEmail || `account-${taxId}@auth.helians.invalid`;
		const user = await db.auth.admin.createUser({ email: internalEmail, password: value.password, email_confirm: true, user_metadata: { name: value.name, account_type: "client" } });
		if (user.error || !user.data.user) throw new Error(user.error?.message || "Falha ao criar credencial.");
		createdUserId = user.data.user.id;
		const profile = await db.from("profiles").insert({ id: createdUserId, office_id: context.officeId, name: value.name, role: "client", onboarding_step: "ready" });
		if (profile.error) throw new Error(profile.error.message);
		const account = await db.from("helians_accounts").insert({ auth_user_id: createdUserId, login_tax_id: taxId, account_type: "client", issuer_id: value.issuerId, recovery_email: value.recoveryEmail || null, status: "active", activated_at: new Date().toISOString(), created_by: context.userId });
		if (account.error) throw new Error(account.error.message);
		const access = await db.from("nfse_profile_issuer_access").insert({ profile_id: createdUserId, issuer_id: value.issuerId, allowed: true });
		if (access.error) throw new Error(access.error.message);
		const modules = await db.from("profile_module_access").upsert([
			{ profile_id: createdUserId, module: "documentos", allowed: false, created_by: context.userId },
			{ profile_id: createdUserId, module: "nfse", allowed: true, created_by: context.userId },
		], { onConflict: "profile_id,module" });
		if (modules.error) throw new Error(modules.error.message);
		return Response.json({ created: true, loginTaxId: taxId, issuerId: value.issuerId }, { status: 201 });
	} catch (error) {
		if (createdUserId) await supabaseAdmin().auth.admin.deleteUser(createdUserId).catch(() => undefined);
		return authError(error);
	}
}
