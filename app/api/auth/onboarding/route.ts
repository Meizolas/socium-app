import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { sessionToken } from "@/lib/auth-context";

const input = z.object({
	name: z.string().trim().min(2).max(120),
	officeName: z.string().trim().min(2).max(200),
	offer: z.enum(["documentos", "nfse", "completo"]),
	idempotencyKey: z.string().uuid(),
}).strict();

export async function POST(request: Request) {
	try {
		const token = sessionToken(request);
		if (!token) return Response.json({ error: "Autenticação necessária." }, { status: 401 });
		const parsed = input.safeParse(await request.json());
		if (!parsed.success)
			return Response.json({ error: "Informe seu nome, a empresa e o produto de interesse." }, { status: 400 });
		const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
		const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
		if (!url || !anon) return Response.json({ error: "Autenticação indisponível." }, { status: 503 });
		const db = createClient(url, anon, {
			global: { headers: { Authorization: `Bearer ${token}` } },
			auth: { persistSession: false, autoRefreshToken: false },
		});
		const { data: { user }, error: userError } = await db.auth.getUser(token);
		if (userError || !user?.email_confirmed_at)
			return Response.json({ error: "Sessão inválida ou e-mail ainda não confirmado." }, { status: 401 });
		const value = parsed.data;
		const account = await db.from("helians_accounts").select("login_tax_id,status").eq("auth_user_id", user.id).maybeSingle();
		if (account.error || !account.data || account.data.status !== "active")
			return Response.json({ error: "O CPF/CNPJ da conta ainda não foi confirmado." }, { status: 403 });
		const result = await db.rpc("complete_public_onboarding", {
			p_name: value.name,
			p_office_name: value.officeName,
			p_tax_id: account.data.login_tax_id,
			p_offer: value.offer,
			p_key: value.idempotencyKey,
		});
		if (result.error) {
			if (result.error.message.includes("membership_already_exists"))
				return Response.json({ error: "Esta conta já concluiu o primeiro acesso." }, { status: 409 });
			if (result.error.message.includes("legal_entity_already_claimed"))
				return Response.json({ error: "Esta empresa já possui uma conta principal. Solicite um convite ao administrador dela." }, { status: 409 });
			if (result.error.message.includes("invalid_onboarding"))
				return Response.json({ error: "Os dados do primeiro acesso são inválidos." }, { status: 400 });
			throw new Error(result.error.message);
		}
		return Response.json({ officeId: result.data, status: "pending_identity_verification" }, { status: 201 });
	} catch (error) {
		console.error("Falha no primeiro acesso", error);
		return Response.json({ error: "Não foi possível concluir o primeiro acesso." }, { status: 500 });
	}
}
