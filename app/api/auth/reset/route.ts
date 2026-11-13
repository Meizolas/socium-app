import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const input = z.object({
	accessToken: z.string().min(20).max(8192),
	refreshToken: z.string().min(20).max(8192),
	password: z.string().min(8).max(128),
}).strict();

export async function POST(request: Request) {
	try {
		const parsed = input.safeParse(await request.json());
		if (!parsed.success) return Response.json({ error: "Solicitação de recuperação inválida." }, { status: 400 });
		const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
		const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
		if (!url || !anon) return Response.json({ error: "Autenticação indisponível." }, { status: 503 });
		const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
		const session = await auth.auth.setSession({
			access_token: parsed.data.accessToken,
			refresh_token: parsed.data.refreshToken,
		});
		if (session.error || !session.data.user) return Response.json({ error: "O link de recuperação é inválido ou expirou." }, { status: 401 });
		const updated = await auth.auth.updateUser({ password: parsed.data.password });
		if (updated.error) return Response.json({ error: "Não foi possível alterar a senha. Solicite um novo link." }, { status: 400 });
		await auth.auth.signOut();
		return Response.json({ message: "Senha alterada. Entre com sua nova senha." });
	} catch {
		return Response.json({ error: "Não foi possível alterar a senha." }, { status: 400 });
	}
}
