import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { localMode, localQuery } from "@/lib/local-db";
import { createLocalSession, localCookie } from "@/lib/local-session";
import { supabaseAdmin } from "@/lib/supabase-server";

const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
const validTaxId = (value: string) => value.length === 11 || value.length === 14;

export async function POST(request: Request) {
	try {
		const body = await request.json();
		const identifier = String(body.identifier || body.taxId || body.email || "").trim();
		const password = String(body.password || "");
		const taxId = digits(identifier);
		if ((!validTaxId(taxId) && !identifier.includes("@")) || !password)
			return Response.json({ error: "CPF/CNPJ ou senha inválidos." }, { status: 401 });

		if (localMode()) {
			const found = validTaxId(taxId)
				? await localQuery<{ id: string }>(
						`select u.id from helians_accounts h join auth.users u on u.id=h.auth_user_id
						 where h.login_tax_id=$1 and h.status='active'
						 and u.encrypted_password=crypt($2,u.encrypted_password)`,
						[taxId, password],
					)
				: await localQuery<{ id: string }>(
						"select id from auth.users where lower(email)=lower($1) and encrypted_password=crypt($2,encrypted_password)",
						[identifier, password],
					);
			if (!found.rows[0]) return Response.json({ error: "CPF/CNPJ ou senha inválidos." }, { status: 401 });
			(await cookies()).set(localCookie.name, createLocalSession(found.rows[0].id), localCookie.options);
			return Response.json({ authenticated: true, localSimulation: true });
		}

		const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
		const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
		if (!url || !anon) return Response.json({ error: "Autenticação indisponível." }, { status: 503 });
		let email = identifier;
		if (validTaxId(taxId)) {
			const db = supabaseAdmin();
			const account = await db.from("helians_accounts").select("auth_user_id").eq("login_tax_id", taxId).eq("status", "active").maybeSingle();
			if (account.error || !account.data) return Response.json({ error: "CPF/CNPJ ou senha inválidos." }, { status: 401 });
			const user = await db.auth.admin.getUserById(account.data.auth_user_id);
			email = user.data.user?.email || "";
			if (!email) return Response.json({ error: "CPF/CNPJ ou senha inválidos." }, { status: 401 });
		}
		const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
		const result = await auth.auth.signInWithPassword({ email, password });
		if (result.error || !result.data.session) return Response.json({ error: "CPF/CNPJ ou senha inválidos." }, { status: 401 });
		const jar = await cookies();
		const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
		jar.set("socium_session", result.data.session.access_token, { ...options, maxAge: result.data.session.expires_in });
		jar.set("socium_refresh", result.data.session.refresh_token, { ...options, maxAge: 30 * 24 * 60 * 60 });
		return Response.json({ authenticated: true });
	} catch (error) {
		console.error("Falha ao autenticar", error);
		return Response.json({ error: "Não foi possível entrar." }, { status: 400 });
	}
}
