import { createHash } from "node:crypto";
import { requireAppContext, authError } from "@/lib/auth-context";
import { invoiceInput } from "@/lib/nfse/contracts";
import { supabaseAdmin } from "@/lib/supabase-server";
export async function GET(request: Request) {
	try {
		const c = await requireAppContext(request, "nfse"),
			u = new URL(request.url),
			page = Math.max(1, Number(u.searchParams.get("page") || 1)),
			size = Math.min(
				50,
				Math.max(1, Number(u.searchParams.get("size") || 20)),
			);
		let q = supabaseAdmin()
			.from("nfse_invoices")
			.select(
				"id,issuer_id,status,competence,amount,description,dps_id,official_key,created_at",
				{ count: "exact" },
			)
			.eq("office_id", c.officeId);
		if (c.issuerScope)
			q = q.in(
				"issuer_id",
				c.issuerScope.length
					? c.issuerScope
					: ["00000000-0000-0000-0000-000000000000"],
			);
		const r = await q
			.order("created_at", { ascending: false })
			.range((page - 1) * size, page * size - 1);
		if (r.error) throw new Error(r.error.message);
		return Response.json({ items: r.data, total: r.count, page, size });
	} catch (e) {
		return authError(e);
	}
}
export async function POST(request: Request) {
	try {
		const c = await requireAppContext(request, "nfse"),
			p = invoiceInput.safeParse(await request.json());
		if (!p.success)
			return Response.json(
				{ error: "Dados inválidos.", issues: p.error.issues },
				{ status: 400 },
			);
		const x = p.data;
		if (c.issuerScope && !c.issuerScope.includes(x.issuerId))
			return Response.json(
				{ error: "Emitente fora do escopo." },
				{ status: 403 },
			);
		const hash = createHash("sha256").update(JSON.stringify(x)).digest("hex"),
			db = supabaseAdmin(),
			prior = await db
				.from("nfse_invoices")
				.select("id,content_hash")
				.eq("office_id", c.officeId)
				.eq("issuer_id", x.issuerId)
				.eq("environment", 2)
				.eq("idempotency_key", x.idempotencyKey)
				.maybeSingle();
		if (prior.error) throw new Error(prior.error.message);
		if (prior.data)
			return prior.data.content_hash === hash
				? Response.json({ id: prior.data.id, replayed: true })
				: Response.json(
						{ error: "Chave idempotente reutilizada com dados diferentes." },
						{ status: 409 },
					);
		const r = await db
			.from("nfse_invoices")
			.insert({
				office_id: c.officeId,
				issuer_id: x.issuerId,
				taker_id: x.takerId,
				service_profile_id: x.serviceProfileId,
				environment: 2,
				competence: x.competence,
				amount: x.amount,
				description: x.description,
				idempotency_key: x.idempotencyKey,
				content_hash: hash,
				created_by: c.userId,
			})
			.select("id,status")
			.single();
		if (r.error) throw new Error(r.error.message);
		return Response.json(r.data, { status: 201 });
	} catch (e) {
		return authError(e);
	}
}
