import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { z } from "zod";
import { isValidTaxId, normalizeTaxId } from "@/lib/br-tax-id";
import { supabaseAdmin } from "@/lib/supabase-server";

const input = z.object({
	email: z.string().trim().email().max(254),
	password: z.string().min(8).max(128),
	name: z.string().trim().min(2).max(120),
	taxId: z.string().transform(normalizeTaxId).refine(isValidTaxId),
}).strict();

const genericMessage = "Confira seu e-mail para confirmar o cadastro e continuar.";

export async function POST(request: Request) {
	try {
		const parsed = input.safeParse(await request.json());
		if (!parsed.success)
			return Response.json({ error: "Revise nome, CPF/CNPJ, e-mail e senha. A senha deve ter pelo menos 8 caracteres." }, { status: 400 });
		const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
		const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
		if (!url || !anon) return Response.json({ error: "Autenticação indisponível." }, { status: 503 });
		const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
		const appUrl = (process.env.APP_URL || new URL(request.url).origin).replace(/\/$/, "");
		const result = await auth.auth.signUp({
			email: parsed.data.email,
			password: parsed.data.password,
			options: { data: { name: parsed.data.name }, emailRedirectTo: appUrl },
		});
		if (result.error) {
			if (result.error.message.toLowerCase().includes("password"))
				return Response.json({ error: "A senha não atende aos requisitos de segurança." }, { status: 400 });
			return Response.json({ message: genericMessage }, { status: 202 });
		}
		const user = result.data.user;
		if (!user || !user.identities?.length) return Response.json({ message: genericMessage }, { status: 202 });
		const account = await supabaseAdmin().from("helians_accounts").insert({
			auth_user_id: user.id, login_tax_id: parsed.data.taxId, account_type: "office",
			recovery_email: parsed.data.email, status: result.data.session ? "active" : "invited",
			activated_at: result.data.session ? new Date().toISOString() : null,
		});
		if (account.error) {
			await supabaseAdmin().auth.admin.deleteUser(user.id).catch(() => undefined);
			return Response.json({ message: genericMessage }, { status: 202 });
		}
		if (result.data.session) {
			const jar = await cookies();
			const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
			jar.set("socium_session", result.data.session.access_token, { ...options, maxAge: result.data.session.expires_in });
			jar.set("socium_refresh", result.data.session.refresh_token, { ...options, maxAge: 30 * 24 * 60 * 60 });
			return Response.json({ authenticated: true, message: "Cadastro criado." }, { status: 201 });
		}
		return Response.json({ authenticated: false, message: genericMessage }, { status: 202 });
	} catch {
		return Response.json({ message: genericMessage }, { status: 202 });
	}
}
