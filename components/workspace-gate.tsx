"use client";

import { useEffect, useState } from "react";
import { FileText, Files } from "lucide-react";
import { RealApp } from "@/components/real-app";
import { NfseWorkspace } from "@/components/nfse/nfse-workspace";

type Module = "documentos" | "nfse";
type Context = { role: "admin" | "operator"; effectiveModules: Module[] };
type State = { kind: "loading" } | { kind: "onboarding" } | { kind: "ready"; context: Context } | { kind: "error"; message: string };
export function WorkspaceGate() {
	const [state, setState] = useState<State>({ kind: "loading" });
	const [selectedModule, setSelectedModule] = useState<Module | null>(null);
	useEffect(() => { void fetchContext().then(async (response) => {
		const body = await response.json();
		if (response.ok) setState({ kind: "ready", context: body });
		else if (response.status === 403 && String(body.error || "").includes("ainda não concluído")) setState({ kind: "onboarding" });
		else setState({ kind: "error", message: body.error || "Não foi possível carregar sua conta." });
	}).catch(() => setState({ kind: "error", message: "Não foi possível carregar sua conta." })); }, []);
	if (state.kind === "loading") return <main className="auth-shell"><p>Carregando sua conta…</p></main>;
	if (state.kind === "onboarding") return <Onboarding onDone={() => location.reload()} />;
	if (state.kind === "error") return <main className="auth-shell"><section><p>{state.message}</p><Logout /></section></main>;
	const modules = state.context.effectiveModules;
	if (!modules.length) return <ModuleStatus title="Ativação pendente" message="Seu cadastro foi concluído, mas nenhum módulo comercial está ativo. A escolha da oferta não concede acesso automaticamente." />;
	if (!selectedModule) return <ModuleHub modules={modules} onSelect={setSelectedModule} />;
	const active = selectedModule;
	return active === "nfse" && modules.includes("nfse")
		? <NfseWorkspace onOpenModules={() => setSelectedModule(null)} />
		: <RealApp onOpenModules={() => setSelectedModule(null)} />;
}
function ModuleHub({ modules, onSelect }: { modules: Module[]; onSelect: (module: Module) => void }) {
	return <main className="module-hub"><section><img src="/api/logo" alt="Socium Contábil" /><div className="module-hub-title"><small>Plataforma Socium</small><h1>Escolha um módulo</h1><p>Selecione o que deseja fazer. Cada módulo mantém suas próprias ferramentas e navegação.</p></div><div className="module-hub-grid">
		{modules.includes("nfse") && <button type="button" onClick={() => onSelect("nfse")}><i><FileText size={38} /></i><span><b>Emitir NFS-e</b><small>Emita, acompanhe e gerencie notas fiscais de serviço.</small></span><em>Acessar módulo →</em></button>}
		{modules.includes("documentos") && <button type="button" onClick={() => onSelect("documentos")}><i><Files size={38} /></i><span><b>Importar Guias</b><small>Importe, organize e envie guias para seus clientes.</small></span><em>Acessar módulo →</em></button>}
	</div><Logout /></section></main>;
}
async function fetchContext() { let response = await fetch("/api/auth/context", { cache: "no-store" }); if (response.status === 401) { const refreshed = await fetch("/api/auth/refresh", { method: "POST" }); if (refreshed.ok) response = await fetch("/api/auth/context", { cache: "no-store" }); } return response; }
function Onboarding({ onDone }: { onDone: () => void }) {
	const [message, setMessage] = useState("");
	async function submit(form: FormData) { setMessage("Salvando…"); const payload = { name: form.get("name"), officeName: form.get("officeName"), taxId: form.get("taxId"), offer: form.get("offer"), idempotencyKey: crypto.randomUUID() }; const response = await fetch("/api/auth/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }), body = await response.json(); if (response.ok) return onDone(); setMessage(body.error || "Não foi possível concluir o cadastro."); }
	return <main className="auth-shell"><form action={submit}><h1>Configure seu escritório</h1><input name="name" required minLength={2} placeholder="Seu nome" /><input name="officeName" required minLength={2} placeholder="Nome do escritório" /><input name="taxId" placeholder="CNPJ (opcional)" /><label>Oferta de interesse<select name="offer" defaultValue="documentos"><option value="documentos">Enviar guias</option><option value="nfse">Emitir notas</option><option value="completo">Completo</option></select></label><button type="submit">Concluir cadastro</button><p>{message}</p></form></main>;
}
function ModuleStatus({ title, message }: { title: string; message: string }) { return <main className="auth-shell"><section><h1>{title}</h1><p>{message}</p><Logout /></section></main>; }
function Logout() { return <button className="module-logout" type="button" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); location.reload(); }}>Sair da conta</button>; }
