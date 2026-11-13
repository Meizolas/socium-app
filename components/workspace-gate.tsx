"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { FileKey2, FileText, Files, ShieldCheck } from "lucide-react";
import { RealApp } from "@/components/real-app";
import { NfseWorkspace } from "@/components/nfse/nfse-workspace";
import { FiscalOnboarding } from "@/components/fiscal-onboarding";

type Module = "documentos" | "nfse";
type Context = { role: "admin" | "operator" | "client"; onboardingStep: string; effectiveModules: Module[] };
type State = { kind: "loading" } | { kind: "onboarding" } | { kind: "ready"; context: Context } | { kind: "error"; message: string };

export function WorkspaceGate() {
	const [state, setState] = useState<State>({ kind: "loading" });
	const [selectedModule, setSelectedModule] = useState<Module | null>(null);
	useEffect(() => {
		void fetchContext().then(async (response) => {
			const body = await response.json();
			if (response.ok) setState({ kind: "ready", context: body });
			else if (response.status === 403 && String(body.error || "").includes("ainda não concluído")) setState({ kind: "onboarding" });
			else setState({ kind: "error", message: body.error || "Não foi possível carregar sua conta." });
		}).catch(() => setState({ kind: "error", message: "Não foi possível carregar sua conta." }));
	}, []);
	if (state.kind === "loading") return <main className="auth-shell"><p>Carregando sua conta…</p></main>;
	if (state.kind === "onboarding") return <Onboarding onDone={() => location.reload()} />;
	if (state.kind === "error") return <main className="auth-shell"><section><p>{state.message}</p><Logout /></section></main>;
	const modules = state.context.effectiveModules;
	if (!modules.length && state.context.onboardingStep === "identity_verification")
		return <IdentityVerification onDone={() => location.reload()} />;
	if (!modules.length && state.context.onboardingStep === "commercial_activation")
		return <FiscalOnboarding onLogout={logout} />;
	if (!modules.length)
		return <ModuleStatus title="Ativação pendente" message="Seu cadastro foi concluído, mas nenhum módulo comercial está ativo. A escolha da oferta não concede acesso automaticamente." />;
	if (!selectedModule) return <ModuleHub modules={modules} onSelect={setSelectedModule} />;
	const active = selectedModule;
	return active === "nfse" && modules.includes("nfse")
		? <NfseWorkspace onOpenModules={() => setSelectedModule(null)} />
		: <RealApp onOpenModules={() => setSelectedModule(null)} />;
}

function ModuleHub({ modules, onSelect }: { modules: Module[]; onSelect: (module: Module) => void }) {
	return <main className="module-hub"><section><Image src="/api/logo?brand=helians-v1" alt="Helians" width={250} height={84} priority /><div className="module-hub-title"><small>Plataforma Helians</small><h1>Escolha um módulo</h1><p>Selecione o que deseja fazer. Cada módulo mantém suas próprias ferramentas e navegação.</p></div><div className="module-hub-grid">
		{modules.includes("nfse") && <button type="button" onClick={() => onSelect("nfse")}><i><FileText size={38} /></i><span><b>Emitir NFS-e</b><small>Emita, acompanhe e gerencie notas fiscais de serviço.</small></span><em>Acessar módulo →</em></button>}
		{modules.includes("documentos") && <button type="button" onClick={() => onSelect("documentos")}><i><Files size={38} /></i><span><b>Importar Guias</b><small>Importe, organize e envie guias para seus clientes.</small></span><em>Acessar módulo →</em></button>}
	</div><Logout /></section></main>;
}

async function fetchContext() {
	let response = await fetch("/api/auth/context", { cache: "no-store" });
	if (response.status === 401) {
		const refreshed = await fetch("/api/auth/refresh", { method: "POST" });
		if (refreshed.ok) response = await fetch("/api/auth/context", { cache: "no-store" });
	}
	return response;
}

