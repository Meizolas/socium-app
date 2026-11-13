import { createHash, timingSafeEqual } from "node:crypto";
import forge from "node-forge";

const CNPJ_OIDS = new Set(["2.16.76.1.3.3", "2.5.4.97"]);
const CPF_OID = "2.16.76.1.3.1";

export function hashCertificateToken(value: string) {
	return createHash("sha256").update(value).digest("hex");
}

export function trustedCertificateGateway(request: Request) {
	const expected = process.env.CERT_GATEWAY_SHARED_SECRET || "";
	const received = request.headers.get("x-certificate-gateway-secret") || "";
	if (expected.length < 32 || expected.length !== received.length) return false;
	return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function identityNumbers(value: string, size: 11 | 14) {
	const found = new Set<string>();
	const patterns = size === 14
		? [/(?<!\d)\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[\s\/-]?\d{4}[-\s]?\d{2}(?!\d)/g, /(?<!\d)\d{14}(?!\d)/g]
		: [/(?<!\d)\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[-\s]?\d{2}(?!\d)/g, /(?<!\d)\d{11}(?!\d)/g];
	for (const pattern of patterns)
		for (const match of value.match(pattern) || []) found.add(match.replace(/\D/g, ""));
	return found;
}

function identities(cert: forge.pki.Certificate) {
	const cnpjs = new Set<string>();
	const cpfs = new Set<string>();
	const collect = (value: string, oid?: string) => {
		for (const cnpj of identityNumbers(value, 14)) cnpjs.add(cnpj);
		for (const cpf of identityNumbers(value, 11)) cpfs.add(cpf);
		const compact = value.replace(/\D/g, "");
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
		} catch { /* An unknown SAN never grants an identity. */ }
	}
	return { cnpjs: [...cnpjs], cpfs: [...cpfs] };
}

export function parseGatewayCertificate(request: Request) {
	if (request.headers.get("x-client-cert-verify") !== "SUCCESS")
		throw new Error("certificate_chain_not_verified");
	const escaped = request.headers.get("x-client-cert") || "";
	if (!escaped || escaped.length > 32_000) throw new Error("certificate_missing");
	let pem: string;
	try { pem = decodeURIComponent(escaped); } catch { throw new Error("certificate_encoding_invalid"); }
	let certificate: forge.pki.Certificate;
	try { certificate = forge.pki.certificateFromPem(pem); } catch { throw new Error("certificate_invalid"); }
	const now = new Date();
	if (now < certificate.validity.notBefore || now >= certificate.validity.notAfter)
		throw new Error("certificate_expired");
	const constraints = certificate.getExtension("basicConstraints") as { cA?: boolean } | null;
	if (constraints?.cA) throw new Error("certificate_authority_not_allowed");
	const found = identities(certificate);
	if (found.cnpjs.length > 1 || (!found.cnpjs.length && found.cpfs.length !== 1))
		throw new Error("certificate_identity_ambiguous");
	const taxId = found.cnpjs[0] || found.cpfs[0];
	if (!taxId) throw new Error("certificate_identity_missing");
	const der = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes(), "binary");
	const commonName = certificate.subject.getField("CN")?.value;
	return {
		taxId,
		canonicalName: typeof commonName === "string" ? commonName.slice(0, 200) : taxId,
		fingerprint: createHash("sha256").update(der).digest("hex"),
		serial: certificate.serialNumber.slice(0, 256),
		subject: certificate.subject.attributes.map((item) => `${item.shortName || item.type}=${String(item.value)}`).join(",").slice(0, 2000),
		notBefore: certificate.validity.notBefore.toISOString(),
		notAfter: certificate.validity.notAfter.toISOString(),
	};
}
