import forge from "node-forge";
import { createHash, randomUUID } from "node:crypto";
import {
	requireAppContext,
	requireIssuer,
	authError,
} from "@/lib/auth-context";
import { sealSecret, custodyReady } from "@/lib/nfse/custody";
import { supabaseAdmin } from "@/lib/supabase-server";
import { localMode, localQuery, localTransaction } from "@/lib/local-db";
import { localWrite, localDelete } from "@/lib/local-storage";
const digits = (value: string) => value.replace(/\D/g, "");
const CNPJ_OIDS = new Set(["2.16.76.1.3.3", "2.5.4.97"]);
const CPF_OID = "2.16.76.1.3.1";
function identityNumbers(value: string, size: 11 | 14) {
	const found = new Set<string>();
	const patterns = size === 14
		? [/(?<!\d)\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[\s\/-]?\d{4}[-\s]?\d{2}(?!\d)/g, /(?<!\d)\d{14}(?!\d)/g]
		: [/(?<!\d)\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[-\s]?\d{2}(?!\d)/g, /(?<!\d)\d{11}(?!\d)/g];
	for (const pattern of patterns)
		for (const match of value.match(pattern) || []) found.add(digits(match));
	return found;
}
function certificateIdentities(cert: forge.pki.Certificate) {
	const cnpjs = new Set<string>(), cpfs = new Set<string>();
	const collect = (value: string, oid?: string) => {
		for (const cnpj of identityNumbers(value, 14)) cnpjs.add(cnpj);
		for (const cpf of identityNumbers(value, 11)) cpfs.add(cpf);
		// ICP-Brasil PF encodes birth date (8 digits) before the CPF.
		const compact = digits(value);
		if (oid === CPF_OID && compact.length >= 19) cpfs.add(compact.slice(8, 19));
	};
	for (const attribute of cert.subject.attributes) {
		const oid = String(attribute.type);
		if (CNPJ_OIDS.has(oid) || oid === CPF_OID || attribute.shortName === "CN" || attribute.shortName === "serialNumber")
			collect(String(attribute.value), oid);
	}
	const san = cert.getExtension("subjectAltName") as { altNames?: Array<{ type: number; value?: string }> } | null;
	for (const name of san?.altNames || []) {
		if (name.type !== 0 || !name.value) continue;
		try {
			let currentOid: string | undefined;
			const walk = (node: forge.asn1.Asn1) => {
				if (node.type === forge.asn1.Type.OID && typeof node.value === "string") {
					try { currentOid = forge.asn1.derToOid(node.value); } catch { currentOid = undefined; }
				}
				if (typeof node.value === "string") {
					collect(node.value, currentOid);
				} else for (const child of node.value) walk(child);
			};
			walk(forge.asn1.fromDer(name.value));
		} catch { /* extensão desconhecida não concede titularidade */ }
	}
	return { cnpjs: [...cnpjs], cpfs: [...cpfs] };
}
const maskedCpf = (cpf: string) => `***.***.${cpf.slice(6, 9)}-${cpf.slice(-2)}`;
function incompatibleCertificate(expected: string, identities: ReturnType<typeof certificateIdentities>) {
	const detail = identities.cpfs.length
		? ` O arquivo parece ser um e-CPF (${maskedCpf(identities.cpfs[0])}); cadastre o representante antes de utilizá-lo.`
		: identities.cnpjs.length
			? ` CNPJ identificado no certificado: ${identities.cnpjs[0]}.`
			: " Não foi possível localizar um CNPJ de titular no certificado.";
	return Response.json({ error: `Titular do certificado incompatível com o emitente ${expected}.${detail}` }, { status: 400 });
}
export async function POST(request: Request) {
	let stored = "";
	try {
		const context = await requireAppContext(request, "nfse", ["admin"]);
		if (!custodyReady())
			return Response.json(
				{ error: "Custódia NFS-e não configurada." },
				{ status: 503 },
			);
		const form = await request.formData(),
			file = form.get("certificate"),
			password = String(form.get("password") || ""),
			issuerId = String(form.get("issuerId") || "");
		if (
			!(file instanceof File) ||
			!["application/x-pkcs12", "application/octet-stream"].includes(
				file.type,
			) ||
			file.size < 1 ||
			file.size > 5_000_000 ||
			!password ||
			!/^[0-9a-f-]{36}$/i.test(issuerId)
		)
			return Response.json(
				{ error: "Arquivo, senha ou emitente inválido." },
				{ status: 400 },
			);
		requireIssuer(context, issuerId);
		if (localMode())
			return uploadLocalCertificate(context.officeId, issuerId, file, password);
		const db = supabaseAdmin(),
			issuer = await db
				.from("nfse_issuers")
				.select("id,tax_id")
				.eq("id", issuerId)
				.eq("office_id", context.officeId)
				.maybeSingle();
		if (issuer.error) throw new Error(issuer.error.message);
		if (!issuer.data)
			return Response.json(
				{ error: "Emitente não encontrado." },
				{ status: 404 },
			);
		const bytes = Buffer.from(await file.arrayBuffer());
		let p12: forge.pkcs12.Pkcs12Pfx;
		try {
			p12 = forge.pkcs12.pkcs12FromAsn1(
				forge.asn1.fromDer(bytes.toString("binary")),
				false,
				password,
			);
		} catch {
			return Response.json(
				{ error: "PFX/P12 inválido ou senha incorreta." },
				{ status: 400 },
			);
		}
		const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[
			forge.pki.oids.certBag
		]?.[0];
		const keyBag = (p12.getBags({
			bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
		})[forge.pki.oids.pkcs8ShroudedKeyBag] ||
			p12.getBags({ bagType: forge.pki.oids.keyBag })[
				forge.pki.oids.keyBag
			])?.[0];
		const cert = certBag?.cert,
			key = keyBag?.key;
		if (!cert || !key)
			return Response.json(
				{ error: "O PKCS#12 precisa conter certificado e chave privada." },
				{ status: 400 },
			);
		const publicKey = cert.publicKey as forge.pki.rsa.PublicKey,
			privateKey = key as forge.pki.rsa.PrivateKey;
		if (
			!publicKey.n ||
			!privateKey.n ||
			publicKey.n.compareTo(privateKey.n) !== 0
		)
			return Response.json(
				{ error: "A chave privada não corresponde ao certificado." },
				{ status: 400 },
			);
		const now = new Date();
		if (now < cert.validity.notBefore || now > cert.validity.notAfter)
			return Response.json(
				{ error: "Certificado fora da validade." },
				{ status: 400 },
			);
		const expectedTaxId = digits(issuer.data.tax_id), identities = certificateIdentities(cert);
		if (!identities.cnpjs.includes(expectedTaxId)) return incompatibleCertificate(expectedTaxId, identities);
		const fingerprint = createHash("sha256")
			.update(
				Buffer.from(
					forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(),
					"binary",
				),
			)
			.digest("hex");
		const reference = `${context.officeId}/${issuerId}/${randomUUID()}.enc`,
			aad = `${context.officeId}:${issuerId}:v1`;
		const sealed = sealSecret(
			Buffer.from(JSON.stringify({ pfx: bytes.toString("base64"), password })),
			aad,
		);
		stored = reference;
		const upload = await db.storage
			.from("nfse-custody")
			.upload(reference, Buffer.from(sealed), {
				contentType: "application/octet-stream",
				upsert: false,
			});
		if (upload.error) throw new Error(upload.error.message);
		const saved = await db.rpc("replace_nfse_certificate", {
			p_office: context.officeId,
			p_issuer: issuerId,
			p_provider: "supabase-encrypted",
			p_reference: reference,
			p_key_version: "v1",
			p_fingerprint: fingerprint,
			p_subject_tax_id: digits(issuer.data.tax_id),
			p_not_before: cert.validity.notBefore.toISOString(),
			p_not_after: cert.validity.notAfter.toISOString(),
		});
		if (saved.error) throw new Error(saved.error.message);
		return Response.json(
			{
				uploaded: true,
				fingerprint,
				notAfter: cert.validity.notAfter.toISOString(),
			},
			{ status: 201 },
		);
	} catch (error) {
		if (stored)
			await supabaseAdmin()
				.storage.from("nfse-custody")
				.remove([stored])
				.catch(() => {});
		return authError(error);
	}
}

