import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase-server";

const input = z.object({
	tokenHash: z.string().min(20).max(512).regex(/^[A-Za-z0-9._~-]+$/),
	type: z.enum(["email", "signup", "recovery"]),
}).strict();

export async function POST(request: Request) {
	try {
		const parsed = input.safeParse(await request.json());
		if (!parsed.success) return Response.json({ error: "Link inválido." }, { status: 400 });
		const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
		const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
		if (!url || !anon) return Response.json({ error: "Autenticação indisponível." }, { status: 503 });
		const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
		const verificationType = parsed.data.type === "recovery" ? "recovery" : "email";
		const result = await auth.auth.verifyOtp({ token_hash: parsed.data.tokenHash, type: verificationType });
		if (result.error || !result.data.user || !result.data.session) {
			if (result.error) console.error("Falha ao validar ação de e-mail do Supabase Auth:", result.error.message);
			return Response.json({ error: "Este link é inválido, já foi utilizado ou expirou." }, { status: 401 });
		}
		if (verificationType === "recovery") return Response.json({
			accessToken: result.data.session.access_token,
			refreshToken: result.data.session.refresh_token,
		});
		const activated = await supabaseAdmin().from("helians_accounts").update({
			status: "active", activated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
		}).eq("auth_user_id", result.data.user.id).eq("status", "invited");
		if (activated.error) return Response.json({ error: "Não foi possível ativar sua conta." }, { status: 500 });
		const jar = await cookies();
		const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
		jar.set("socium_session", result.data.session.access_token, { ...options, maxAge: result.data.session.expires_in });
		jar.set("socium_refresh", result.data.session.refresh_token, { ...options, maxAge: 30 * 24 * 60 * 60 });
		return Response.json({ authenticated: true });
	} catch {
		return Response.json({ error: "Não foi possível validar o link." }, { status: 400 });
	}
}
