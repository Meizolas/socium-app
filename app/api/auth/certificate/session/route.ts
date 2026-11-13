import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { z } from "zod";
import { hashCertificateToken } from "@/lib/certificate-auth";
import { supabaseAdmin } from "@/lib/supabase-server";

const input = z.object({ code: z.string().min(32).max(256) }).strict();

export async function POST(request: Request) {
	try {
		const parsed = input.safeParse(await request.json());
		if (!parsed.success) return Response.json({ error: "Código de certificado inválido." }, { status: 400 });
		const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
		const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
		if (!url || !anon) return Response.json({ error: "Autenticação indisponível." }, { status: 503 });
		const db = supabaseAdmin();
		const exchange = await db.rpc("consume_certificate_auth_exchange", { p_hash: hashCertificateToken(parsed.data.code) });
		if (exchange.error || !exchange.data)
			return Response.json({ error: "O acesso por certificado expirou. Tente novamente." }, { status: 401 });
		const user = await db.auth.admin.getUserById(exchange.data as string);
		const email = user.data.user?.email;
		if (user.error || !email) throw new Error(user.error?.message || "certificate_user_not_found");
		const link = await db.auth.admin.generateLink({ type: "magiclink", email });
		const tokenHash = link.data.properties?.hashed_token;
		if (link.error || !tokenHash) throw new Error(link.error?.message || "certificate_session_link_failed");
		const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
		const verified = await auth.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
		if (verified.error || !verified.data.session) throw new Error(verified.error?.message || "certificate_session_failed");
		const jar = await cookies();
		const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
		jar.set("socium_session", verified.data.session.access_token, { ...options, maxAge: verified.data.session.expires_in });
		jar.set("socium_refresh", verified.data.session.refresh_token, { ...options, maxAge: 30 * 24 * 60 * 60 });
		return Response.json({ authenticated: true });
	} catch (error) {
		console.error("Falha ao criar sessão do certificado", error);
		return Response.json({ error: "Não foi possível concluir o acesso por certificado." }, { status: 500 });
	}
}