async function uploadLocalCertificate(
	officeId: string,
	issuerId: string,
	file: File,
	password: string,
) {
	const issuer = await localQuery<{ tax_id: string }>(
		"select tax_id from nfse_issuers where id=$1 and office_id=$2",
		[issuerId, officeId],
	);
	if (!issuer.rows[0])
		return Response.json(
			{ error: "Emitente não encontrado." },
			{ status: 404 },
		);
	const bytes = Buffer.from(await file.arrayBuffer());
	let p12: forge.pkcs12.Pkcs12Pfx;
	try {
		p12 = forge.pkcs12.pkcs12FromAsn1(
			forge.asn1.fromDer(bytes.toString("binary")),
			false,
			password,
		);
	} catch {
		return Response.json(
			{ error: "PFX/P12 inválido ou senha incorreta." },
			{ status: 400 },
		);
	}
	const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[
			forge.pki.oids.certBag
		]?.[0],
		keyBag = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
			forge.pki.oids.pkcs8ShroudedKeyBag
		] ||
			p12.getBags({ bagType: forge.pki.oids.keyBag })[
				forge.pki.oids.keyBag
			])?.[0],
		cert = certBag?.cert,
		key = keyBag?.key;
	if (!cert || !key)
		return Response.json(
			{ error: "O PKCS#12 precisa conter certificado e chave privada." },
			{ status: 400 },
		);
	const publicKey = cert.publicKey as forge.pki.rsa.PublicKey,
		privateKey = key as forge.pki.rsa.PrivateKey;
	if (
		!publicKey.n ||
		!privateKey.n ||
		publicKey.n.compareTo(privateKey.n) !== 0
	)
		return Response.json(
			{ error: "A chave privada não corresponde ao certificado." },
			{ status: 400 },
		);
	const now = new Date();
	if (now < cert.validity.notBefore || now > cert.validity.notAfter)
		return Response.json(
			{ error: "Certificado fora da validade." },
			{ status: 400 },
		);
	const cnpj = digits(issuer.rows[0].tax_id), identities = certificateIdentities(cert);
	if (!identities.cnpjs.includes(cnpj)) return incompatibleCertificate(cnpj, identities);
	const fingerprint = createHash("sha256")
			.update(
				Buffer.from(
					forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(),
					"binary",
				),
			)
			.digest("hex"),
		reference = `custody/${officeId}/${issuerId}/${randomUUID()}.enc`,
		aad = `${officeId}:${issuerId}:v1`,
		sealed = sealSecret(
			Buffer.from(JSON.stringify({ pfx: bytes.toString("base64"), password })),
			aad,
		);
	await localWrite(reference, Buffer.from(sealed));
	try {
		await localTransaction(async (db) => {
			await db.query(
				"update nfse_certificates set status='replaced' where issuer_id=$1 and office_id=$2 and status='active'",
				[issuerId, officeId],
			);
			return db.query(
				"insert into nfse_certificates(office_id,issuer_id,custody_provider,custody_reference,key_version,fingerprint_sha256,subject_tax_id,not_before,not_after,status) values($1,$2,'local-encrypted',$3,'v1',$4,$5,$6,$7,'active')",
				[officeId, issuerId, reference, fingerprint, cnpj, cert.validity.notBefore, cert.validity.notAfter],
			);
		});
	} catch (error) {
		await localDelete(reference);
		throw error;
	}
	return Response.json(
		{
			uploaded: true,
			simulation: true,
			fingerprint,
			notAfter: cert.validity.notAfter.toISOString(),
		},
		{ status: 201 },
	);
}
