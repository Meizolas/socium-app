import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { z } from "zod";

const input = z.object({
	accessToken: z.string().min(20).max(8192),
	refreshToken: z.string().min(20).max(8192),
}).strict();

export async function POST(request: Request) {
	try {
		const parsed = input.safeParse(await request.json());
		if (!parsed.success) return Response.json({ error: "Confirmação inválida." }, { status: 400 });
		const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
		const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
		if (!url || !anon) return Response.json({ error: "Autenticação indisponível." }, { status: 503 });
		const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
		const result = await auth.auth.setSession({ access_token: parsed.data.accessToken, refresh_token: parsed.data.refreshToken });
		if (result.error || !result.data.user?.email_confirmed_at || !result.data.session)
			return Response.json({ error: "O link de confirmação é inválido ou expirou." }, { status: 401 });
		const jar = await cookies();
		const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
		jar.set("socium_session", result.data.session.access_token, { ...options, maxAge: result.data.session.expires_in });
		jar.set("socium_refresh", result.data.session.refresh_token, { ...options, maxAge: 30 * 24 * 60 * 60 });
		return Response.json({ authenticated: true });
	} catch {
		return Response.json({ error: "Não foi possível confirmar o cadastro." }, { status: 400 });
	}
}
