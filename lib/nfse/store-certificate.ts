import forge from "node-forge";
import { createHash, randomUUID } from "node:crypto";
import { sealSecret, custodyReady } from "@/lib/nfse/custody";
import { supabaseAdmin } from "@/lib/supabase-server";
import { localMode, localQuery, localTransaction } from "@/lib/local-db";
import { localDelete, localWrite } from "@/lib/local-storage";

const digits = (value: string) => value.replace(/\D/g, "");
const CNPJ_OIDS = new Set(["2.16.76.1.3.3", "2.5.4.97"]);
const CPF_OID = "2.16.76.1.3.1";

function identityNumbers(value: string, size: 11 | 14) {
	const found = new Set<string>();
	const patterns = size === 14
		? [/(?<!\d)\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[\s\/-]?\d{4}[-\s]?\d{2}(?!\d)/g, /(?<!\d)\d{14}(?!\d)/g]
		: [/(?<!\d)\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[-\s]?\d{2}(?!\d)/g, /(?<!\d)\d{11}(?!\d)/g];
	for (const pattern of patterns) for (const match of value.match(pattern) || []) found.add(digits(match));
	return found;
}

function certificateTaxIds(cert: forge.pki.Certificate) {
	const cnpjs = new Set<string>(), cpfs = new Set<string>();
	const collect = (value: string, oid?: string) => {
		for (const cnpj of identityNumbers(value, 14)) cnpjs.add(cnpj);
		for (const cpf of identityNumbers(value, 11)) cpfs.add(cpf);
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
				if (typeof node.value === "string") collect(node.value, currentOid);
				else for (const child of node.value) walk(child);
			};
			walk(forge.asn1.fromDer(name.value));
		} catch { /* unknown extensions never grant ownership */ }
	}
	return { cnpjs: [...cnpjs], cpfs: [...cpfs] };
}

export function parseIdentityCertificate(bytes: Buffer, password: string, expectedTaxId: string) {
	let p12: forge.pkcs12.Pkcs12Pfx;
	try { p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bytes.toString("binary")), false, password); }
	catch { throw new CertificateInputError("PFX/P12 inválido ou senha incorreta."); }
	const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
	const keyBag = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]
		|| p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag])?.[0];
	const cert = certBag?.cert, key = keyBag?.key;
	if (!cert || !key) throw new CertificateInputError("O PKCS#12 precisa conter certificado e chave privada.");
	const publicKey = cert.publicKey as forge.pki.rsa.PublicKey, privateKey = key as forge.pki.rsa.PrivateKey;
	if (!publicKey.n || !privateKey.n || publicKey.n.compareTo(privateKey.n) !== 0)
		throw new CertificateInputError("A chave privada não corresponde ao certificado.");
	const now = new Date();
	if (now < cert.validity.notBefore || now > cert.validity.notAfter)
		throw new CertificateInputError("Certificado fora da validade.");
	const identities = certificateTaxIds(cert);
	const matches = expectedTaxId.length === 11 ? identities.cpfs.includes(expectedTaxId) : identities.cnpjs.includes(expectedTaxId);
	if (!matches)
		throw new CertificateInputError(`O A1 não pertence ao CPF/CNPJ titular ${expectedTaxId}.`);
	const fingerprint = createHash("sha256").update(Buffer.from(
		forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), "binary",
	)).digest("hex");
	return { cert, fingerprint, identities };
}

export class CertificateInputError extends Error {}

export async function storeNfseCertificate(officeId: string, issuerId: string, file: File, password: string) {
	if (!custodyReady()) throw new Error("Custódia NFS-e não configurada.");
	const bytes = Buffer.from(await file.arrayBuffer());
	if (localMode()) {
		const issuer = await localQuery<{ tax_id: string }>("select tax_id from nfse_issuers where id=$1 and office_id=$2", [issuerId, officeId]);
		if (!issuer.rows[0]) throw new CertificateInputError("Emitente não encontrado.");
		const expected = digits(issuer.rows[0].tax_id), parsed = parseIdentityCertificate(bytes, password, expected);
		const reference = `custody/${officeId}/${issuerId}/${randomUUID()}.enc`, aad = `${officeId}:${issuerId}:v1`;
		await localWrite(reference, Buffer.from(sealSecret(Buffer.from(JSON.stringify({ pfx: bytes.toString("base64"), password })), aad)));
		try {
			await localTransaction(async (db) => {
				await db.query("update nfse_certificates set status='replaced' where issuer_id=$1 and office_id=$2 and status='active'", [issuerId, officeId]);
				return db.query("insert into nfse_certificates(office_id,issuer_id,custody_provider,custody_reference,custody_aad_id,key_version,fingerprint_sha256,subject_tax_id,not_before,not_after,status) values($1,$2,'local-encrypted',$3,$2,'v1',$4,$5,$6,$7,'active')", [officeId, issuerId, reference, parsed.fingerprint, expected, parsed.cert.validity.notBefore, parsed.cert.validity.notAfter]);
			});
		} catch (error) { await localDelete(reference); throw error; }
		return { fingerprint: parsed.fingerprint, notAfter: parsed.cert.validity.notAfter.toISOString(), simulation: true };
	}
	const db = supabaseAdmin();
	const issuer = await db.from("nfse_issuers").select("tax_id").eq("id", issuerId).eq("office_id", officeId).maybeSingle();
	if (issuer.error) throw new Error(issuer.error.message);
	if (!issuer.data) throw new CertificateInputError("Emitente não encontrado.");
	const expected = digits(issuer.data.tax_id), parsed = parseIdentityCertificate(bytes, password, expected);
	const reference = `${officeId}/${issuerId}/${randomUUID()}.enc`, aad = `${officeId}:${issuerId}:v1`;
	const sealed = sealSecret(Buffer.from(JSON.stringify({ pfx: bytes.toString("base64"), password })), aad);
	const upload = await db.storage.from("nfse-custody").upload(reference, Buffer.from(sealed), { contentType: "application/octet-stream", upsert: false });
	if (upload.error) throw new Error(upload.error.message);
	try {
		const saved = await db.rpc("replace_nfse_certificate", {
			p_office: officeId, p_issuer: issuerId, p_provider: "supabase-encrypted", p_reference: reference,
			p_key_version: "v1", p_fingerprint: parsed.fingerprint, p_subject_tax_id: expected,
			p_not_before: parsed.cert.validity.notBefore.toISOString(), p_not_after: parsed.cert.validity.notAfter.toISOString(),
		});
		if (saved.error) throw new Error(saved.error.message);
	} catch (error) { await db.storage.from("nfse-custody").remove([reference]); throw error; }
	return { fingerprint: parsed.fingerprint, notAfter: parsed.cert.validity.notAfter.toISOString(), simulation: false };
}
