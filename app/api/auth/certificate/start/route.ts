import { randomBytes } from "node:crypto";
import { sessionToken } from "@/lib/auth-context";
import { hashCertificateToken } from "@/lib/certificate-auth";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function POST(request: Request) {
	try {
		const gateway = process.env.CERT_AUTH_URL;
		if (!gateway) return Response.json({ error: "Login com certificado ainda não configurado." }, { status: 503 });
		const destination = new URL(gateway);
		if (process.env.NODE_ENV === "production" && destination.protocol !== "https:")
			return Response.json({ error: "Gateway de certificado configurado de forma insegura." }, { status: 503 });
		const db = supabaseAdmin();
		const token = sessionToken(request);
		let requestedBy: string | null = null;
		if (token) {
			const user = await db.auth.getUser(token);
			if (user.error || !user.data.user?.email_confirmed_at)
				return Response.json({ error: "Sua sessão expirou. Entre novamente antes de validar a empresa." }, { status: 401 });
			requestedBy = user.data.user.id;
		}
		const state = randomBytes(32).toString("base64url");
		const saved = await db.from("certificate_auth_challenges").insert({
			token_hash: hashCertificateToken(state),
			requested_by: requestedBy,
			expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
		});
		if (saved.error) throw new Error(saved.error.message);
		destination.searchParams.set("state", state);
		return Response.json({ url: destination.toString() }, { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		console.error("Falha ao iniciar autenticação por certificado", error);
		return Response.json({ error: "Não foi possível iniciar o acesso com certificado." }, { status: 500 });
	}
}
