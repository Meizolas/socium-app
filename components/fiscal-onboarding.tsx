"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Building2, CheckCircle2, FileKey2, Search, ShieldCheck } from "lucide-react";

type Data = { entity: { id: string; tax_id: string; entity_type: string; canonical_name: string | null }; requiresCompanyCertificate?: boolean; issuer?: { id: string; legal_name: string; municipal_registration: string | null; municipality_ibge: string; tax_regime: string; dps_series: string; simple_national_option: "1" | "2" | "3"; simple_national_taxation_regime: "1" | "2" | "3"; special_tax_regime: string } | null; setup?: { status: "pending" | "fiscal_ready" | "certificate_ready" } | null; activeCertificate?: { not_after: string } | null };
type Draft = { legalName: string; municipalRegistration: string; municipalityIbge: string; taxRegime: string; dpsSeries: string; simpleNationalOption: "1" | "2" | "3"; simpleNationalTaxationRegime: "1" | "2" | "3"; specialTaxRegime: string };
const emptyDraft = (name = ""): Draft => ({ legalName: name, municipalRegistration: "", municipalityIbge: "", taxRegime: "Regime normal", dpsSeries: "1", simpleNationalOption: "1", simpleNationalTaxationRegime: "1", specialTaxRegime: "0" });

export function FiscalOnboarding({ onLogout }: { onLogout: () => void }) {
	const [data, setData] = useState<Data | null>(null), [draft, setDraft] = useState<Draft>(emptyDraft());
	const [busy, setBusy] = useState(false), [lookupBusy, setLookupBusy] = useState(false), [message, setMessage] = useState("");
	async function load() {
		const response = await fetch("/api/auth/fiscal-onboarding", { cache: "no-store" }), body = await response.json();
		if (!response.ok) throw new Error(body.error || "Não foi possível carregar a configuração fiscal.");
		setData(body); const issuer = body.issuer as Data["issuer"];
		setDraft(issuer ? { legalName: issuer.legal_name, municipalRegistration: issuer.municipal_registration || "", municipalityIbge: issuer.municipality_ibge, taxRegime: issuer.tax_regime, dpsSeries: issuer.dps_series, simpleNationalOption: issuer.simple_national_option, simpleNationalTaxationRegime: issuer.simple_national_taxation_regime, specialTaxRegime: issuer.special_tax_regime } : emptyDraft(body.entity?.canonical_name || ""));
	}
	useEffect(() => {
		let active = true;
		void fetch("/api/auth/fiscal-onboarding", { cache: "no-store" }).then(async (response) => {
			const body = await response.json();
			if (!response.ok) throw new Error(body.error || "Não foi possível carregar a configuração fiscal.");
			return body as Data;
		}).then((body) => {
			if (!active) return;
			setData(body); const issuer = body.issuer;
			setDraft(issuer ? { legalName: issuer.legal_name, municipalRegistration: issuer.municipal_registration || "", municipalityIbge: issuer.municipality_ibge, taxRegime: issuer.tax_regime, dpsSeries: issuer.dps_series, simpleNationalOption: issuer.simple_national_option, simpleNationalTaxationRegime: issuer.simple_national_taxation_regime, specialTaxRegime: issuer.special_tax_regime } : emptyDraft(body.entity?.canonical_name || ""));
		}).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Falha ao carregar."); });
		return () => { active = false; };
	}, []);
	async function lookup() {
		setLookupBusy(true); setMessage("");
		try {
			const response = await fetch("/api/auth/fiscal-onboarding/company", { cache: "no-store" }), body = await response.json();
			if (!response.ok) throw new Error(body.error || "Consulta indisponível.");
			const option = (body.simpleNationalOption || "1") as Draft["simpleNationalOption"];
			setDraft((current) => ({ ...current, legalName: body.legalName || current.legalName, municipalityIbge: body.municipalityIbge || current.municipalityIbge, simpleNationalOption: option, taxRegime: option === "1" ? "Regime normal" : "Simples Nacional" }));
			setMessage(`Dados encontrados${body.municipalityName ? ` para ${body.municipalityName}/${body.uf}` : ""}. Confirme as informações fiscais.`);
		} catch (error) { setMessage(error instanceof Error ? error.message : "Consulta indisponível."); } finally { setLookupBusy(false); }
	}
	async function save(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault(); if (!data) return; setBusy(true); setMessage("");
		try {
			const response = await fetch("/api/auth/fiscal-onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ legalEntityId: data.entity.id, ...draft }) }), body = await response.json();
			if (!response.ok) throw new Error(body.error || "Não foi possível salvar os dados fiscais.");
			await load(); setMessage("Dados fiscais salvos. Agora você pode incluir o A1 ou aguardar a ativação comercial.");
		} catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar."); } finally { setBusy(false); }
	}
	if (!data) return <main className="auth-shell"><section className="auth-status-card"><p>{message || "Carregando configuração fiscal…"}</p><button className="module-logout" onClick={onLogout}>Sair da conta</button></section></main>;
	if (data.requiresCompanyCertificate) return <main className="fiscal-setup-shell"><section className="fiscal-setup-card compact"><Image src="/api/logo?brand=helians-v1" alt="Helians" width={190} height={64} priority /><ShieldCheck size={34} /><h1>Identidade pessoal validada</h1><p>O e-CPF confirmou sua identidade, mas não comprova sozinho qual empresa você pode administrar. Para ativação automática de uma empresa, entre com o e-CNPJ dela ou receba um convite do titular.</p><button className="module-logout" onClick={onLogout}>Sair da conta</button></section></main>;
	const ready = data.setup?.status === "fiscal_ready" || data.setup?.status === "certificate_ready";
	return <main className="fiscal-setup-shell"><section className="fiscal-setup-card">
		<header><Image src="/api/logo?brand=helians-v1" alt="Helians" width={190} height={64} priority /><div><small>Primeiro acesso</small><h1>Configure sua empresa</h1><p>Confirme somente os dados que não existem no certificado digital.</p></div></header>
		<div className="fiscal-identity"><Building2 size={24} /><span><small>Empresa validada por e-CNPJ</small><b>{data.entity.canonical_name || draft.legalName}</b><em>{formatCnpj(data.entity.tax_id)}</em></span><ShieldCheck size={22} /></div>
		<form onSubmit={save} className="fiscal-setup-form">
			<div className="fiscal-section-title"><span><b>Dados fiscais</b><small>Consulte e confirme antes de salvar.</small></span><button type="button" onClick={lookup} disabled={lookupBusy}><Search size={17} />{lookupBusy ? "Consultando…" : "Preencher automaticamente"}</button></div>
			<div className="fiscal-grid">
				<label className="wide">Razão social *<input value={draft.legalName} onChange={(e) => setDraft({ ...draft, legalName: e.target.value })} required /></label>
				<label>Município IBGE *<input value={draft.municipalityIbge} onChange={(e) => setDraft({ ...draft, municipalityIbge: e.target.value.replace(/\D/g, "").slice(0, 7) })} inputMode="numeric" pattern="\d{7}" required /></label>
				<label>Inscrição municipal<input value={draft.municipalRegistration} onChange={(e) => setDraft({ ...draft, municipalRegistration: e.target.value.slice(0, 40) })} placeholder="Se houver" /></label>
				<label>Opção pelo Simples *<select value={draft.simpleNationalOption} onChange={(e) => { const value = e.target.value as Draft["simpleNationalOption"]; setDraft({ ...draft, simpleNationalOption: value, taxRegime: value === "1" ? "Regime normal" : "Simples Nacional" }); }}><option value="1">Não optante</option><option value="2">Optante — MEI</option><option value="3">Optante — ME/EPP</option></select></label>
				<label>Apuração do Simples *<select value={draft.simpleNationalTaxationRegime} onChange={(e) => setDraft({ ...draft, simpleNationalTaxationRegime: e.target.value as Draft["simpleNationalTaxationRegime"] })}><option value="1">Tributos federais e ISS pelo Simples</option><option value="2">Federais pelo Simples; ISS pela NFS-e</option><option value="3">Outro enquadramento autorizado</option></select></label>
				<label>Regime especial *<select value={draft.specialTaxRegime} onChange={(e) => setDraft({ ...draft, specialTaxRegime: e.target.value })}><option value="0">Nenhum</option><option value="1">Microempresa municipal</option><option value="2">Estimativa</option><option value="3">Sociedade de profissionais</option><option value="4">Cooperativa</option><option value="5">MEI</option><option value="6">ME/EPP</option></select></label>
				<label>Série da DPS *<input value={draft.dpsSeries} onChange={(e) => setDraft({ ...draft, dpsSeries: e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 5) })} required /></label>
			</div><button className="fiscal-primary" disabled={busy}>{busy ? "Salvando…" : ready ? "Atualizar dados fiscais" : "Salvar e continuar"}</button>
		</form>
		{ready && data.issuer && <CertificateUpload issuerId={data.issuer.id} certificate={data.activeCertificate} onDone={load} />}
		<div className="fiscal-activation"><CheckCircle2 size={21} /><span><b>{data.setup?.status === "certificate_ready" ? "Configuração técnica concluída" : "Dados fiscais preparados"}</b><small>O módulo NFS-e será liberado somente após a ativação comercial da sua conta.</small></span></div>
		{message && <p className="auth-feedback" aria-live="polite">{message}</p>}<button className="module-logout" onClick={onLogout}>Sair da conta</button>
	</section></main>;
}

