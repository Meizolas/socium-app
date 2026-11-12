import { z } from "zod";
import {
	requireAppContext,
	requireIssuer,
	authError,
	AuthError,
} from "@/lib/auth-context";
import { localMode, localQuery, localTransaction } from "@/lib/local-db";
import { supabaseAdmin } from "@/lib/supabase-server";
import { createHash } from "node:crypto";
const taxId = z.preprocess(
	(value) => typeof value === "string" ? value.replace(/\D/g, "") : value,
	z.string().regex(/^\d{14}$/, "Informe um CNPJ com 14 dígitos."),
),
	uuid = z.string().uuid();
const actions = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("issuer"),
		taxId,
		legalName: z.string().trim().min(2, "Informe a razão social."),
		municipalityIbge: z.string().regex(/^\d{7}$/),
		taxRegime: z.string().min(2),
		simpleNationalOption: z.enum(["1","2","3"]),
		simpleNationalTaxationRegime: z.string().regex(/^[1-3]$/),
		specialTaxRegime: z.string().regex(/^\d$/),
		dpsSeries: z.string().regex(/^[A-Z0-9]{1,5}$/i),
	}),
	z.object({
		action: z.literal("service"),
		issuerId: uuid,
		name: z.string().min(2),
		nationalCode: z.string().min(1),
		description: z.string().min(3),
		municipalCode: z.string().max(20).optional(),
		nbsCode: z.string().max(20).optional(),
	}),
	z.object({
		action: z.literal("taker"),
		issuerId: uuid,
		taxId,
		legalName: z.string().trim().min(2, "Informe a razão social."),
		email: z.union([z.string().trim().toLowerCase().email("Informe um e-mail válido."), z.literal("")]),
	}),
	z.object({
		action: z.literal("draft"),
		issuerId: uuid,
		takerId: uuid,
		serviceProfileId: uuid,
		competence: z.string().date(),
		amount: z.string().regex(/^\d+\.\d{2}$/),
		description: z.string().min(3),
		idempotencyKey: z.string().uuid(),
		serviceMunicipalityIbge: z.string().regex(/^\d{7}$/),
		unconditionalDiscount: z.string().regex(/^\d+\.\d{2}$/),
		conditionalDiscount: z.string().regex(/^\d+\.\d{2}$/),
		issTaxation: z.enum(["taxable", "immune", "export", "not_incident"]),
		issWithholding: z.enum(["not_withheld", "withheld"]),
		issRate: z.string().max(5),
		additionalInformation: z.string().max(2000),
		serviceMunicipalityName: z.string().max(120).optional(),
		serviceMunicipalityUf: z.string().max(2).optional(),
		ibsCbsEnabled: z.boolean(),
		ibsCbsPurpose: z.string().max(2),
		ibsCbsOperationIndicator: z.string().max(10),
		ibsCbsDestinationIndicator: z.string().max(2),
		ibsCbsTaxSituation: z.string().max(3),
		ibsCbsClassification: z.string().max(10),
		ibsCbsBase: z.string().regex(/^\d+\.\d{2}$/),
		ibsUfRate: z.string().regex(/^\d+\.\d{2}$/),
		ibsMunicipalRate: z.string().regex(/^\d+\.\d{2}$/),
		cbsRate: z.string().regex(/^\d+\.\d{2}$/),
		ibsCredit: z.string().regex(/^\d+\.\d{2}$/),
		cbsCredit: z.string().regex(/^\d+\.\d{2}$/),
		irRetention: z.string().regex(/^\d+\.\d{2}$/),
		inssRetention: z.string().regex(/^\d+\.\d{2}$/),
		pisRetention: z.string().regex(/^\d+\.\d{2}$/),
		cofinsRetention: z.string().regex(/^\d+\.\d{2}$/),
		csllRetention: z.string().regex(/^\d+\.\d{2}$/),
	}),
]);
export async function GET(request: Request) {
	try {
		const c = await requireAppContext(request, "nfse");
		if (!localMode()) return remoteWorkspace(c);
		const
			[issuers, services, takers, invoices, certificates, representations] = await Promise.all([
				localQuery(
					"select id,tax_id,legal_name,enabled from nfse_issuers where office_id=$1 order by legal_name",
					[c.officeId],
				),
				localQuery(
					"select id,issuer_id,name,description,national_code,municipal_code,nbs_code,taxation,service_municipality_ibge,operation_indicator,tax_situation from nfse_service_profiles where office_id=$1 order by name",
					[c.officeId],
				),
				localQuery(
					"select id,issuer_id,tax_id,legal_name,email,address from nfse_takers where office_id=$1 order by legal_name",
					[c.officeId],
				),
				localQuery(
					"select id,issuer_id,taker_id,service_profile_id,status,competence,amount,description,official_key,simulation_reference,cancellation_status,cancelled_at,cancellation_reason,created_at from nfse_invoices where office_id=$1 order by created_at desc",
					[c.officeId],
				),
				localQuery(
					"select id,issuer_id,fingerprint_sha256,subject_tax_id,not_before,not_after,status from nfse_certificates where office_id=$1 order by created_at desc",
					[c.officeId],
				),
				localQuery(
					"select r.issuer_id,r.certificate_id,r.authorization_type,r.valid_until,r.allow_client_issuance,r.allow_cancellation,c.subject_tax_id,c.not_after from nfse_representations r join nfse_certificates c on c.id=r.certificate_id where r.office_id=$1 and r.status='active' and r.valid_from<=now() and (r.valid_until is null or r.valid_until>now()) and c.status='active' and c.not_before<=now() and c.not_after>now()",
					[c.officeId],
				),
			]),
			allowed = (issuerId: string) =>
				c.issuerScope === null || c.issuerScope.includes(issuerId);
		return Response.json({
			simulation: true,
			role: c.role,
			issuers: issuers.rows.filter((x) => allowed(String(x.id))),
			services: services.rows.filter((x) => allowed(String(x.issuer_id))),
			takers: takers.rows.filter((x) => allowed(String(x.issuer_id))),
			invoices: invoices.rows.filter((x) => allowed(String(x.issuer_id))),
			certificates: certificates.rows.filter((x) =>
				allowed(String(x.issuer_id)),
			),
			signingReadyIssuerIds: representations.rows.map((x) => String(x.issuer_id)).filter(allowed),
			representations: representations.rows.filter((x) => allowed(String(x.issuer_id))),
		});
	} catch (error) {
		return authError(error);
	}
}
export async function POST(request: Request) {
	try {
		const c = await requireAppContext(request, "nfse", ["admin", "operator", "client"]),
			parsed = actions.safeParse(await request.json());
		if (!parsed.success)
			return Response.json(
				{ error: parsed.error.issues[0]?.message || "Dados inválidos.", issues: parsed.error.issues },
				{ status: 400 },
			);
		const x = parsed.data;
		if (!localMode()) return remoteMutation(c, x);
		if (x.action === "issuer") {
			if (c.role !== "admin")
				return Response.json(
					{ error: "Papel sem permissão para esta operação." },
					{ status: 403 },
				);
			const r = await localQuery(
				"insert into nfse_issuers(office_id,tax_id,legal_name,municipality_ibge,tax_regime,dps_series,enabled,simple_national_option,simple_national_taxation_regime,special_tax_regime) values($1,$2,$3,$4,$5,$6,true,$7,$8,$9) returning id",
				[
					c.officeId,
					x.taxId,
					x.legalName,
					x.municipalityIbge,
					x.taxRegime,
					x.dpsSeries,
					x.simpleNationalOption,x.simpleNationalTaxationRegime,x.specialTaxRegime,
				],
			);
			return Response.json(r.rows[0], { status: 201 });
		}
		requireIssuer(c, x.issuerId);
		if (x.action === "service") {
			if (c.role !== "admin")
				return Response.json(
					{ error: "Papel sem permissão para esta operação." },
					{ status: 403 },
				);
			const r = await localQuery(
				"insert into nfse_service_profiles(office_id,issuer_id,name,national_code,municipal_code,nbs_code,description,valid_from,fiscal_reviewed_at) select $1,id,$3,$4,$5,$6,$7,current_date,now() from nfse_issuers where id=$2 and office_id=$1 returning id",
				[c.officeId, x.issuerId, x.name, x.nationalCode, x.municipalCode||null, x.nbsCode||null, x.description],
			);
			if (!r.rows[0])
				return Response.json(
					{ error: "Emitente não encontrado." },
					{ status: 404 },
				);
			return Response.json(r.rows[0], { status: 201 });
		}
		if (x.action === "taker") {
			if (c.role !== "admin" && c.role !== "client")
				return Response.json(
					{ error: "Papel sem permissão para esta operação." },
					{ status: 403 },
				);
			const r = await localQuery(
				"insert into nfse_takers(office_id,issuer_id,tax_id,legal_name,email) select $1,id,$3,$4,nullif($5,'') from nfse_issuers where id=$2 and office_id=$1 on conflict(issuer_id,tax_id) do update set legal_name=excluded.legal_name,email=excluded.email returning id",
				[c.officeId, x.issuerId, x.taxId, x.legalName, x.email],
			);
			if (!r.rows[0])
				return Response.json(
					{ error: "Emitente não encontrado." },
					{ status: 404 },
				);
			return Response.json(r.rows[0], { status: 201 });
		}
		const result = await localTransaction(async (db) => {
			const links = await db.query(
				"select i.id from nfse_issuers i join nfse_takers t on t.issuer_id=i.id and t.id=$3 join nfse_service_profiles s on s.issuer_id=i.id and s.id=$4 where i.id=$2 and i.office_id=$1",
				[c.officeId, x.issuerId, x.takerId, x.serviceProfileId],
			);
			if (!links.rows[0]) throw new Error("Cadastros fiscais fora do escopo.");
			const ibsCbs = { enabled:x.ibsCbsEnabled,purpose:x.ibsCbsPurpose,operationIndicator:x.ibsCbsOperationIndicator,destinationIndicator:x.ibsCbsDestinationIndicator,taxSituation:x.ibsCbsTaxSituation,classification:x.ibsCbsClassification,base:x.ibsCbsBase,ibsUfRate:x.ibsUfRate,ibsMunicipalRate:x.ibsMunicipalRate,cbsRate:x.cbsRate,ibsCredit:x.ibsCredit,cbsCredit:x.cbsCredit }, federalRetentions={ir:x.irRetention,inss:x.inssRetention,pis:x.pisRetention,cofins:x.cofinsRetention,csll:x.csllRetention};
			return db.query(
				"insert into nfse_invoices(office_id,issuer_id,taker_id,service_profile_id,competence,amount,description,idempotency_key,content_hash,created_by,unconditional_discount,conditional_discount,operation,taxation) values($1,$2,$3,$4,$5,$6,$7,$8,encode(digest($9,'sha256'),'hex'),$10,$11,$12,$13,$14) returning id,status",
				[
					c.officeId,
					x.issuerId,
					x.takerId,
					x.serviceProfileId,
					x.competence,
					x.amount,
					x.description,
					x.idempotencyKey,
					JSON.stringify(x),
					c.userId,
					x.unconditionalDiscount,x.conditionalDiscount,JSON.stringify({serviceMunicipalityIbge:x.serviceMunicipalityIbge,serviceMunicipalityName:x.serviceMunicipalityName,serviceMunicipalityUf:x.serviceMunicipalityUf,additionalInformation:x.additionalInformation}),JSON.stringify({issTaxation:x.issTaxation,issWithholding:x.issWithholding,issRate:x.issRate,ibsCbs,federalRetentions}),
				],
			);
		});
		return Response.json(result.rows[0], { status: 201 });
	} catch (error) {
		if (error instanceof AuthError) return authError(error);
		console.error("Falha na operação fiscal", error);
		return Response.json({ error: "Não foi possível concluir a operação. Tente novamente." }, { status: 500 });
	}
}

