import { z } from "zod";
import { authError, requireAppContext } from "@/lib/auth-context";
import { localMode, localQuery } from "@/lib/local-db";
import { supabaseAdmin } from "@/lib/supabase-server";

const input = z.object({ taxId: z.string().transform((value) => value.replace(/\D/g, "")).pipe(z.string().regex(/^\d{11}(\d{3})?$/)) }).strict();

export async function PUT(request: Request) {
	try {
		const context = await requireAppContext(request, undefined, ["admin"]);
		const parsed = input.safeParse(await request.json());
		if (!parsed.success) return Response.json({ error: "Informe um CPF ou CNPJ válido." }, { status: 400 });
		const taxId = parsed.data.taxId;
		if (localMode()) {
			const cert = await localQuery("select 1 from nfse_certificates where office_id=$1 and subject_tax_id=$2 and status='active' and not_after>now() limit 1", [context.officeId, taxId]);
			if (!cert.rows[0]) return Response.json({ error: "O CPF/CNPJ precisa corresponder a um certificado ativo do escritório." }, { status: 409 });
			await localQuery(`insert into helians_accounts(auth_user_id,login_tax_id,account_type,status,activated_at) values($1,$2,'office','active',now()) on conflict(auth_user_id) do update set login_tax_id=excluded.login_tax_id,status='active',updated_at=now()`, [context.userId, taxId]);
			return Response.json({ updated: true, loginTaxId: taxId });
		}
		const db = supabaseAdmin();
		const cert = await db.from("nfse_certificates").select("id").eq("office_id", context.officeId).eq("subject_tax_id", taxId).eq("status", "active").gt("not_after", new Date().toISOString()).limit(1).maybeSingle();
		if (cert.error) throw new Error(cert.error.message);
		if (!cert.data) return Response.json({ error: "O CPF/CNPJ precisa corresponder a um certificado ativo do escritório." }, { status: 409 });
		const user = await db.auth.admin.getUserById(context.userId);
		const saved = await db.from("helians_accounts").upsert({ auth_user_id: context.userId, login_tax_id: taxId, account_type: "office", recovery_email: user.data.user?.email || null, status: "active", activated_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "auth_user_id" });
		if (saved.error) throw new Error(saved.error.message);
		return Response.json({ updated: true, loginTaxId: taxId });
	} catch (error) { return authError(error); }
}
