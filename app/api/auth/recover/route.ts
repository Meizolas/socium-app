import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isValidTaxId, normalizeTaxId } from "@/lib/br-tax-id";
import { supabaseAdmin } from "@/lib/supabase-server";

const input = z.object({ identifier: z.string().trim().min(3).max(254) }).strict();
const generic = { message: "Se o identificador estiver cadastrado, enviaremos as instruções de recuperação." };

export async function POST(request: Request) {
	try {
		const parsed = input.safeParse(await request.json());
		if (!parsed.success) return Response.json(generic, { status: 202 });
		const identifier = parsed.data.identifier.toLowerCase();
		let email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier) ? identifier : "";
		if (!email) {
			const taxId = normalizeTaxId(identifier);
			if (!isValidTaxId(taxId)) return Response.json(generic, { status: 202 });
			const account = await supabaseAdmin().from("helians_accounts").select("recovery_email")
				.eq("login_tax_id", taxId).eq("status", "active").maybeSingle();
			email = account.data?.recovery_email || "";
		}
		const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
		if (!url || !anon) return Response.json({ error: "Autenticação indisponível." }, { status: 503 });
		if (email) {
			const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
			const app = (process.env.APP_URL || new URL(request.url).origin).replace(/\/$/, "");
			await auth.auth.resetPasswordForEmail(email, { redirectTo: `${app}/` });
		}
		return Response.json(generic, { status: 202 });
	} catch { return Response.json(generic, { status: 202 }); }
}