function Onboarding({ onDone }: { onDone: () => void }) {
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const [idempotencyKey] = useState(() => crypto.randomUUID());
	async function submit(form: FormData) {
		setBusy(true);
		setMessage("Criando sua conta…");
		try {
			const payload = { name: form.get("name"), officeName: form.get("officeName"), idempotencyKey };
			const response = await fetch("/api/auth/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
			const body = await response.json();
			if (response.ok) return onDone();
			setMessage(body.error || "Não foi possível concluir o primeiro acesso.");
		} catch {
			setMessage("Não foi possível conectar ao serviço de cadastro.");
		} finally {
			setBusy(false);
		}
	}
	return <main className="auth-shell"><form action={submit} className="auth-onboarding-card">
		<Image src="/api/logo?brand=helians-v1" alt="Helians" width={220} height={74} priority />
		<h1>Primeiro acesso</h1>
		<p className="auth-intro">Informe quem você é e qual empresa deseja cadastrar. O CPF/CNPJ será validado antes de liberar operações fiscais.</p>
		<label>Seu nome<input name="name" required minLength={2} maxLength={120} autoComplete="name" placeholder="Nome completo" /></label>
		<label>Empresa ou organização<input name="officeName" required minLength={2} maxLength={200} autoComplete="organization" placeholder="Razão social ou nome da empresa" /></label>
		<div className="auth-selected-product"><FileText size={20} /><span><small>Produto contratado</small><b>Emissão de NFS-e</b></span></div>
		<div className="auth-security-note"><ShieldCheck size={20} /><span>Este cadastro não concede automaticamente propriedade da empresa nem acesso a certificados.</span></div>
		<button type="submit" disabled={busy}>{busy ? "Criando conta…" : "Concluir primeiro acesso"}</button>
		{message && <p className="auth-feedback" aria-live="polite">{message}</p>}
		<Logout />
	</form></main>;
}

function ModuleStatus({ title, message }: { title: string; message: string }) {
	return <main className="auth-shell"><section className="auth-status-card"><h1>{title}</h1><p>{message}</p><Logout /></section></main>;
}

function IdentityVerification({ onDone }: { onDone: () => void }) {
	const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
	async function verify(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault(); setBusy(true); setMessage("");
		try {
			const response = await fetch("/api/auth/identity-certificate", { method: "POST", body: new FormData(event.currentTarget) });
			const body = await response.json();
			if (!response.ok) throw new Error(body.error || "Não foi possível validar o certificado.");
			onDone();
		} catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao validar o certificado."); }
		finally { setBusy(false); }
	}
	return <main className="fiscal-setup-shell"><section className="fiscal-setup-card compact">
		<Image src="/api/logo?brand=helians-v1" alt="Helians" width={190} height={64} priority />
		<FileKey2 size={38} /><h1>Valide seu CPF ou CNPJ</h1>
		<p>Envie um certificado A1 cujo titular seja o mesmo CPF ou CNPJ usado no cadastro. Ele comprova a identidade e ficará protegido na custódia fiscal.</p>
		<form onSubmit={verify} className="fiscal-certificate identity-certificate-form">
			<header><b>Certificado A1</b><p>Representantes podem ser pessoas físicas ou jurídicas. Certificados e-CPF e e-CNPJ são aceitos.</p></header>
			<label><span>Arquivo do certificado</span><input name="certificate" type="file" accept=".pfx,.p12,application/x-pkcs12" required /><small>Formatos aceitos: .pfx ou .p12</small></label>
			<div className="identity-certificate-actions">
				<label><span>Senha do certificado</span><input name="password" type="password" autoComplete="off" placeholder="Digite a senha do A1" required /></label>
				<button disabled={busy}>{busy ? "Validando…" : "Validar identidade"}</button>
			</div>
		</form>
		{message && <p className="auth-feedback" aria-live="polite">{message}</p>}<Logout />
	</section></main>;
}

function Logout() {
	return <button className="module-logout" type="button" onClick={logout}>Sair da conta</button>;
}

async function logout() { await fetch("/api/auth/logout", { method: "POST" }); location.reload(); }