async function remoteWorkspace(c: Awaited<ReturnType<typeof requireAppContext>>) {
	const db = supabaseAdmin();
	let issuersQuery = db.from("nfse_issuers").select("id,tax_id,legal_name,enabled").eq("office_id", c.officeId).order("legal_name");
	let servicesQuery = db.from("nfse_service_profiles").select("id,issuer_id,name,description,national_code,municipal_code,nbs_code,taxation,service_municipality_ibge,operation_indicator,tax_situation").eq("office_id", c.officeId).order("name");
	let takersQuery = db.from("nfse_takers").select("id,issuer_id,tax_id,legal_name,email,address").eq("office_id", c.officeId).order("legal_name");
	let invoicesQuery = db.from("nfse_invoices").select("id,issuer_id,taker_id,service_profile_id,status,competence,amount,description,official_key,simulation_reference,cancellation_status,cancelled_at,cancellation_reason,created_at").eq("office_id", c.officeId).order("created_at", { ascending: false });
	let certificatesQuery = db.from("nfse_certificates").select("id,issuer_id,fingerprint_sha256,subject_tax_id,not_before,not_after,status").eq("office_id", c.officeId).order("created_at", { ascending: false });
	let representationsQuery = db.from("nfse_representations").select("issuer_id,certificate_id,authorization_type,valid_until,allow_client_issuance,allow_cancellation,nfse_certificates!inner(subject_tax_id,not_after,status,not_before)").eq("office_id", c.officeId).eq("status", "active").lte("valid_from", new Date().toISOString()).or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`).eq("nfse_certificates.status","active").lte("nfse_certificates.not_before",new Date().toISOString()).gt("nfse_certificates.not_after",new Date().toISOString());
	if (c.issuerScope) {
		const scope = c.issuerScope.length ? c.issuerScope : ["00000000-0000-0000-0000-000000000000"];
		issuersQuery = issuersQuery.in("id", scope);servicesQuery = servicesQuery.in("issuer_id", scope);takersQuery = takersQuery.in("issuer_id", scope);invoicesQuery = invoicesQuery.in("issuer_id", scope);certificatesQuery = certificatesQuery.in("issuer_id", scope);
	}
	if (c.issuerScope) representationsQuery = representationsQuery.in("issuer_id", c.issuerScope.length ? c.issuerScope : ["00000000-0000-0000-0000-000000000000"]);
	const [issuers, services, takers, invoices, certificates, representations] = await Promise.all([issuersQuery, servicesQuery, takersQuery, invoicesQuery, certificatesQuery, representationsQuery]);
	const failed = [issuers, services, takers, invoices, certificates, representations].find((result) => result.error);
	if (failed?.error) throw new Error(failed.error.message);
	const errorResult=await db.from("nfse_invoices").select("id,cancellation_error").eq("office_id",c.officeId);
	const errorsById=new Map((errorResult.error?[]:errorResult.data||[]).map(x=>[x.id,x.cancellation_error]));
	const invoiceData=(invoices.data||[]).map(x=>({...x,cancellation_error:errorsById.get(x.id)||null}));
	return Response.json({ simulation: false, role: c.role, environment: fiscalEnvironment() === 1 ? "government_production" : "government_homologation", issuers: issuers.data, services: services.data, takers: takers.data, invoices: invoiceData, certificates: certificates.data, representations:representations.data||[], signingReadyIssuerIds: (representations.data || []).map((x) => x.issuer_id) });
}

async function remoteMutation(c: Awaited<ReturnType<typeof requireAppContext>>, x: z.infer<typeof actions>) {
	const db = supabaseAdmin(), environment = fiscalEnvironment();
	if (x.action === "issuer") {
		if (c.role !== "admin") return Response.json({ error: "Papel sem permissão para esta operação." }, { status: 403 });
		const r = await db.from("nfse_issuers").insert({ office_id: c.officeId, tax_id: x.taxId, legal_name: x.legalName, municipality_ibge: x.municipalityIbge, tax_regime: x.taxRegime, dps_series: x.dpsSeries, enabled: true,simple_national_option:x.simpleNationalOption,simple_national_taxation_regime:x.simpleNationalTaxationRegime,special_tax_regime:x.specialTaxRegime }).select("id").single();
		if (r.error) throw new Error(r.error.message);return Response.json(r.data, { status: 201 });
	}
	requireIssuer(c, x.issuerId);
	if (x.action === "taker" && c.role === "client") {
		const issuer = await db.from("nfse_issuers").select("id").eq("id", x.issuerId).eq("office_id", c.officeId).maybeSingle();
		if (issuer.error) throw new Error(issuer.error.message);
		if (!issuer.data) return Response.json({ error: "Emitente não encontrado." }, { status: 404 });
		const savedTaker = await db.from("nfse_takers").upsert({ office_id: c.officeId, issuer_id: x.issuerId, tax_id: x.taxId, legal_name: x.legalName, email: x.email || null }, { onConflict: "issuer_id,tax_id" }).select("id").single();
		if (savedTaker.error) throw new Error(savedTaker.error.message);
		return Response.json(savedTaker.data, { status: 201 });
	}
	if (x.action === "service" || x.action === "taker") {
		if (c.role !== "admin") return Response.json({ error: "Papel sem permissão para esta operação." }, { status: 403 });
		const issuer = await db.from("nfse_issuers").select("id").eq("id", x.issuerId).eq("office_id", c.officeId).maybeSingle();
		if (issuer.error) throw new Error(issuer.error.message);if (!issuer.data) return Response.json({ error: "Emitente não encontrado." }, { status: 404 });
		const r = x.action === "service"
			? await db.from("nfse_service_profiles").insert({ office_id: c.officeId, issuer_id: x.issuerId, name: x.name, national_code: x.nationalCode, municipal_code:x.municipalCode||null,nbs_code:x.nbsCode||null, description: x.description, valid_from: new Date().toISOString().slice(0, 10), fiscal_reviewed_at: new Date().toISOString() }).select("id").single()
			: await db.from("nfse_takers").upsert({ office_id: c.officeId, issuer_id: x.issuerId, tax_id: x.taxId, legal_name: x.legalName, email: x.email || null }, { onConflict: "issuer_id,tax_id" }).select("id").single();
		if (r.error) throw new Error(r.error.message);return Response.json(r.data, { status: 201 });
	}
	const [taker, service] = await Promise.all([
		db.from("nfse_takers").select("id").eq("id", x.takerId).eq("issuer_id", x.issuerId).eq("office_id", c.officeId).maybeSingle(),
		db.from("nfse_service_profiles").select("id").eq("id", x.serviceProfileId).eq("issuer_id", x.issuerId).eq("office_id", c.officeId).maybeSingle(),
	]);
	if (taker.error || service.error) throw new Error(taker.error?.message || service.error?.message);
	if (!taker.data || !service.data) return Response.json({ error: "Cadastros fiscais fora do escopo." }, { status: 400 });
	const contentHash = createHash("sha256").update(JSON.stringify(x)).digest("hex");
	const prior = await db.from("nfse_invoices").select("id,content_hash").eq("office_id", c.officeId).eq("issuer_id", x.issuerId).eq("environment", environment).eq("idempotency_key", x.idempotencyKey).maybeSingle();
	if (prior.error) throw new Error(prior.error.message);if (prior.data) return prior.data.content_hash === contentHash ? Response.json({ id: prior.data.id, replayed: true }) : Response.json({ error: "Chave idempotente reutilizada com dados diferentes." }, { status: 409 });
	const ibsCbs = { enabled:x.ibsCbsEnabled,purpose:x.ibsCbsPurpose,operationIndicator:x.ibsCbsOperationIndicator,destinationIndicator:x.ibsCbsDestinationIndicator,taxSituation:x.ibsCbsTaxSituation,classification:x.ibsCbsClassification,base:x.ibsCbsBase,ibsUfRate:x.ibsUfRate,ibsMunicipalRate:x.ibsMunicipalRate,cbsRate:x.cbsRate,ibsCredit:x.ibsCredit,cbsCredit:x.cbsCredit }, federalRetentions={ir:x.irRetention,inss:x.inssRetention,pis:x.pisRetention,cofins:x.cofinsRetention,csll:x.csllRetention};
	const saved = await db.from("nfse_invoices").insert({ office_id: c.officeId, issuer_id: x.issuerId, taker_id: x.takerId, service_profile_id: x.serviceProfileId, environment, competence: x.competence, amount: x.amount, description: x.description, idempotency_key: x.idempotencyKey, content_hash: contentHash, created_by: c.userId,unconditional_discount:x.unconditionalDiscount,conditional_discount:x.conditionalDiscount,operation:{serviceMunicipalityIbge:x.serviceMunicipalityIbge,serviceMunicipalityName:x.serviceMunicipalityName,serviceMunicipalityUf:x.serviceMunicipalityUf,additionalInformation:x.additionalInformation},taxation:{issTaxation:x.issTaxation,issWithholding:x.issWithholding,issRate:x.issRate,ibsCbs,federalRetentions} }).select("id,status").single();
	if (saved.error) throw new Error(saved.error.message);return Response.json(saved.data, { status: 201 });
}

function fiscalEnvironment(): 1 | 2 {
	if (process.env.NFSE_PROVIDER === "government_production" && process.env.NFSE_ENVIRONMENT === "1" && process.env.NFSE_ENABLE_PRODUCTION === "true") return 1;
	return 2;
}
