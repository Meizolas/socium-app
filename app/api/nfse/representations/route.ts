import { z } from "zod";
import { authError, requireAppContext, requireIssuer } from "@/lib/auth-context";
import { localMode, localQuery, localTransaction } from "@/lib/local-db";
import { supabaseAdmin } from "@/lib/supabase-server";

const input = z.object({
	issuerId: z.string().uuid(),
	certificateId: z.string().uuid(),
	authorizationType: z.enum(["electronic_power_of_attorney", "legal_representative"]).default("electronic_power_of_attorney"),
	allowClientIssuance: z.boolean().default(false),
	allowCancellation: z.boolean().default(false),
	validUntil: z.string().datetime().nullable().optional(),
}).strict();

export async function GET(request: Request) {
	try {
		const context = await requireAppContext(request, "nfse", ["admin", "operator"]);
		if (localMode()) {
			const result = await localQuery(
				`select r.*,i.tax_id,i.legal_name,c.subject_tax_id,c.not_after
				 from nfse_representations r join nfse_issuers i on i.id=r.issuer_id
				 join nfse_certificates c on c.id=r.certificate_id
				 where r.office_id=$1 order by r.updated_at desc`, [context.officeId]);
			return Response.json({ representations: result.rows });
		}
		const db = supabaseAdmin();
		const result = await db.from("nfse_representations")
			.select("*,nfse_issuers!inner(tax_id,legal_name),nfse_certificates!inner(subject_tax_id,not_after)")
			.eq("office_id", context.officeId).order("updated_at", { ascending: false });
		if (result.error) throw new Error(result.error.message);
		return Response.json({ representations: result.data });
	} catch (error) { return authError(error); }
}

export async function POST(request: Request) {
	try {
		const context = await requireAppContext(request, "nfse", ["admin"]);
		const parsed = input.safeParse(await request.json());
		if (!parsed.success) return Response.json({ error: "Dados da representação inválidos." }, { status: 400 });
		const value = parsed.data;
		requireIssuer(context, value.issuerId);
		if (localMode()) {
			const result = await localTransaction(async (db) => {
				const certificate = await db.query(
					"select id,subject_tax_id from nfse_certificates where id=$1 and office_id=$2 and status='active' and not_before<=now() and not_after>now()",
					[value.certificateId, context.officeId]);
				if (!certificate.rows[0]) throw Object.assign(new Error("Certificado do representante não está ativo."), { status: 409 });
				const issuer = await db.query("select tax_id from nfse_issuers where id=$1 and office_id=$2", [value.issuerId, context.officeId]);
				if (String(issuer.rows[0]?.tax_id || "").replace(/\D/g, "") === String(certificate.rows[0].subject_tax_id || "").replace(/\D/g, ""))
					throw Object.assign(new Error("Esta empresa usa certificado próprio e não precisa de representação."), { status: 409 });
				const current = await db.query<{ id: string }>("select id from nfse_representations where issuer_id=$1 and representative_profile_id=$2 and status in ('pending','active') limit 1", [value.issuerId, context.userId]);
				if (current.rows[0]) {
					await db.query("update nfse_representations set certificate_id=$2,authorization_type=$3,status='active',allow_client_issuance=$4,allow_cancellation=$5,valid_until=$6,updated_at=now() where id=$1", [current.rows[0].id, value.certificateId, value.authorizationType, value.allowClientIssuance, value.allowCancellation, value.validUntil || null]);
					return current.rows[0];
				}
				const saved = await db.query<{ id: string }>(
					`insert into nfse_representations(office_id,issuer_id,representative_profile_id,certificate_id,authorization_type,status,allow_client_issuance,allow_cancellation,valid_until,created_by)
					 values($1,$2,$3,$4,$5,'active',$6,$7,$8,$3) returning id`,
					[context.officeId, value.issuerId, context.userId, value.certificateId, value.authorizationType, value.allowClientIssuance, value.allowCancellation, value.validUntil || null]);
				await db.query("insert into nfse_representation_audit(office_id,representation_id,issuer_id,actor_id,action) values($1,$2,$3,$4,'created')", [context.officeId, saved.rows[0].id, value.issuerId, context.userId]);
				return saved.rows[0];
			});
			return Response.json(result, { status: 201 });
		}
		const db = supabaseAdmin();
		const [issuer, certificate] = await Promise.all([
			db.from("nfse_issuers").select("id,tax_id").eq("id", value.issuerId).eq("office_id", context.officeId).maybeSingle(),
			db.from("nfse_certificates").select("id,subject_tax_id").eq("id", value.certificateId).eq("office_id", context.officeId).eq("status", "active").lte("not_before", new Date().toISOString()).gt("not_after", new Date().toISOString()).maybeSingle(),
		]);
		if (!issuer.data) return Response.json({ error: "Empresa representada não encontrada." }, { status: 404 });
		if (!certificate.data) return Response.json({ error: "Certificado do representante não está ativo." }, { status: 409 });
		if (String(issuer.data.tax_id || "").replace(/\D/g, "") === String(certificate.data.subject_tax_id || "").replace(/\D/g, ""))
			return Response.json({ error: "Esta empresa usa certificado próprio e não precisa de representação." }, { status: 409 });
		const current = await db.from("nfse_representations").select("id").eq("issuer_id", value.issuerId).eq("representative_profile_id", context.userId).in("status", ["pending", "active"]).limit(1).maybeSingle();
		if (current.error) throw new Error(current.error.message);
		if (current.data) {
			const updated = await db.from("nfse_representations").update({ certificate_id: value.certificateId, authorization_type: value.authorizationType, status: "active", allow_client_issuance: value.allowClientIssuance, allow_cancellation: value.allowCancellation, valid_until: value.validUntil || null, updated_at: new Date().toISOString() }).eq("id", current.data.id).select("id").single();
			if (updated.error) throw new Error(updated.error.message);
			return Response.json(updated.data);
		}
		const saved = await db.from("nfse_representations").insert({
			office_id: context.officeId, issuer_id: value.issuerId, representative_profile_id: context.userId,
			certificate_id: value.certificateId, authorization_type: value.authorizationType, status: "active",
			allow_client_issuance: value.allowClientIssuance, allow_cancellation: value.allowCancellation,
			valid_until: value.validUntil || null, created_by: context.userId,
		}).select("id").single();
		if (saved.error) throw new Error(saved.error.message);
		await db.from("nfse_representation_audit").insert({ office_id: context.officeId, representation_id: saved.data.id, issuer_id: value.issuerId, actor_id: context.userId, action: "created" });
		return Response.json(saved.data, { status: 201 });
	} catch (error) { return authError(error); }
}