function CertificateUpload({ issuerId, certificate, onDone }: { issuerId: string; certificate?: Data["activeCertificate"]; onDone: () => Promise<void> }) {
	const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
	async function upload(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault(); setBusy(true); setMessage(""); const target = event.currentTarget;
		try { const form = new FormData(target); form.set("issuerId", issuerId); const response = await fetch("/api/auth/fiscal-onboarding/certificate", { method: "POST", body: form }), body = await response.json(); if (!response.ok) throw new Error(body.error || "Não foi possível guardar o certificado."); await onDone(); setMessage("A1 validado e armazenado com segurança."); target.reset(); }
		catch (error) { setMessage(error instanceof Error ? error.message : "Falha no envio do A1."); } finally { setBusy(false); }
	}
	return <form onSubmit={upload} className="fiscal-certificate"><FileKey2 size={25} /><div><b>A1 para emissão automática <small>opcional agora</small></b><p>Para emitir NFS-e, envie o arquivo PFX/P12 da empresa e a respectiva senha.</p>{certificate && <em>Certificado ativo até {new Date(certificate.not_after).toLocaleDateString("pt-BR")}</em>}<div><input name="certificate" type="file" accept=".pfx,.p12,application/x-pkcs12" required /><input name="password" type="password" placeholder="Senha do A1" required /><button disabled={busy}>{busy ? "Validando…" : "Enviar A1"}</button></div>{message && <span>{message}</span>}</div></form>;
}

function formatCnpj(value: string) { return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"); }
