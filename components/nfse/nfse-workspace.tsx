"use client";
/* eslint-disable react-hooks/set-state-in-effect -- initial API hydration */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
	CheckCircle2,
	Download,
	FilePlus2,
	FileText,
	Home,
	LoaderCircle,
	LogOut,
	RefreshCw,
	Settings,
	ShieldCheck,
	Users,
	Search,
	UserRoundPlus,
	UserRound,
	Tags,
	Coins,
	Layers3,
	NotebookText,
	ReceiptText,
	Save,
	Send,
	ChevronDown,
	ChevronRight,
	X,
	Clock3,
	Bell,
	ChevronDown as ProfileChevronDown,
	CircleChevronLeft,
	LayoutGrid,
	Handshake,
	LogIn,
} from "lucide-react";
type Area = "overview" | "issue" | "registrations" | "representations" | "settings" | "setup";
type Item = {
	id: string;
	issuer_id?: string;
	taker_id?: string;
	service_profile_id?: string;
	tax_id?: string;
	legal_name?: string;
	name?: string;
	description?: string;
	email?: string;
	status?: string;
	official_key?: string;
	simulation_reference?: string;
	competence?: string;
	amount?: string;
	not_after?: string;
	subject_tax_id?: string;
	national_code?: string;
	municipal_code?: string;
	nbs_code?: string;
	municipality_ibge?: string;
	service_municipality_ibge?: string;
	operation_indicator?: string;
	tax_situation?: string;
	taxation?: Record<string, unknown>;
	address?: Record<string, unknown>;
};
type Data = {
	simulation: boolean;
	role?: "admin" | "operator" | "client";
	environment?: "government_homologation" | "government_production";
	issuers: Item[];
	services: Item[];
	takers: Item[];
	invoices: Item[];
	certificates: Item[];
	signingReadyIssuerIds?: string[];
};
type Draft = {
	takerId: string;
	serviceProfileId: string;
	competence: string;
	amount: string;
	description: string;
	serviceMunicipalityIbge: string;
	unconditionalDiscount: string;
	conditionalDiscount: string;
	issTaxation: "taxable" | "immune" | "export" | "not_incident";
	issWithholding: "not_withheld" | "withheld";
	issRate: string;
	additionalInformation: string;
	serviceMunicipalityName: string;
	serviceMunicipalityUf: string;
	ibsCbsEnabled: boolean;
	ibsCbsPurpose: string;
	ibsCbsOperationIndicator: string;
	ibsCbsDestinationIndicator: string;
	ibsCbsTaxSituation: string;
	ibsCbsClassification: string;
	ibsCbsBase: string;
	ibsUfRate: string;
	ibsMunicipalRate: string;
	cbsRate: string;
	ibsCredit: string;
	cbsCredit: string;
	irRetention: string;
	inssRetention: string;
	pisRetention: string;
	cofinsRetention: string;
	csllRetention: string;
};
const emptyDraft: Draft = {
	takerId: "",
	serviceProfileId: "",
	competence: "2026-11-08",
	amount: "100.00",
	description: "",
	serviceMunicipalityIbge: "",
	unconditionalDiscount: "0.00",
	conditionalDiscount: "0.00",
	issTaxation: "taxable",
	issWithholding: "not_withheld",
	issRate: "2.00",
	additionalInformation: "",
	serviceMunicipalityName: "",
	serviceMunicipalityUf: "",
	ibsCbsEnabled: false,
	ibsCbsPurpose: "0",
	ibsCbsOperationIndicator: "",
	ibsCbsDestinationIndicator: "0",
	ibsCbsTaxSituation: "",
	ibsCbsClassification: "",
	ibsCbsBase: "0.00",
	ibsUfRate: "0.00",
	ibsMunicipalRate: "0.00",
	cbsRate: "0.00",
	ibsCredit: "0.00",
	cbsCredit: "0.00",
	irRetention: "0.00",
	inssRetention: "0.00",
	pisRetention: "0.00",
	cofinsRetention: "0.00",
	csllRetention: "0.00",
};
export function NfseWorkspace({ onOpenModules }: { onOpenModules: () => void }) {
	const [data, setData] = useState<Data | null>(null),
		[message, setMessage] = useState(""),
		[busy, setBusy] = useState(""),
		[area, setArea] = useState<Area>("overview"),
		[issuerId, setIssuerId] = useState(""),
		[step, setStep] = useState(1),
		[draft, setDraft] = useState(emptyDraft),
		[resultId, setResultId] = useState(""),
		[collapsed, setCollapsed] = useState(false);
	const first = useRef(true);
	const load = useCallback(async () => {
		try {
			const r = await fetch("/api/nfse/workspace", { cache: "no-store" }), b = await r.json();
			if (!r.ok) { setMessage(b.error || "Não foi possível atualizar os dados."); return false; }
			setData(b); setIssuerId((current) => current || b.issuers[0]?.id || "");
			if (first.current) { first.current = false; if (!b.issuers.length || !b.services.length || (!b.certificates.some((x: Item) => x.status === "active") && !b.signingReadyIssuerIds?.length)) setArea("setup"); }
			return true;
		} catch { setMessage("Não foi possível atualizar os dados agora. Tente novamente."); return false; }
	}, []);
	useEffect(() => {
		void load();
	}, [load]);
	async function post(payload: Record<string, unknown>) {
		try { const r = await fetch("/api/nfse/workspace", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			}),
			text = await r.text(), b = text ? JSON.parse(text) : {};
		if (!r.ok) setMessage(b.error || "Não foi possível salvar.");
		if (r.ok) await load();
		return { ok: r.ok, body: b };
		} catch { setMessage("Não foi possível comunicar com o servidor. Tente novamente."); return { ok: false, body: {} }; }
	}
	async function form(kind: string, values: FormData) {
		if (busy) return false;
		setBusy(`registration:${kind}`); setMessage("");
		const result = await post({ action: kind, ...Object.fromEntries(values) });
		if (result.ok) setMessage(kind === "taker" ? "Tomador salvo com sucesso." : kind === "service" ? "Serviço salvo com sucesso." : "Emitente salvo com sucesso.");
		setBusy("");
		return result.ok;
	}
	if (!data)
		return (
			<main className="auth-shell">
				<section>
					<p>{message || "Carregando NFS-e…"}</p>
				</section>
			</main>
		);
	const issuer = data.issuers.find((x) => x.id === issuerId) || data.issuers[0],
		services = data.services.filter((x) => x.issuer_id === issuer?.id),
		takers = data.takers.filter((x) => x.issuer_id === issuer?.id),
		cert = data.certificates.find(
			(x) => x.issuer_id === issuer?.id && x.status === "active",
		),
		invoices = data.invoices.filter(
			(x) => !issuer || x.issuer_id === issuer.id,
		),
		signingReady = Boolean(cert || (issuer && data.signingReadyIssuerIds?.includes(issuer.id))),
		effectiveCert = cert || (signingReady ? { id: "representation", status: "active", subject_tax_id: "Representante autorizado" } : undefined),
		ready = Boolean(issuer && services.length && signingReady),
		simulation = data.simulation,
		production = data.environment === "government_production";
	async function saveDraft(enqueue = false) {
		if (busy) return;
		if (!issuer || !draft.takerId || !draft.serviceProfileId)
			return setMessage("Selecione tomador e serviço.");
		setBusy(enqueue ? "issue" : "draft");
		setMessage(enqueue ? `Criando o rascunho e enfileirando em ${simulation ? "simulação local" : production ? "produção governamental" : "homologação governamental"}…` : "Salvando rascunho…");
		try {
		const saved = await post({
			action: "draft",
			issuerId: issuer.id,
			...draft,
			idempotencyKey: crypto.randomUUID(),
		});
		if (!saved.ok) return;
		if (enqueue) {
			const r = await fetch(`/api/nfse/invoices/${saved.body.id}/issue`, {
					method: "POST",
				}),
				b = await r.json();
			if (!r.ok) {setMessage(b.error || "Não foi possível enfileirar a NFS-e.");return;}
			if (r.ok) {
				setResultId(saved.body.id);
				setStep(6);
				setMessage(`${simulation ? "NFS-e simulada" : production ? "DPS de produção" : "DPS de homologação"} enviada para processamento.`);
				await load();
			}
		} else {
			setArea("overview");
			setStep(1);
			setDraft(emptyDraft);
		}
		} catch {setMessage("Falha de comunicação ao processar a solicitação. Tente novamente.");}
		finally {setBusy("");}
	}
	return (
		<div className={`app nfse-app ${collapsed ? "sidebar-collapsed" : ""}`}>
			<Sidebar area={area} go={setArea} collapsed={collapsed} setCollapsed={setCollapsed} role={data.role} />
			<main>
				<Topbar
					area={area}
					go={setArea}
					issuer={issuer}
					issuers={data.issuers}
					value={issuerId}
					onChange={setIssuerId}
					simulation={data.simulation}
					production={production}
					onOpenModules={onOpenModules}
				/>
				<div className="nfse-content">
					{!production && <div className="nfse-banner">
						<div>
							<strong>{data.simulation ? "SIMULAÇÃO LOCAL - SEM VALOR FISCAL" : production ? "PRODUÇÃO GOVERNAMENTAL - EMISSÃO COM VALOR FISCAL" : "HOMOLOGAÇÃO GOVERNAMENTAL - SEM VALOR FISCAL"}</strong>
							<p>{data.simulation ? "Nenhuma chamada ao governo ou envio externo é realizado." : production ? "A emissão será transmitida à SEFIN Nacional e poderá gerar obrigação fiscal real." : "A integração usa somente a produção restrita configurada."}</p>
						</div>
						<ShieldCheck size={34} />
					</div>}
					{message && <div className={`nfse-message ${busy ? "busy" : ""}`} role="status" aria-live="polite">{busy && <LoaderCircle className="nfse-spinner" size={18} />}<span>{message}</span></div>}
					{area === "setup" && (
						<Setup data={data} issuer={issuer} cert={cert} go={setArea} />
					)}{" "}
					{area === "overview" && (
						<Overview
							invoices={invoices}
							ready={ready}
							go={setArea}
							refresh={load}
						/>
					)}{" "}
					{area === "issue" && (
						<Issue
							step={step}
							setStep={setStep}
							draft={draft}
							setDraft={setDraft}
							issuer={issuer}
							takers={takers}
							services={services}
							cert={effectiveCert}
							saveDraft={saveDraft}
							result={invoices.find((x) => x.id === resultId)}
							refresh={load}
							busy={busy}
							go={setArea}
							simulation={data.simulation}
							production={production}
						/>
					)}{" "}
					{area === "registrations" && (
						<Registrations issuer={issuer} submit={form} busy={busy.startsWith("registration:")} />
					)}{" "}
					{area === "representations" && (
						<RepresentationWorkspace data={data} onIssuerChange={setIssuerId} refresh={load} />
					)}{" "}
					{area === "settings" && (
						<CertificateSettingsSimple
							issuer={issuer}
							cert={cert}
							setMessage={setMessage}
							refresh={load}
						/>
					)}
				</div>
			</main>
		</div>
	);
}
function Sidebar({ area, go, collapsed, setCollapsed, role }: { area: Area; go: (a: Area) => void; collapsed: boolean; setCollapsed: (value: boolean) => void; role?: Data["role"] }) {
	const item = (key: Area, label: string, Icon: typeof Home) => (
		<button className={area === key ? "active" : ""} onClick={() => go(key)} title={collapsed ? label : undefined}>
			<Icon size={20} />
			<span>{label}</span>
		</button>
	);
	return (
		<aside>
			<img className="logo logo-full" src="/api/logo?brand=helians-v1" alt="Helians" />
			<img className="logo logo-icon" src="/api/logo?variant=icon&brand=helians-v1" alt="" aria-hidden="true" />
			<nav>
				{item("overview", "Visão geral", Home)}
				{item("issue", "Emitir NFS-e", FilePlus2)}
				{item("registrations", "Cadastros fiscais", Users)}
				{role === "admin" && item("representations", "Representação", Handshake)}
				{item("settings", "Configurações", Settings)}
			</nav>
			<button className="collapse" onClick={() => setCollapsed(!collapsed)}>
				<CircleChevronLeft className={collapsed ? "flipped" : ""} size={21} />
				<span>{collapsed ? "Expandir menu" : "Recolher menu"}</span>
			</button>
		</aside>
	);
}
function Topbar({
	area,
	go,
	issuer,
	issuers,
	value,
	onChange,
	simulation,
	production,
	onOpenModules,
}: {
	area: Area;
	go: (area: Area) => void;
	issuer?: Item;
	issuers: Item[];
	value: string;
	onChange: (v: string) => void;
	simulation: boolean;
	production: boolean;
	onOpenModules: () => void;
}) {
	const [profileOpen, setProfileOpen] = useState(false);
	const labels: Record<Area, string> = { overview: "Visão geral", issue: "Emitir NFS-e", registrations: "Cadastros fiscais", representations: "Representação", settings: "Configurações", setup: "Configuração inicial" };
	async function logout() { await fetch("/api/auth/logout", { method: "POST" }); location.reload(); }
	return (
		<header>
			<div className="nfse-breadcrumb">
				<button className="breadcrumb-home" type="button" onClick={onOpenModules}>Helians</button><span>/</span><strong>Emitir NFS-e</strong><span>/</span><b>{labels[area]}</b>
			</div>
			<div className="headright">
				<label className="nfse-issuer-select">
					<span>Empresa</span>
					<select value={value} onChange={(e) => onChange(e.target.value)}>
						<option value="">Selecione</option>
						{issuers.map((x) => (
							<option key={x.id} value={x.id}>
								{x.legal_name}
							</option>
						))}
					</select>
				</label>
				{!production && <span className="badge blue">{simulation ? "Simulação local" : "Homologação governamental"}</span>}
				<button className="iconbtn nfse-alert-button" type="button" aria-label="Notificações"><Bell size={21} /></button>
				<div className="headmenu">
					<button className="profilebtn" type="button" aria-expanded={profileOpen} onClick={() => setProfileOpen(!profileOpen)}>
						<span className="avatar">SC</span><ProfileChevronDown size={19} />
					</button>
					{profileOpen && <div className="dropdown profilemenu nfse-profile-menu">
						<div><span className="avatar">SC</span><p><b>Socium Contábil</b><small>{issuer?.legal_name || "Escritório atual"}</small></p></div>
						<button type="button" onClick={onOpenModules}><LayoutGrid size={18} /> Trocar módulo</button>
						<button type="button" onClick={() => { setProfileOpen(false); go("settings"); }}><Settings size={18} /> Configurações</button>
						<button className="nfse-logout-action" type="button" onClick={() => void logout()}><LogOut size={18} /> Sair da conta</button>
					</div>}
				</div>
			</div>
		</header>
	);
}
function PageTitle({
	title,
	text,
	action,
}: {
	title: string;
	text: string;
	action?: ReactNode;
}) {
	return (
		<div className="title">
			<div>
				<h1>{title}</h1>
				<p>{text}</p>
			</div>
			{action}
		</div>
	);
}
function Setup({
	data,
	issuer,
	cert,
	go,
}: {
	data: Data;
	issuer?: Item;
	cert?: Item;
	go: (a: Area) => void;
}) {
	const steps = [
		{
			done: Boolean(issuer),
			title: "Cadastrar empresa emissora",
			area: "registrations" as Area,
		},
		{
			done: data.services.some((x) => x.issuer_id === issuer?.id),
			title: "Configurar serviços e dados fiscais",
			area: "registrations" as Area,
		},
		{
			done: Boolean(cert),
			title: "Adicionar certificado A1",
			area: "settings" as Area,
		},
		{
			done: Boolean(issuer && cert),
			title: "Revisar pendências e concluir",
			area: "overview" as Area,
		},
	];
	return (
		<>
			<PageTitle
				title="Vamos configurar seu Emissor NFS-e"
				text="Conclua estas etapas uma única vez. Depois, os cadastros saem do fluxo diário."
			/>
			<section className="card nfse-setup">
				<div className="nfse-setup-list">
					{steps.map((x, i) => (
						<button
							key={x.title}
							onClick={() => go(x.area)}
							className={x.done ? "done" : ""}
						>
							<span>{x.done ? <CheckCircle2 /> : i + 1}</span>
							<div>
								<b>{x.title}</b>
								<small>{x.done ? "Concluído" : "Pendente"}</small>
							</div>
						</button>
					))}
				</div>
			</section>
		</>
	);
}
function Overview({
	invoices,
	ready,
	go,
	refresh,
}: {
	invoices: Item[];
	ready: boolean;
	go: (a: Area) => void;
	refresh: () => Promise<unknown>;
}) {
	const drafts = invoices.filter((x) => x.status === "draft").length,
		pending = invoices.filter((x) =>
			["queued", "claimed", "reconciling"].includes(x.status || ""),
		).length;
	return (
		<>
			<PageTitle
				title="Visão geral"
				text="Acompanhe notas recentes, rascunhos e pendências."
				action={
					<button className="btn" onClick={() => go("issue")}>
						<FilePlus2 size={17} /> Emitir NFS-e
					</button>
				}
			/>
			{!ready && (
				<div className="notice">
					<ShieldCheck size={18} />
					<span>Configuração fiscal incompleta.</span>
					<button onClick={() => go("setup")}>Resolver pendências</button>
				</div>
			)}
			<div className="metrics">
				<Metric label="Notas recentes" value={invoices.length} />
				<Metric label="Rascunhos" value={drafts} />
				<Metric label="Em processamento" value={pending} />
				<Metric
					label="Autorizadas"
					value={invoices.filter((x) => x.status === "authorized").length}
				/>
			</div>
			<section className="card nfse-card full">
				<div className="title">
					<div>
						<h2>Notas recentes</h2>
						<p>Últimas movimentações da empresa selecionada.</p>
					</div>
					<button className="nfse-refresh" onClick={refresh}>
						<RefreshCw size={17} /> Atualizar
					</button>
				</div>
				<InvoiceList invoices={invoices} />
			</section>
		</>
	);
}
function Metric({ label, value }: { label: string; value: number }) {
	return (
		<div className="metric">
			<div className="metricicon blue">
				<FileText />
			</div>
			<div>
				<strong>{value}</strong>
				<small>{label}</small>
			</div>
		</div>
	);
}
type Municipality = { ibgeCode: string; name: string; uf: string };
const municipalitySearchCache = new Map<string, Municipality[]>();

function fiscalText(value?: string) {
	if (!value) return "";
	const replacements: Array<[RegExp, string]> = [
		[/Servi\?os/g, "Serviços"], [/servi\?os/g, "serviços"],
		[/T\?cnicos/g, "Técnicos"], [/t\?cnicos/g, "técnicos"],
		[/Munic\?pio/g, "Município"], [/munic\?pio/g, "município"],
		[/Al\?quota/g, "Alíquota"], [/al\?quota/g, "alíquota"],
		[/Reten\?\?es/g, "Retenções"], [/reten\?\?es/g, "retenções"],
	];
	return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

function MunicipalityPicker({ draft, setDraft, error }: { draft: Draft; setDraft: (d: Draft) => void; error?: string }) {
	const [query, setQuery] = useState(draft.serviceMunicipalityName || "");
	const [options, setOptions] = useState<Municipality[]>([]);
	const [searching, setSearching] = useState(false);
	useEffect(() => { void fetch("/api/nfse/municipalities?q=__warm__").catch(() => undefined); }, []);
	useEffect(() => {
		if (query.trim().length < 2 || query === draft.serviceMunicipalityName) { setOptions([]); return; }
		const cacheKey = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
		const cached = municipalitySearchCache.get(cacheKey);
		if (cached) { setOptions(cached); setSearching(false); return; }
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			setSearching(true);
			try {
				const response = await fetch(`/api/nfse/municipalities?q=${encodeURIComponent(query)}`, { signal: controller.signal });
				const body = await response.json();
				if (response.ok) { const rows = body.municipalities || []; municipalitySearchCache.set(cacheKey, rows); setOptions(rows); }
			} finally { setSearching(false); }
		}, 80);
		return () => { clearTimeout(timer); controller.abort(); };
	}, [query, draft.serviceMunicipalityName]);
	return <label className="wide nfse-municipality">Município da prestação *
		<input value={query} onChange={(event) => { setQuery(event.target.value); setDraft({ ...draft, serviceMunicipalityIbge: "", serviceMunicipalityName: "", serviceMunicipalityUf: "" }); }} placeholder="Digite o nome ou código IBGE" autoComplete="off" />
		{searching && <small>Buscando municípios...</small>}
		{options.length > 0 && <div className="nfse-municipality-options">{options.map((option) => <button type="button" key={option.ibgeCode} onClick={() => { setDraft({ ...draft, serviceMunicipalityIbge: option.ibgeCode, serviceMunicipalityName: option.name, serviceMunicipalityUf: option.uf }); setQuery(option.name); setOptions([]); }}><b>{option.name}/{option.uf}</b><small>IBGE {option.ibgeCode}</small></button>)}</div>}
		{draft.serviceMunicipalityIbge && <small className="nfse-selected">Selecionado: {draft.serviceMunicipalityName}/{draft.serviceMunicipalityUf} · IBGE {draft.serviceMunicipalityIbge}</small>}
		{error && <small className="nfse-field-error">{error}</small>}
	</label>;
}

type IssueProps = { step: number; setStep: (n: number) => void; draft: Draft; setDraft: (d: Draft) => void; issuer?: Item; takers: Item[]; services: Item[]; cert?: Item; saveDraft: (e?: boolean) => Promise<void> | void; result?: Item; refresh: () => Promise<unknown>; busy: string; go: (a: Area) => void; simulation: boolean; production: boolean };

function TakerPicker({ takers, draft, setDraft, error }: { takers: Item[]; draft: Draft; setDraft: (d: Draft) => void; error?: string }) {
	const selected = takers.find((item) => item.id === draft.takerId);
	const [query, setQuery] = useState(selected?.legal_name || "");
	const [open, setOpen] = useState(false);
	const normalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
	const matches = takers.filter((item) => `${item.legal_name} ${item.tax_id}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(normalized)).slice(0, 8);
	return <label className="nfse-compact-picker">Tomador *<div className="nfse-search-input"><Search size={17}/><input value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); setDraft({ ...draft, takerId: "" }); }} placeholder="Busque por nome ou CPF/CNPJ"/>{query && <button type="button" onClick={() => { setQuery(""); setDraft({ ...draft, takerId: "" }); }}>×</button>}</div>{open && query.length > 0 && !draft.takerId && <div className="nfse-picker-options">{matches.map((item) => <button type="button" key={item.id} onClick={() => { setDraft({ ...draft, takerId: item.id }); setQuery(fiscalText(item.legal_name)); setOpen(false); }}><b>{fiscalText(item.legal_name)}</b><small>{item.tax_id}</small></button>)}{!matches.length && <small>Nenhum tomador encontrado.</small>}</div>}{error && <small className="nfse-field-error">{error}</small>}</label>;
}

function Issue(props: IssueProps) {
	const { draft, setDraft, takers, services, cert, saveDraft, result, refresh, busy, go, simulation, production } = props;
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [retentionsOpen, setRetentionsOpen] = useState(false);
	const [ibsOpen, setIbsOpen] = useState(false);
	const [notesOpen, setNotesOpen] = useState(false);
	const [resultOpen, setResultOpen] = useState(false);
	const selectedTaker = takers.find((item) => item.id === draft.takerId);
	const selectedService = services.find((item) => item.id === draft.serviceProfileId);
	const money = (value: string) => Number(value || 0);
	const net = Math.max(0, money(draft.amount) - money(draft.unconditionalDiscount));
	const iss = draft.issTaxation === "taxable" ? net * money(draft.issRate) / 100 : 0;
	function validate() {
		const next: Record<string, string> = {};
		if (!draft.takerId) next.taker = "Selecione o tomador do serviço.";
		if (!draft.competence) next.competence = "Informe a competência.";
		if (!draft.serviceProfileId) next.service = "Selecione o serviço cadastrado.";
		if (draft.description.trim().length < 3) next.description = "Informe a discriminação do serviço.";
		if (!/^\d{7}$/.test(draft.serviceMunicipalityIbge)) next.municipality = "Selecione um município nas sugestões.";
		if (!/^\d+\.\d{2}$/.test(draft.amount) || money(draft.amount) <= 0) next.amount = "Informe um valor válido no formato 0.00.";
		if (draft.issTaxation === "taxable" && !draft.issRate) next.issRate = "Informe a alíquota do ISS.";
		if (draft.ibsCbsEnabled) {
			if (!/^\d{6}$/.test(draft.ibsCbsOperationIndicator)) next.ibsOperation = "Informe os 6 dígitos do indicador.";
			if (!/^\d{3}$/.test(draft.ibsCbsTaxSituation)) next.ibsTax = "Informe os 3 dígitos do CST.";
			if (!/^\d{6}$/.test(draft.ibsCbsClassification)) next.ibsClass = "Informe os 6 dígitos da classificação.";
		}
		setErrors(next); return Object.keys(next).length === 0;
	}
	function chooseService(id: string) {
		const service = services.find((item) => item.id === id), taxation = service?.taxation || {};
		setDraft({ ...draft, serviceProfileId:id, description:fiscalText(service?.description) || draft.description, serviceMunicipalityIbge:service?.service_municipality_ibge || draft.serviceMunicipalityIbge, ibsCbsOperationIndicator:service?.operation_indicator || String(taxation.operationIndicator || draft.ibsCbsOperationIndicator), ibsCbsTaxSituation:service?.tax_situation || String(taxation.taxSituation || draft.ibsCbsTaxSituation), issRate:String(taxation.issRate || draft.issRate) });
	}
	const save = () => { if (validate()) void saveDraft(false); }, emit = () => { if (validate()) void saveDraft(true); };
	const terminalResult = ["authorized", "rejected", "technical_failure", "cancelled"].includes(result?.status || "");
	useEffect(() => { if (result?.id) setResultOpen(true); }, [result?.id]);
	useEffect(() => {
		if (!result?.id || terminalResult) return;
		const timer = window.setInterval(() => { void refresh(); }, 1500);
		return () => window.clearInterval(timer);
	}, [result?.id, terminalResult, refresh]);
	return <><PageTitle title="Emitir NFS-e" text="Preencha e revise todos os dados fiscais em uma única tela." />
		{result && resultOpen && <div className="nfse-issuance-overlay" role="dialog" aria-modal="true" aria-labelledby="nfse-issuance-title"><section className={`nfse-issuance-modal ${result.status || "queued"}`}><button className="nfse-modal-close" aria-label="Fechar acompanhamento" onClick={() => setResultOpen(false)}><X size={20}/></button><div className="nfse-issuance-icon">{result.status === "authorized" ? <CheckCircle2 size={42}/> : result.status === "rejected" || result.status === "technical_failure" ? <X size={42}/> : <LoaderCircle className="nfse-spinner" size={42}/>}</div><h2 id="nfse-issuance-title">{result.status === "authorized" ? "NFS-e autorizada" : result.status === "rejected" ? "Emissão rejeitada" : result.status === "technical_failure" ? "Não foi possível concluir a emissão" : "Emitindo NFS-e, aguarde"}</h2><p className="nfse-issuance-description">{result.status === "authorized" ? "A nota foi autorizada e os documentos fiscais já estão disponíveis." : terminalResult ? "O processamento foi encerrado. Revise os dados antes de tentar novamente." : "Sua nota foi recebida e está sendo processada. Esta janela será atualizada automaticamente."}</p>{!terminalResult && <div className="nfse-live-state"><span><Clock3 size={17}/> Atualização automática em tempo real</span><div className="nfse-progress-track"><i/></div><div className="nfse-process-steps"><b className="done">Recebida</b><b className={result.status !== "queued" ? "done" : "active"}>Processando</b><b>Autorização</b></div></div>}<div className="nfse-result-reference"><small>{result.status === "authorized" ? "Chave da NFS-e" : "Status atual"}</small><b>{result.official_key || ({queued:"Aguardando processamento",claimed:"Preparando a emissão",signing:"Assinando o documento",transmitting:"Transmitindo ao governo",reconciling:"Confirmando a autorização",unknown:"Consultando situação"} as Record<string,string>)[result.status || ""] || result.status || "Aguardando processamento"}</b></div>{result.status === "authorized" && <div className="nfse-result-downloads"><a className="btn secondary" href={`/api/nfse/invoices/${result.id}/xml`}><Download size={18}/> Baixar XML</a><a className="btn" href={`/api/nfse/invoices/${result.id}/pdf`}><Download size={18}/> Baixar PDF</a></div>}{terminalResult && <button className="nfse-modal-finish" onClick={() => setResultOpen(false)}>Fechar</button>}</section></div>}
		<div className="nfse-compact-layout"><div className="nfse-compact-main">
			<section className="card nfse-compact-card"><h2><UserRound size={18}/> Tomador e competência</h2><div className="nfse-compact-row taker"><TakerPicker takers={takers} draft={draft} setDraft={setDraft} error={errors.taker}/><label>Data de competência *<input type="date" value={draft.competence} onChange={(e) => setDraft({ ...draft, competence:e.target.value })}/>{errors.competence && <small className="nfse-field-error">{errors.competence}</small>}</label><button className="nfse-outline-action" onClick={() => go("registrations")}><UserRoundPlus size={17}/> Novo tomador</button></div>{selectedTaker && <div className="nfse-taker-strip"><Users size={21}/><div><b>{fiscalText(selectedTaker.legal_name)}</b><small>CNPJ/CPF: {selectedTaker.tax_id}　|　E-mail: {selectedTaker.email || "Não informado"}</small></div></div>}</section>
			<section className="card nfse-compact-card"><h2><Tags size={18}/> Serviço e códigos fiscais</h2><div className="nfse-service-top"><label>Serviço cadastrado *<select value={draft.serviceProfileId} onChange={(e) => chooseService(e.target.value)}><option value="">Selecione o serviço</option>{services.map((item) => <option key={item.id} value={item.id}>{fiscalText(item.name)}</option>)}</select>{errors.service && <small className="nfse-field-error">{errors.service}</small>}</label><div className="nfse-code-strip"><p><small>Código municipal</small><b>{selectedService?.municipal_code || "-"}</b></p><p><small>Código nacional</small><b>{selectedService?.national_code || "-"}</b></p><p><small>NBS</small><b>{selectedService?.nbs_code || "Não informado"}</b></p></div></div><div className="nfse-service-bottom"><label>Discriminação do serviço *<textarea maxLength={1000} value={draft.description} onChange={(e) => setDraft({ ...draft, description:e.target.value })}/><small>{draft.description.length}/1000 caracteres</small>{errors.description && <small className="nfse-field-error">{errors.description}</small>}</label><MunicipalityPicker draft={draft} setDraft={setDraft} error={errors.municipality}/></div></section>
			<section className="card nfse-compact-card"><h2><Coins size={18}/> Valores, ISS e retenções</h2><div className="nfse-values-grid"><label>Valor do serviço *<input value={draft.amount} onChange={(e) => setDraft({ ...draft, amount:e.target.value })}/>{errors.amount && <small className="nfse-field-error">{errors.amount}</small>}</label><label>Desconto incondicionado<input value={draft.unconditionalDiscount} onChange={(e) => setDraft({ ...draft, unconditionalDiscount:e.target.value })}/></label><label>Desconto condicionado<input value={draft.conditionalDiscount} onChange={(e) => setDraft({ ...draft, conditionalDiscount:e.target.value })}/></label><label>ISS retido? *<select value={draft.issWithholding} onChange={(e) => setDraft({ ...draft, issWithholding:e.target.value as Draft["issWithholding"] })}><option value="not_withheld">Não</option><option value="withheld">Sim</option></select></label><label>Alíquota do ISS (%) *<input value={draft.issRate} onChange={(e) => setDraft({ ...draft, issRate:e.target.value })}/>{errors.issRate && <small className="nfse-field-error">{errors.issRate}</small>}</label><label>Enquadramento do ISS *<select value={draft.issTaxation} onChange={(e) => setDraft({ ...draft, issTaxation:e.target.value as Draft["issTaxation"] })}><option value="taxable">Tributável</option><option value="immune">Imunidade</option><option value="export">Exportação</option><option value="not_incident">Não incidência</option></select></label></div><button className="nfse-expand-button" onClick={() => setRetentionsOpen(!retentionsOpen)}>{retentionsOpen ? <ChevronDown size={18}/> : <ChevronRight size={18}/>} Ver retenções federais (IR, INSS, PIS, COFINS, CSLL)</button>{retentionsOpen && <div className="nfse-retentions-grid">{[["IR", "irRetention"],["INSS", "inssRetention"],["PIS", "pisRetention"],["COFINS", "cofinsRetention"],["CSLL", "csllRetention"]].map(([label,key]) => <label key={key}>{label}<input value={draft[key as keyof Draft] as string} onChange={(e) => setDraft({ ...draft, [key]:e.target.value })}/></label>)}</div>}</section>
			<section className={`card nfse-compact-bar ${ibsOpen ? "open" : ""}`}><button className="nfse-bar-head" onClick={() => setIbsOpen(!ibsOpen)}><b><Layers3 size={18}/> IBS e CBS · Reforma Tributária</b><small>Opcional conforme o leiaute aplicável.</small><label onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={draft.ibsCbsEnabled} onChange={(e) => { setDraft({ ...draft, ibsCbsEnabled:e.target.checked }); if(e.target.checked) setIbsOpen(true); }}/> Informar IBS/CBS</label>{ibsOpen ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}</button>{ibsOpen && <div className="nfse-bar-content"><div className="nfse-values-grid"><label>Indicador de operação<input maxLength={6} value={draft.ibsCbsOperationIndicator} onChange={(e) => setDraft({ ...draft, ibsCbsOperationIndicator:e.target.value })}/>{errors.ibsOperation && <small className="nfse-field-error">{errors.ibsOperation}</small>}</label><label>CST IBS/CBS<input maxLength={3} value={draft.ibsCbsTaxSituation} onChange={(e) => setDraft({ ...draft, ibsCbsTaxSituation:e.target.value })}/>{errors.ibsTax && <small className="nfse-field-error">{errors.ibsTax}</small>}</label><label>Classificação tributária<input maxLength={6} value={draft.ibsCbsClassification} onChange={(e) => setDraft({ ...draft, ibsCbsClassification:e.target.value })}/>{errors.ibsClass && <small className="nfse-field-error">{errors.ibsClass}</small>}</label><label>Base de cálculo<input value={draft.ibsCbsBase} onChange={(e) => setDraft({ ...draft, ibsCbsBase:e.target.value })}/></label><label>IBS estadual (%)<input value={draft.ibsUfRate} onChange={(e) => setDraft({ ...draft, ibsUfRate:e.target.value })}/></label><label>IBS municipal (%)<input value={draft.ibsMunicipalRate} onChange={(e) => setDraft({ ...draft, ibsMunicipalRate:e.target.value })}/></label><label>CBS (%)<input value={draft.cbsRate} onChange={(e) => setDraft({ ...draft, cbsRate:e.target.value })}/></label></div></div>}</section>
			<section className={`card nfse-compact-bar ${notesOpen ? "open" : ""}`}><button className="nfse-bar-head" onClick={() => setNotesOpen(!notesOpen)}><b><NotebookText size={18}/> Informações complementares</b>{notesOpen ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}</button>{notesOpen && <div className="nfse-bar-content"><label>Observações e informações adicionais<textarea maxLength={2000} value={draft.additionalInformation} onChange={(e) => setDraft({ ...draft, additionalInformation:e.target.value })}/><small>{draft.additionalInformation.length}/2000 caracteres</small></label></div>}</section>
		</div><aside className="card nfse-compact-summary"><h2><ReceiptText size={19}/> Resumo da emissão</h2><p><small>Tomador</small><b title={fiscalText(selectedTaker?.legal_name)}>{fiscalText(selectedTaker?.legal_name) || "Não selecionado"}</b></p><p><small>Serviço</small><b title={fiscalText(selectedService?.name)}>{fiscalText(selectedService?.name) || "Não selecionado"}</b></p><p><small>Valor do serviço</small><b>{money(draft.amount).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</b></p><p><small>ISS estimado</small><b>{iss.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</b></p><div className={`nfse-cert-state ${cert ? "ok" : "pending"}`}><ShieldCheck size={20}/>{cert ? "Certificado pronto" : "Certificado pendente"}</div><div className="nfse-summary-actions"><button className="btn secondary" disabled={Boolean(busy)} onClick={save}><Save size={17}/> Salvar rascunho</button>{cert ? <button className="btn" disabled={Boolean(busy)} onClick={emit}><Send size={17}/>{busy === "issue" ? "Enfileirando..." : simulation ? "Emitir simulação" : production ? "Emitir NFS-e" : "Emitir em homologação"}</button> : <button className="btn" onClick={() => go("settings")}>Configurar certificado</button>}<button className="nfse-cancel" onClick={() => go("overview")}>Cancelar e voltar</button></div>{Object.keys(errors).length > 0 && <small className="nfse-field-error">Revise os campos destacados.</small>}</aside></div>
	</>;
}

function IssueExpanded({
	draft, setDraft, issuer, takers, services, cert, saveDraft, result, refresh, busy, go, simulation, production,
}: {
	step: number; setStep: (n: number) => void; draft: Draft; setDraft: (d: Draft) => void; issuer?: Item; takers: Item[]; services: Item[]; cert?: Item; saveDraft: (e?: boolean) => Promise<void> | void; result?: Item; refresh: () => Promise<unknown>; busy: string; go: (a: Area) => void; simulation: boolean; production: boolean;
}) {
	const [errors, setErrors] = useState<Record<string, string>>({});
	const selectedTaker = takers.find((item) => item.id === draft.takerId);
	const selectedService = services.find((item) => item.id === draft.serviceProfileId);
	const money = (value: string) => Number(value || 0);
	const net = Math.max(0, money(draft.amount) - money(draft.unconditionalDiscount));
	const iss = draft.issTaxation === "taxable" ? net * money(draft.issRate) / 100 : 0;
	const ibs = money(draft.ibsCbsBase) * (money(draft.ibsUfRate) + money(draft.ibsMunicipalRate)) / 100;
	const cbs = money(draft.ibsCbsBase) * money(draft.cbsRate) / 100;
	function validate() {
		const next: Record<string, string> = {};
		if (!draft.takerId) next.taker = "Selecione o tomador do serviço.";
		if (!draft.competence) next.competence = "Informe a data de competência.";
		if (!draft.serviceProfileId) next.service = "Selecione um serviço cadastrado.";
		if (draft.description.trim().length < 3) next.description = "Descreva o serviço prestado.";
		if (!/^\d{7}$/.test(draft.serviceMunicipalityIbge)) next.municipality = "Selecione um município na lista de resultados.";
		if (!/^\d+\.\d{2}$/.test(draft.amount) || money(draft.amount) <= 0) next.amount = "Informe um valor maior que zero no formato 0.00.";
		if (draft.issTaxation === "taxable" && !draft.issRate) next.issRate = "Informe a alíquota do ISS.";
		if (draft.ibsCbsEnabled) {
			if (!/^\d{6}$/.test(draft.ibsCbsOperationIndicator)) next.ibsOperation = "Informe os 6 dígitos do indicador oficial.";
			if (!/^\d{3}$/.test(draft.ibsCbsTaxSituation)) next.ibsTax = "Informe os 3 dígitos do CST IBS/CBS.";
			if (!/^\d{6}$/.test(draft.ibsCbsClassification)) next.ibsClass = "Informe os 6 dígitos da classificação tributária.";
			if (draft.ibsCbsPurpose !== "0" || !["0", "1"].includes(draft.ibsCbsDestinationIndicator)) next.ibsOperation = "Selecione uma finalidade e um destinatário aceitos pelo leiaute atual.";
		}
		setErrors(next);
		return Object.keys(next).length === 0;
	}
	function chooseService(id: string) {
		const service = services.find((item) => item.id === id);
		const taxation = service?.taxation || {};
		setDraft({ ...draft, serviceProfileId: id, description: service?.description || draft.description, serviceMunicipalityIbge: service?.service_municipality_ibge || draft.serviceMunicipalityIbge, ibsCbsOperationIndicator: service?.operation_indicator || String(taxation.operationIndicator || draft.ibsCbsOperationIndicator), ibsCbsTaxSituation: service?.tax_situation || String(taxation.taxSituation || draft.ibsCbsTaxSituation), issRate: String(taxation.issRate || draft.issRate) });
	}
	const emit = () => { if (validate()) void saveDraft(true); };
	const save = () => { if (validate()) void saveDraft(false); };
	return <>
		<PageTitle title="Emitir NFS-e" text="Preencha e revise todos os dados fiscais em uma única tela." />
		{result && <section className="card nfse-result nfse-result-inline"><CheckCircle2 /><div><h3>{result.status === "authorized" ? "NFS-e autorizada" : "Emissão em processamento"}</h3><p>{result.official_key || result.simulation_reference || "Aguardando processamento."}</p></div><button className="nfse-refresh" onClick={refresh}>Atualizar</button>{result.status === "authorized" && <><a className="btn secondary" href={`/api/nfse/invoices/${result.id}/xml`}>Baixar XML</a><a className="btn secondary" href={`/api/nfse/invoices/${result.id}/pdf`}>Baixar PDF</a></>}</section>}
		<div className="nfse-issue-layout"><div className="nfse-issue-main">
			<section className="card nfse-issue-section"><header><span>1</span><div><h2>Emitente e prestador</h2><p>Dados vinculados ao cadastro fiscal selecionado.</p></div></header><div className="nfse-readonly-grid"><p><small>Razão social</small><b>{issuer?.legal_name || "Não selecionado"}</b></p><p><small>CNPJ</small><b>{issuer?.tax_id || "-"}</b></p><p><small>Certificado digital</small><b className={cert ? "ok-text" : "error-text"}>{cert ? `Válido até ${new Date(cert.not_after || "").toLocaleDateString("pt-BR")}` : "Não configurado"}</b></p></div></section>
			<section className="card nfse-issue-section"><header><span>2</span><div><h2>Tomador e competência</h2><p>Identifique quem recebeu o serviço.</p></div></header><div className="nfse-form-grid"><label>Tomador *<select value={draft.takerId} onChange={(e) => setDraft({ ...draft, takerId: e.target.value })}><option value="">Selecione</option>{takers.map((item) => <option key={item.id} value={item.id}>{item.legal_name} - {item.tax_id}</option>)}</select>{errors.taker && <small className="nfse-field-error">{errors.taker}</small>}</label><label>Data de competência *<input type="date" value={draft.competence} onChange={(e) => setDraft({ ...draft, competence: e.target.value })}/>{errors.competence && <small className="nfse-field-error">{errors.competence}</small>}</label></div></section>
			<section className="card nfse-issue-section"><header><span>3</span><div><h2>Serviço e códigos fiscais</h2><p>O perfil fiscal preenche automaticamente os códigos conhecidos.</p></div></header><div className="nfse-form-grid"><label>Serviço cadastrado *<select value={draft.serviceProfileId} onChange={(e) => chooseService(e.target.value)}><option value="">Selecione</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{errors.service && <small className="nfse-field-error">{errors.service}</small>}</label><div className="nfse-code-summary"><small>Código nacional</small><b>{selectedService?.national_code || "-"}</b><small>Código municipal</small><b>{selectedService?.municipal_code || "-"}</b><small>NBS</small><b>{selectedService?.nbs_code || "Não informado"}</b></div><label className="wide">Discriminação do serviço *<textarea maxLength={1000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })}/><small>{draft.description.length}/1000 caracteres</small>{errors.description && <small className="nfse-field-error">{errors.description}</small>}</label><MunicipalityPicker draft={draft} setDraft={setDraft} error={errors.municipality}/></div></section>
			<section className="card nfse-issue-section"><header><span>4</span><div><h2>Valores, ISS e retenções</h2><p>Os campos adicionais aparecem conforme o enquadramento escolhido.</p></div></header><div className="nfse-form-grid"><label>Valor do serviço *<input value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })}/>{errors.amount && <small className="nfse-field-error">{errors.amount}</small>}</label><label>Desconto incondicionado<input value={draft.unconditionalDiscount} onChange={(e) => setDraft({ ...draft, unconditionalDiscount: e.target.value })}/></label><label>Desconto condicionado<input value={draft.conditionalDiscount} onChange={(e) => setDraft({ ...draft, conditionalDiscount: e.target.value })}/></label><label>Enquadramento do ISS<select value={draft.issTaxation} onChange={(e) => setDraft({ ...draft, issTaxation: e.target.value as Draft["issTaxation"] })}><option value="taxable">Tributável</option><option value="immune">Imunidade</option><option value="export">Exportação</option><option value="not_incident">Não incidência</option></select></label><label>ISS retido?<select value={draft.issWithholding} onChange={(e) => setDraft({ ...draft, issWithholding: e.target.value as Draft["issWithholding"] })}><option value="not_withheld">Não</option><option value="withheld">Sim</option></select></label>{draft.issTaxation === "taxable" && <label>Alíquota do ISS (%)<input value={draft.issRate} onChange={(e) => setDraft({ ...draft, issRate: e.target.value })}/>{errors.issRate && <small className="nfse-field-error">{errors.issRate}</small>}</label>}{draft.issWithholding === "withheld" && <div className="nfse-conditional wide">O ISS será destacado como retido. Confira o município de recolhimento e a responsabilidade tributária antes de emitir.</div>}</div></section>
			<section className="card nfse-issue-section nfse-ibs"><header><span>5</span><div><h2>IBS e CBS - Reforma Tributária</h2><p>Grupo declaratório evolutivo conforme o leiaute nacional aplicável.</p></div><label className="nfse-switch"><input type="checkbox" checked={draft.ibsCbsEnabled} onChange={(e) => setDraft({ ...draft, ibsCbsEnabled: e.target.checked })}/><i/>Informar</label></header>{!draft.ibsCbsEnabled ? <div className="nfse-info">Opcional para esta emissão. Nenhum campo IBS/CBS será enviado ao XML.</div> : <><div className="nfse-warning">Use somente códigos oficiais revisados. Os valores abaixo são estimativas; a autorização governamental determina os valores fiscais definitivos.</div><div className="nfse-form-grid"><label>Finalidade<select value={draft.ibsCbsPurpose} onChange={(e) => setDraft({ ...draft, ibsCbsPurpose: e.target.value })}><option value="0">NFS-e regular</option><option value="1">Crédito</option><option value="2">Débito</option></select></label><label>Indicador de operação *<input value={draft.ibsCbsOperationIndicator} onChange={(e) => setDraft({ ...draft, ibsCbsOperationIndicator: e.target.value })} placeholder="Código oficial"/>{errors.ibsOperation && <small className="nfse-field-error">{errors.ibsOperation}</small>}</label><label>Indicador do destinatário<select value={draft.ibsCbsDestinationIndicator} onChange={(e) => setDraft({ ...draft, ibsCbsDestinationIndicator: e.target.value })}><option value="0">Tomador é o destinatário</option><option value="1">Destinatário diferente</option><option value="2">Sem destinatário</option></select></label><label>CST IBS/CBS *<input value={draft.ibsCbsTaxSituation} onChange={(e) => setDraft({ ...draft, ibsCbsTaxSituation: e.target.value })}/>{errors.ibsTax && <small className="nfse-field-error">{errors.ibsTax}</small>}</label><label>Classificação tributária *<input value={draft.ibsCbsClassification} onChange={(e) => setDraft({ ...draft, ibsCbsClassification: e.target.value })}/>{errors.ibsClass && <small className="nfse-field-error">{errors.ibsClass}</small>}</label><label>Base de cálculo<input value={draft.ibsCbsBase} onChange={(e) => setDraft({ ...draft, ibsCbsBase: e.target.value })}/></label><label>Alíquota IBS estadual (%)<input value={draft.ibsUfRate} onChange={(e) => setDraft({ ...draft, ibsUfRate: e.target.value })}/></label><label>Alíquota IBS municipal (%)<input value={draft.ibsMunicipalRate} onChange={(e) => setDraft({ ...draft, ibsMunicipalRate: e.target.value })}/></label><label>Alíquota CBS (%)<input value={draft.cbsRate} onChange={(e) => setDraft({ ...draft, cbsRate: e.target.value })}/></label><label>Crédito IBS<input value={draft.ibsCredit} onChange={(e) => setDraft({ ...draft, ibsCredit: e.target.value })}/></label><label>Crédito CBS<input value={draft.cbsCredit} onChange={(e) => setDraft({ ...draft, cbsCredit: e.target.value })}/></label></div></>}</section>
			<section className="card nfse-issue-section"><header><span>6</span><div><h2>Informações complementares</h2><p>Observações que devem acompanhar a operação.</p></div></header><div className="nfse-form-grid"><label className="wide">Informações adicionais<textarea maxLength={2000} value={draft.additionalInformation} onChange={(e) => setDraft({ ...draft, additionalInformation: e.target.value })}/><small>{draft.additionalInformation.length}/2000 caracteres</small></label></div></section>
		</div><aside className="card nfse-issue-summary"><h2>Resumo da emissão</h2><p><small>Tomador</small><b>{selectedTaker?.legal_name || "Não selecionado"}</b></p><p><small>Serviço</small><b>{selectedService?.name || "Não selecionado"}</b></p><p><small>Valor líquido</small><b>{net.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b></p><p><small>ISS estimado</small><b>{iss.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b></p>{draft.ibsCbsEnabled && <><p><small>IBS estimado</small><b>{ibs.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b></p><p><small>CBS estimada</small><b>{cbs.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b></p></>}<div className={`nfse-cert-state ${cert ? "ok" : "pending"}`}><ShieldCheck />{cert ? "Certificado pronto" : "Certificado pendente"}</div><div className="nfse-summary-actions"><button className="btn secondary" disabled={Boolean(busy)} onClick={save}>Salvar rascunho</button><button className="btn secondary" type="button" onClick={() => validate()}>Validar dados</button>{cert ? <button className="btn" disabled={Boolean(busy)} onClick={emit}>{busy === "issue" ? "Enfileirando..." : simulation ? "Emitir simulação" : production ? "Emitir NFS-e" : "Emitir em homologação"}</button> : <button className="btn" onClick={() => go("settings")}>Configurar certificado</button>}<button className="nfse-cancel" onClick={() => go("overview")}>Cancelar e voltar</button></div>{Object.keys(errors).length > 0 && <small className="nfse-field-error">Revise os campos destacados antes de continuar.</small>}</aside></div>
	</>;
}

function IssueLegacy({
	step,
	setStep,
	draft,
	setDraft,
	issuer,
	takers,
	services,
	cert,
	saveDraft,
	result,
	refresh,
	busy,
	go,
	simulation,
	production,
}: {
	step: number;
	setStep: (n: number) => void;
	draft: Draft;
	setDraft: (d: Draft) => void;
	issuer?: Item;
	takers: Item[];
	services: Item[];
	cert?: Item;
	saveDraft: (e?: boolean) => Promise<void> | void;
	result?: Item;
	refresh: () => Promise<unknown>;
	busy: string;
	go: (a: Area) => void;
	simulation: boolean;
	production: boolean;
}) {
	const [deliveryEmail, setDeliveryEmail] = useState("");
	const [deliveryMessage, setDeliveryMessage] = useState("");
	const selectedTaker = takers.find((x) => x.id === draft.takerId),
		selectedService = services.find((x) => x.id === draft.serviceProfileId);
	async function prepareDelivery(){if(!result)return;setDeliveryMessage("Preparando distribuição…");const response=await fetch(`/api/nfse/invoices/${result.id}/deliveries`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipientEmail:deliveryEmail,idempotencyKey:crypto.randomUUID()})}),body=await response.json();setDeliveryMessage(response.ok?body.message:body.error||"Não foi possível preparar a distribuição.")}
	return (
		<>
			<PageTitle
				title="Emitir NFS-e"
				text={`Etapa ${step} de 6 - ${["Pessoas e competência", "Serviço e códigos fiscais", "Local da operação", "Valores e tributação", "Revisão", "Resultado"][step - 1]}`}
			/>
			<div className="nfse-steps">
				{["Pessoas", "Serviço", "Local", "Valores", "Revisão", "Resultado"].map(
					(x, i) => (
						<span key={x} className={step >= i + 1 ? "active" : ""}>
							<i>{i + 1}</i>
							{x}
						</span>
					),
				)}
			</div>
			<section className="card nfse-wizard">
				{step === 1 && (
					<>
						<h2>Selecione o tomador</h2>
						<p>Escolha um cadastro existente para esta nota.</p>
						<select
							value={draft.takerId}
							onChange={(e) => setDraft({ ...draft, takerId: e.target.value })}
						>
							<option value="">Selecione um tomador</option>
							{takers.map((x) => (
								<option key={x.id} value={x.id}>
									{x.legal_name} - {x.tax_id}
								</option>
							))}
						</select>
						<label className="nfse-field-block">Competência<input type="date" value={draft.competence} onChange={(e) => setDraft({ ...draft, competence: e.target.value })} /></label>
						{!takers.length && (
							<p className="notice">
								Nenhum tomador cadastrado. Use Cadastros fiscais para adicionar.
							</p>
						)}
					</>
				)}
				{step === 2 && (
					<>
						<h2>Serviço e códigos fiscais</h2>
						<div className="nfse-form-grid">
							<label>
								Serviço
								<select
									value={draft.serviceProfileId}
									onChange={(e) =>
										setDraft({ ...draft, serviceProfileId: e.target.value })
									}
								>
									<option value="">Selecione o serviço</option>
									{services.map((x) => (
										<option key={x.id} value={x.id}>
											{x.name}
										</option>
									))}
								</select>
							</label>
							<div className="nfse-code-summary"><small>Código nacional</small><b>{selectedService?.national_code || "Defina no perfil fiscal"}</b><small>NBS</small><b>{selectedService?.nbs_code || "Não informado"}</b></div>
							<label className="wide">
								Descrição
								<textarea
									value={draft.description}
									onChange={(e) =>
										setDraft({ ...draft, description: e.target.value })
									}
								/>
							</label>
						</div>
					</>
				)}
				{step === 3 && <><h2>Local e particularidades da operação</h2><div className="nfse-form-grid"><label>Município da prestação (IBGE)<input inputMode="numeric" maxLength={7} value={draft.serviceMunicipalityIbge} onChange={(e) => setDraft({...draft,serviceMunicipalityIbge:e.target.value.replace(/\D/g,"")})}/><small>Informe os sete dígitos do município onde o serviço foi prestado.</small></label><label className="wide">Informações complementares<textarea value={draft.additionalInformation} onChange={(e)=>setDraft({...draft,additionalInformation:e.target.value})}/></label></div><div className="notice">Este fluxo cobre serviço nacional sem intermediário, obra, evento, exterior ou compra governamental.</div></>}
				{step === 4 && <><h2>Valores e tributação</h2><div className="nfse-form-grid"><label>Valor do serviço<input value={draft.amount} onChange={(e)=>setDraft({...draft,amount:e.target.value})}/></label><label>Desconto incondicionado<input value={draft.unconditionalDiscount} onChange={(e)=>setDraft({...draft,unconditionalDiscount:e.target.value})}/></label><label>Desconto condicionado<input value={draft.conditionalDiscount} onChange={(e)=>setDraft({...draft,conditionalDiscount:e.target.value})}/></label><label>Enquadramento do ISS<select value={draft.issTaxation} onChange={(e)=>setDraft({...draft,issTaxation:e.target.value as Draft["issTaxation"]})}><option value="taxable">Tributável</option><option value="immune">Imunidade</option><option value="export">Exportação</option><option value="not_incident">Não incidência</option></select></label><label>Retenção do ISS<select value={draft.issWithholding} onChange={(e)=>setDraft({...draft,issWithholding:e.target.value as Draft["issWithholding"]})}><option value="not_withheld">Não retido</option><option value="withheld">Retido</option></select></label>{draft.issTaxation==="taxable"&&<label>Alíquota ISS (%)<input value={draft.issRate} onChange={(e)=>setDraft({...draft,issRate:e.target.value})}/><small>Não é o percentual aproximado do Simples.</small></label>}</div></>}
				{step === 5 && (
					<>
						<h2>Revise antes de emitir</h2>
						<div className="nfse-review">
							<p>
								<small>Emitente</small>
								<b>{issuer?.legal_name}</b>
							</p>
							<p>
								<small>Tomador</small>
								<b>{selectedTaker?.legal_name}</b>
							</p>
							<p>
								<small>Serviço</small>
								<b>{selectedService?.name}</b>
							</p>
							<p>
								<small>Competência</small>
								<b>{draft.competence}</b>
							</p>
							<p>
								<small>Valor total</small>
								<b>R$ {draft.amount}</b>
							</p>
							<p><small>Local da prestação</small><b>{draft.serviceMunicipalityIbge}</b><button className="nfse-edit-section" onClick={()=>setStep(3)}>Editar</button></p>
							<p><small>ISS</small><b>{draft.issTaxation} · {draft.issWithholding}</b><button className="nfse-edit-section" onClick={()=>setStep(4)}>Editar</button></p>
							<p>
								<small>Ambiente</small>
								<b>{simulation ? "Simulação local" : production ? "Produção governamental, com valor fiscal" : "Homologação governamental"}</b>
							</p>
						</div>
						<div className={`nfse-cert-state ${cert ? "ok" : "pending"}`}>
							<ShieldCheck />
							{cert
								? `Certificado válido até ${new Date(cert.not_after || "").toLocaleDateString("pt-BR")}`
								: "Certificado pendente, configure antes de emitir"}
						</div>
					</>
				)}
				{step === 6 && (
					<>
						<h2>Resultado do processamento</h2>
						{result ? (
							<div className="nfse-result">
								<CheckCircle2 />
								<h3>
									{result.status === "authorized"
										? simulation ? "NFS-e simulada autorizada" : production ? "NFS-e autorizada em produção" : "NFS-e autorizada em homologação"
										: "Processando a solicitação"}
								</h3>
								<p>
									{result.official_key || result.simulation_reference ||
										"Aguarde a conclusão do processamento."}
								</p>
								{result.status === "authorized" && (
									<>
										<a className="btn" href={`/api/nfse/invoices/${result.id}/xml`}>Baixar XML</a>
										<a className="btn secondary" href={`/api/nfse/invoices/${result.id}/pdf`}>Baixar PDF</a>
									</>
								)}
								<button className="nfse-refresh" onClick={refresh}>
									Atualizar resultado
								</button>
								{result.status === "authorized" && <div className="nfse-delivery"><h4>Distribuição fiscal manual</h4><p>Prepare o destinatário sem enviar e-mail automaticamente.</p><input type="email" value={deliveryEmail} onChange={(e)=>setDeliveryEmail(e.target.value)} placeholder="E-mail do destinatário"/><button className="nfse-refresh" disabled={!deliveryEmail} onClick={()=>void prepareDelivery()}>Preparar distribuição</button>{deliveryMessage&&<small role="status">{deliveryMessage}</small>}</div>}
							</div>
						) : (
							<p>Preparando resultado…</p>
						)}
					</>
				)}
				<div className="nfse-wizard-actions">
					{step > 1 && step < 6 && (
						<button className="btn secondary" onClick={() => setStep(step - 1)}>
							Voltar
						</button>
					)}
					{step < 5 && (
						<button
							className="btn secondary"
							onClick={() => void saveDraft(false)}
						>
							Salvar rascunho
						</button>
					)}
					{step < 5 && (
						<button
							className="btn"
							disabled={
								(step === 1 && !draft.takerId) ||
								(step === 2 && (!draft.serviceProfileId || !draft.description)) ||
								(step === 3 && !/^\d{7}$/.test(draft.serviceMunicipalityIbge)) ||
								(step === 4 && (!/^\d+\.\d{2}$/.test(draft.amount) || (draft.issTaxation === "taxable" && !draft.issRate)))
							}
							onClick={() => setStep(step + 1)}
						>
							Continuar
						</button>
					)}
					{step === 5 && (
						<>
							<button
								className="btn secondary"
								disabled={Boolean(busy)}
								onClick={() => void saveDraft(false)}
							>
								Salvar rascunho
							</button>
							{cert ? <button
								className="btn"
								disabled={Boolean(busy)}
								onClick={() => void saveDraft(true)}
							>
								{busy === "issue" && <LoaderCircle className="nfse-spinner" size={17} />}
								{busy === "issue" ? "Enfileirando…" : simulation ? "Emitir em simulação" : production ? "Emitir NFS-e com valor fiscal" : "Emitir em homologação"}
							</button> : <button className="btn" onClick={() => go("settings")}>Configurar certificado</button>}
						</>
					)}
				</div>
			</section>
		</>
	);
}
function Registrations({
	issuer,
	submit,
	busy,
}: {
	issuer?: Item;
	submit: (k: string, f: FormData) => Promise<boolean>;
	busy: boolean;
}) {
	return (
		<>
			<PageTitle
				title="Cadastros fiscais"
				text="Gerencie empresas emissoras, serviços e tomadores."
			/>
			<div className="nfse-grid">
				<section className="card nfse-card">
					<h2>Empresas emissoras</h2>
					<p className="hint">Dados fiscais usados na identificação do prestador.</p>
					<form onSubmit={async (event) => { event.preventDefault(); const target = event.currentTarget; if (await submit("issuer", new FormData(target))) target.reset(); }}>
						<label>CNPJ *<input name="taxId" placeholder="00.000.000/0000-00" required /></label>
						<label>Razão social *<input name="legalName" placeholder="Razão social do emitente" required /></label>
						<label>Município IBGE *<input name="municipalityIbge" placeholder="Código com 7 dígitos" required /></label>
						<label>Regime tributário *<input name="taxRegime" placeholder="Informe o regime" required /></label>
						<label>Opção pelo Simples *<select name="simpleNationalOption" defaultValue="" required><option value="" disabled>Selecione conforme cadastro fiscal</option><option value="1">Não optante</option><option value="2">Optante - MEI</option><option value="3">Optante - demais</option></select></label>
						<label>Regime de apuração no Simples *<select name="simpleNationalTaxationRegime" defaultValue="" required><option value="" disabled>Selecione</option><option value="1">Regime 1</option><option value="2">Regime 2</option><option value="3">Regime 3</option></select></label>
						<label>Código do regime especial *<input name="specialTaxRegime" placeholder="Um dígito" inputMode="numeric" maxLength={1} required /></label>
						<label>Série DPS *<input name="dpsSeries" placeholder="Série da DPS" defaultValue="1" required /></label>
						<button disabled={busy}>{busy ? "Salvando…" : "Cadastrar emitente"}</button>
					</form>
				</section>
				<section className="card nfse-card">
					<h2>Serviços</h2>
					<p className="hint">Perfis reutilizáveis para preenchimento automático da emissão.</p>
					{issuer ? (
						<form onSubmit={async (event) => { event.preventDefault(); const target = event.currentTarget; if (await submit("service", new FormData(target))) target.reset(); }}>
							<input type="hidden" name="issuerId" value={issuer.id} />
							<label>Nome do serviço *<input name="name" placeholder="Ex.: Serviços de contabilidade" required /></label>
							<label>Código nacional *<input name="nationalCode" placeholder="Código de tributação nacional" required /></label>
							<label>Código municipal <small>Opcional</small><input name="municipalCode" placeholder="Quando exigido pelo município" /></label>
							<label>NBS <small>Opcional</small><input name="nbsCode" placeholder="Quando aplicável" /></label>
							<label className="wide">Descrição fiscal *<input name="description" placeholder="Descrição usada nas novas emissões" required /></label>
							<button disabled={busy}>{busy ? "Salvando…" : "Cadastrar serviço"}</button>
						</form>
					) : (
						<p className="nfse-empty">Cadastre um emitente primeiro.</p>
					)}
				</section>
				<section className="card nfse-card">
					<h2>Tomadores</h2>
					<p className="hint">Clientes que poderão ser selecionados durante a emissão.</p>
					{issuer ? (
						<form onSubmit={async (event) => { event.preventDefault(); const target = event.currentTarget; if (await submit("taker", new FormData(target))) target.reset(); }}>
							<input type="hidden" name="issuerId" value={issuer.id} />
							<label>CNPJ do tomador *<input name="taxId" placeholder="00.000.000/0000-00" inputMode="numeric" autoComplete="off" required /></label>
							<label>Razão social *<input name="legalName" placeholder="Nome ou razão social" required /></label>
							<label className="wide">E-mail <small>Opcional</small><input name="email" type="email" placeholder="cliente@empresa.com.br" /></label>
							<button disabled={busy}>{busy ? "Salvando…" : "Cadastrar tomador"}</button>
						</form>
					) : (
						<p className="nfse-empty">Cadastre um emitente primeiro.</p>
					)}
				</section>
			</div>
		</>
	);
}
type RepresentationRecord = {
	id: string;
	issuer_id: string;
	status?: string;
	tax_id?: string;
	legal_name?: string;
	nfse_issuers?: { tax_id?: string; legal_name?: string } | Array<{ tax_id?: string; legal_name?: string }>;
};
type RepresentedCompanyDraft = {
	taxId: string;
	legalName: string;
	municipalityIbge: string;
	municipalityName?: string;
	uf?: string;
	simpleNationalOption: "1" | "2" | "3";
	simpleNationalTaxationRegime: "1" | "2";
	specialTaxRegime: string;
	dpsSeries: string;
};

function onlyDigits(value?: string) {
	return (value || "").replace(/\D/g, "");
}

function formatTaxId(value?: string) {
	const digits = onlyDigits(value);
	if (digits.length <= 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
	return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function maskTaxId(value: string) {
	const digits = onlyDigits(value).slice(0, 14);
	if (digits.length <= 11) return digits.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
	return digits.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function representationIssuer(record: RepresentationRecord) {
	const relation = Array.isArray(record.nfse_issuers) ? record.nfse_issuers[0] : record.nfse_issuers;
	return { taxId: record.tax_id || relation?.tax_id, legalName: record.legal_name || relation?.legal_name };
}

function RepresentationWorkspace({ data, onIssuerChange, refresh }: { data: Data; onIssuerChange: (id: string) => void; refresh: () => Promise<unknown> }) {
	const [taxIdInput, setTaxIdInput] = useState("");
	const [candidate, setCandidate] = useState<Item | null>(null);
	const [representations, setRepresentations] = useState<RepresentationRecord[]>([]);
	const [password, setPassword] = useState("");
	const [recoveryEmail, setRecoveryEmail] = useState("");
	const [officialAuthorization, setOfficialAuthorization] = useState(false);
	const [busy, setBusy] = useState(false);
	const [lookupBusy, setLookupBusy] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [companyDraft, setCompanyDraft] = useState<RepresentedCompanyDraft | null>(null);

	const loadRepresentations = useCallback(async () => {
		const response = await fetch("/api/nfse/representations", { cache: "no-store" });
		if (!response.ok) return;
		const body = await response.json();
		setRepresentations(body.representations || []);
	}, []);
	useEffect(() => { void loadRepresentations(); }, [loadRepresentations]);

	async function locate(raw = taxIdInput) {
		setFeedback("");
		setCompanyDraft(null);
		const digits = onlyDigits(raw);
		if (digits.length !== 11 && digits.length !== 14) return setFeedback("Informe um CPF ou CNPJ válido.");
		const found = data.issuers.find((item) => onlyDigits(item.tax_id) === digits);
		if (found) {
			setCandidate(found);
			onIssuerChange(found.id);
			setTaxIdInput(formatTaxId(found.tax_id));
			return;
		}
		if (digits.length !== 14) return setFeedback("O cadastro automático está disponível para CNPJ. O suporte fiscal a emitentes pessoa física depende do município.");
		setLookupBusy(true);
		try {
			const response = await fetch(`/api/nfse/company-lookup?cnpj=${digits}`, { cache: "no-store" });
			const body = await response.json();
			setCompanyDraft({ taxId: digits, legalName: body.legalName || "", municipalityIbge: body.municipalityIbge || "", municipalityName: body.municipalityName || "", uf: body.uf || "", simpleNationalOption: body.simpleNationalOption || "1", simpleNationalTaxationRegime: "1", specialTaxRegime: "0", dpsSeries: "1" });
			setFeedback(response.ok ? "Confira os dados fiscais encontrados antes de continuar." : body.error || "Complete os dados fiscais para cadastrar a empresa.");
		} catch { setCompanyDraft({ taxId: digits, legalName: "", municipalityIbge: "", simpleNationalOption: "1", simpleNationalTaxationRegime: "1", specialTaxRegime: "0", dpsSeries: "1" }); setFeedback("Não foi possível consultar os dados agora. Preencha os campos abaixo."); }
		finally { setLookupBusy(false); }
	}

	async function registerRepresentedCompany(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!companyDraft || busy) return;
		setBusy(true); setFeedback("");
		try {
			const response = await fetch("/api/nfse/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "issuer", taxId: companyDraft.taxId, legalName: companyDraft.legalName, municipalityIbge: companyDraft.municipalityIbge, taxRegime: companyDraft.simpleNationalOption === "1" ? "Regime normal" : "Simples Nacional", simpleNationalOption: companyDraft.simpleNationalOption, simpleNationalTaxationRegime: companyDraft.simpleNationalTaxationRegime, specialTaxRegime: companyDraft.specialTaxRegime, dpsSeries: companyDraft.dpsSeries }) });
			const body = await response.json();
			if (!response.ok) throw new Error(body.error || "Não foi possível cadastrar a empresa representada.");
			const registered = { id: body.id, tax_id: companyDraft.taxId, legal_name: companyDraft.legalName };
			setCandidate(registered); setCompanyDraft(null); onIssuerChange(body.id);
			setFeedback("Empresa cadastrada. Agora confirme a autorização e defina a senha inicial do cliente.");
			await refresh();
		} catch (error) { setFeedback(error instanceof Error ? error.message : "Não foi possível cadastrar a empresa."); }
		finally { setBusy(false); }
	}

	async function confirmRepresentation(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!candidate || busy) return;
		if (!officialAuthorization) return setFeedback("Confirme que a autorização já está válida no ambiente oficial da NFS-e.");
		if (password.length < 8) return setFeedback("A senha inicial deve ter pelo menos 8 caracteres.");
		const representativeCertificate = data.certificates.find((item) => item.status === "active" && onlyDigits(item.subject_tax_id) !== onlyDigits(candidate.tax_id));
		if (!representativeCertificate) return setFeedback("Não há certificado ativo do escritório disponível para representar esta empresa.");
		setBusy(true); setFeedback("");
		try {
			const representationResponse = await fetch("/api/nfse/representations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ issuerId: candidate.id, certificateId: representativeCertificate.id, authorizationType: "electronic_power_of_attorney", allowClientIssuance: true, allowCancellation: false }) });
			const representationBody = await representationResponse.json();
			if (!representationResponse.ok) throw new Error(representationBody.error || "Não foi possível cadastrar a representação.");
			const accountResponse = await fetch("/api/nfse/representations/client-account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ issuerId: candidate.id, name: candidate.legal_name, password, recoveryEmail: recoveryEmail || null }) });
			const accountBody = await accountResponse.json();
			if (!accountResponse.ok && accountResponse.status !== 409) throw new Error(accountBody.error || "Não foi possível criar o acesso do cliente.");
			setFeedback(accountResponse.ok ? `Representação configurada. O login do cliente é ${formatTaxId(accountBody.loginTaxId)}.` : `Representação configurada. ${accountBody.error}`);
			setPassword(""); setOfficialAuthorization(false);
			await Promise.all([loadRepresentations(), refresh()]);
		} catch (error) { setFeedback(error instanceof Error ? error.message : "Não foi possível concluir a configuração."); }
		finally { setBusy(false); }
	}

	return <>
		<PageTitle title="Representação" text="Acesse e configure empresas autorizadas para emissão de NFS-e." />
		<section className="card nfse-card full nfse-representation-shell">
			<h2>Representar</h2>
			<div className="nfse-representation-info">Se você já possui autorização para usar o Sistema Nacional da NFS-e em nome de outra pessoa física ou jurídica, informe o CPF/CNPJ abaixo. A procuração eletrônica ou representação legal precisa estar válida no ambiente oficial.</div>
			<label className="nfse-representation-taxid">CPF/CNPJ que deseja representar *
				<div><input value={taxIdInput} onChange={(event) => { setTaxIdInput(maskTaxId(event.target.value)); setCandidate(null); setCompanyDraft(null); }} inputMode="numeric" placeholder="00.000.000/0000-00" maxLength={18} />
				<button type="button" disabled={lookupBusy} onClick={() => void locate()}>{lookupBusy ? <LoaderCircle className="nfse-spinner" size={18} /> : <LogIn size={18} />} {lookupBusy ? "Consultando…" : "Representar"}</button></div>
			</label>
			{companyDraft && <form className="nfse-representation-onboarding" onSubmit={registerRepresentedCompany}>
				<div className="nfse-represented-company"><UserRoundPlus size={26} /><div><small>Novo emitente representado</small><strong>{formatTaxId(companyDraft.taxId)}</strong><span>Confira os dados necessários para a emissão fiscal.</span></div></div>
				<div className="nfse-onboarding-grid">
					<label className="wide">Razão social *<input value={companyDraft.legalName} onChange={(event) => setCompanyDraft({ ...companyDraft, legalName: event.target.value })} required /></label>
					<label>Município IBGE *<input value={companyDraft.municipalityIbge} onChange={(event) => setCompanyDraft({ ...companyDraft, municipalityIbge: onlyDigits(event.target.value).slice(0, 7) })} inputMode="numeric" pattern="\d{7}" required />{companyDraft.municipalityName && <small>{companyDraft.municipalityName}/{companyDraft.uf}</small>}</label>
					<label>Opção pelo Simples *<select value={companyDraft.simpleNationalOption} onChange={(event) => setCompanyDraft({ ...companyDraft, simpleNationalOption: event.target.value as RepresentedCompanyDraft["simpleNationalOption"] })}><option value="1">Não optante</option><option value="2">Optante - MEI</option><option value="3">Optante - ME/EPP</option></select></label>
					<label>Apuração do Simples *<select value={companyDraft.simpleNationalTaxationRegime} onChange={(event) => setCompanyDraft({ ...companyDraft, simpleNationalTaxationRegime: event.target.value as "1" | "2" })}><option value="1">Tributos federais e ISS pelo Simples</option><option value="2">Tributos federais pelo Simples e ISS pela NFS-e</option></select></label>
					<label>Regime especial *<select value={companyDraft.specialTaxRegime} onChange={(event) => setCompanyDraft({ ...companyDraft, specialTaxRegime: event.target.value })}><option value="0">Nenhum</option><option value="1">Microempresa municipal</option><option value="2">Estimativa</option><option value="3">Sociedade de profissionais</option><option value="4">Cooperativa</option><option value="5">MEI</option><option value="6">ME/EPP</option></select></label>
					<label>Série DPS *<input value={companyDraft.dpsSeries} onChange={(event) => setCompanyDraft({ ...companyDraft, dpsSeries: event.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 5) })} required /></label>
				</div>
				<button disabled={busy}>{busy ? "Cadastrando…" : "Cadastrar e continuar"}</button>
			</form>}
			{candidate && <form className="nfse-representation-confirm" onSubmit={confirmRepresentation}>
				<div className="nfse-represented-company"><Handshake size={26} /><div><small>Empresa localizada</small><strong>{candidate.legal_name}</strong><span>{formatTaxId(candidate.tax_id)}</span></div></div>
				<label className="nfse-official-confirm"><input type="checkbox" checked={officialAuthorization} onChange={(event) => setOfficialAuthorization(event.target.checked)} /> <span>Confirmo que a procuração eletrônica ou representação legal já está válida no ambiente oficial da NFS-e.</span></label>
				<div className="nfse-client-access"><h3>Acesso do cliente representado</h3><p>O nome será <b>{candidate.legal_name}</b> e o login será o CNPJ acima. Defina somente a senha inicial.</p>
					<label>Senha inicial *<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></label>
					<label>E-mail de recuperação <small>Opcional</small><input type="email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} /></label>
				</div>
				<button disabled={busy}>{busy ? "Configurando…" : "Confirmar representação e criar acesso"}</button>
			</form>}
			{feedback && <div className="nfse-inline-feedback" role="status">{feedback}</div>}
			<div className="nfse-recent-representations"><h2>Representações recentes</h2>
				{representations.length ? representations.map((record) => { const represented = representationIssuer(record); return <div className="nfse-recent-representation" key={record.id}><UserRound size={25} /><div><strong>{represented.legalName || "Empresa representada"}</strong><span>{formatTaxId(represented.taxId)}</span></div><button type="button" title="Representar esta empresa" onClick={() => { const item = data.issuers.find((issuer) => issuer.id === record.issuer_id); if (item) { setCandidate(item); setTaxIdInput(formatTaxId(item.tax_id)); onIssuerChange(item.id); } }}><LogIn size={21} /></button></div>; }) : <p className="nfse-empty">Nenhuma representação cadastrada.</p>}
			</div>
		</section>
	</>;
}

function CertificateSettingsSimple({ issuer, cert, setMessage, refresh }: { issuer?: Item; cert?: Item; setMessage: (message: string) => void; refresh: () => Promise<unknown> }) {
	const [uploading, setUploading] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [identifierBusy, setIdentifierBusy] = useState(false);
	return <><PageTitle title="Configurações" text="Certificado digital e acesso do escritório." /><section className="card nfse-card full"><h2>Certificado A1</h2>
		{cert && <div className="nfse-certificate"><ShieldCheck /><div><b>Certificado ativo</b><p>Titular: {formatTaxId(cert.subject_tax_id)}</p><p>Válido até {new Date(cert.not_after || "").toLocaleDateString("pt-BR")}</p></div><span className="badge green">Válido</span></div>}
		{issuer ? <form onSubmit={async (event) => { event.preventDefault(); if (uploading) return; setUploading(true); setFeedback(""); setMessage(""); const form = event.currentTarget; try { const response = await fetch("/api/nfse/certificates", { method: "POST", body: new FormData(form) }); const body = await response.json(); setFeedback(response.ok ? "Certificado armazenado com segurança." : body.error || "Não foi possível adicionar o certificado."); if (response.ok) { form.reset(); await refresh(); } } catch { setFeedback("Falha de comunicação durante o envio."); } finally { setUploading(false); } }}><input type="hidden" name="issuerId" value={issuer.id} /><input name="certificate" type="file" accept=".pfx,.p12" required /><input name="password" type="password" required placeholder="Senha do certificado" />{feedback && <div className="nfse-inline-feedback" role="status">{feedback}</div>}<button disabled={uploading}>{uploading ? "Validando certificado…" : cert ? "Substituir certificado" : "Adicionar certificado"}</button></form> : <p className="nfse-empty">Selecione uma empresa emissora.</p>}
	</section><section className="card nfse-card full"><h2>CPF/CNPJ de acesso do escritório</h2><p className="hint">Identificador usado pelo escritório para entrar na Helians.</p><form onSubmit={async (event) => { event.preventDefault(); if (identifierBusy) return; setIdentifierBusy(true); const values = new FormData(event.currentTarget); try { const response = await fetch("/api/auth/account-identifier", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taxId: values.get("taxId") }) }); const body = await response.json(); setMessage(response.ok ? `Acesso ativado para ${formatTaxId(body.loginTaxId)}.` : body.error || "Não foi possível ativar o identificador."); } finally { setIdentifierBusy(false); } }}><label>CPF/CNPJ do titular *<input name="taxId" inputMode="numeric" placeholder="00.000.000/0000-00" required /></label><button disabled={identifierBusy}>{identifierBusy ? "Confirmando…" : "Ativar acesso"}</button></form></section></>;
}

function CertificateSettings({
	data,
	issuer,
	cert,
	setMessage,
	refresh,
}: {
	data: Data;
	issuer?: Item;
	cert?: Item;
	setMessage: (m: string) => void;
	refresh: () => Promise<unknown>;
}) {
	const [uploading, setUploading] = useState(false),
		[representationBusy, setRepresentationBusy] = useState(false),
		[representationFeedback, setRepresentationFeedback] = useState(""),
		[uploadFeedback, setUploadFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
	return (
		<>
			<PageTitle
				title="Configurações"
				text="Certificados e configurações do escritório."
			/>
			<section className="card nfse-card full">
				<h2>Certificado A1</h2>
				{cert && (
					<div className="nfse-certificate">
						<ShieldCheck />
						<div>
							<b>Certificado ativo</b>
							<p>Titular: {cert.subject_tax_id}</p>
							<p>
								Válido até{" "}
								{new Date(cert.not_after || "").toLocaleDateString("pt-BR")}
							</p>
						</div>
						<span className="badge green">Válido</span>
					</div>
				)}
				{issuer ? (
					<form
						onSubmit={async (event) => {
							event.preventDefault();
							if (uploading) return;
							const form = event.currentTarget;
							setUploading(true);
							setUploadFeedback(null);
							setMessage("");
							try {
								const r = await fetch("/api/nfse/certificates", { method: "POST", body: new FormData(form) }),
									b = await r.json();
								setUploadFeedback({ kind: r.ok ? "success" : "error", text: r.ok ? "Certificado armazenado com criptografia." : b.error || "Não foi possível adicionar o certificado." });
								if (r.ok) { form.reset(); await refresh(); }
								else {
									const password = form.elements.namedItem("password") as HTMLInputElement | null;
									if (password) password.value = "";
								}
							} catch {
								setUploadFeedback({ kind: "error", text: "Falha de comunicação durante o envio. Tente novamente." });
							} finally { setUploading(false); }
						}}
					>
						<input type="hidden" name="issuerId" value={issuer.id} />
						<input name="certificate" type="file" accept=".pfx,.p12" required />
						<input
							name="password"
							type="password"
							required
							placeholder="Senha do certificado"
						/>
						{uploadFeedback && <div className={`nfse-inline-feedback ${uploadFeedback.kind}`} role="alert">{uploadFeedback.text}</div>}
						<button disabled={uploading} aria-busy={uploading}>
							{uploading && <LoaderCircle className="nfse-spinner" size={17} />}
							{uploading ? "Validando certificado…" : cert ? "Substituir certificado" : "Adicionar certificado"}
						</button>
					</form>
				) : (
					<p className="nfse-empty">Selecione uma empresa emissora.</p>
				)}
			</section>
			<section className="card nfse-card full">
				<h2>CPF/CNPJ de acesso do escritório</h2>
				<p className="hint">Depois de confirmar, este identificador poderá ser usado no login. Ele precisa pertencer a um certificado ativo do escritório.</p>
				<form onSubmit={async (event) => { event.preventDefault(); setRepresentationBusy(true); setRepresentationFeedback(""); const values=new FormData(event.currentTarget); const response=await fetch("/api/auth/account-identifier",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({taxId:values.get("taxId")})}); const body=await response.json(); setRepresentationFeedback(response.ok?`Login por CPF/CNPJ ativado: ${body.loginTaxId}`:body.error||"Não foi possível ativar o identificador."); setRepresentationBusy(false); }}>
					<label>CPF/CNPJ do titular *<input name="taxId" inputMode="numeric" required placeholder="Somente números ou formatado" /></label>
					<button disabled={representationBusy}>{representationBusy ? "Confirmando…" : "Ativar login por CPF/CNPJ"}</button>
				</form>
			</section>
			<section className="card nfse-card full">
				<h2>Procuração e representação</h2>
				<p className="hint">Autorize o uso do certificado do escritório para uma empresa representada. A procuração eletrônica também precisa estar válida no ambiente oficial da NFS-e.</p>
				{data.certificates.some((item) => item.status === "active") ? <form onSubmit={async (event) => {
					event.preventDefault(); setRepresentationBusy(true); setRepresentationFeedback("");
					const values = new FormData(event.currentTarget);
					const response = await fetch("/api/nfse/representations", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ issuerId:values.get("issuerId"), certificateId:values.get("certificateId"), authorizationType:"electronic_power_of_attorney", allowClientIssuance:values.get("allowClientIssuance")==="on", allowCancellation:false }) });
					const body = await response.json(); setRepresentationFeedback(response.ok ? "Representação ativada. O certificado do escritório poderá assinar por esta empresa." : body.error || "Não foi possível cadastrar a representação.");
					if (response.ok) await refresh(); setRepresentationBusy(false);
				}}>
					<label>Empresa representada *<select name="issuerId" defaultValue={issuer?.id || ""} required><option value="" disabled>Selecione o CNPJ representado</option>{data.issuers.map((item) => <option key={item.id} value={item.id}>{item.legal_name} - {item.tax_id}</option>)}</select></label>
					<label>Certificado do representante *<select name="certificateId" required><option value="">Selecione o certificado</option>{data.certificates.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.subject_tax_id} - válido até {new Date(item.not_after || "").toLocaleDateString("pt-BR")}</option>)}</select></label>
					<label className="wide"><input name="allowClientIssuance" type="checkbox" /> Permitir que o cliente solicite emissões usando esta representação</label>
					<button disabled={representationBusy}>{representationBusy ? "Salvando…" : "Cadastrar representação"}</button>
				</form> : <p className="nfse-empty">Adicione primeiro o certificado A1 do escritório ou representante.</p>}
				{representationFeedback && <div className="nfse-inline-feedback" role="status">{representationFeedback}</div>}
			</section>
			<section className="card nfse-card full">
				<h2>Acesso do cliente representado</h2>
				<p className="hint">Cria uma credencial própria. O cliente entrará com o CNPJ dele e uma senha separada; a senha do escritório nunca é compartilhada.</p>
				<form onSubmit={async (event) => {
					event.preventDefault(); setRepresentationBusy(true); setRepresentationFeedback(""); const target=event.currentTarget, values=new FormData(target);
					const response=await fetch("/api/nfse/representations/client-account",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({issuerId:values.get("issuerId"),name:values.get("name"),password:values.get("password"),recoveryEmail:values.get("recoveryEmail")||null})});
					const body=await response.json(); setRepresentationFeedback(response.ok?`Acesso criado. Login: ${body.loginTaxId}`:body.error||"Não foi possível criar o acesso."); if(response.ok)target.reset(); setRepresentationBusy(false);
				}}>
					<label>Empresa *<select name="issuerId" defaultValue={issuer?.id || ""} required><option value="" disabled>Selecione</option>{data.issuers.map((item)=><option key={item.id} value={item.id}>{item.legal_name} - {item.tax_id}</option>)}</select></label>
					<label>Nome do usuário *<input name="name" minLength={2} required /></label>
					<label>E-mail de recuperação <small>Opcional</small><input name="recoveryEmail" type="email" /></label>
					<label>Senha inicial *<input name="password" type="password" minLength={8} required /></label>
					<button disabled={representationBusy}>{representationBusy ? "Criando…" : "Criar acesso do cliente"}</button>
				</form>
			</section>
		</>
	);
}
function InvoiceList({ invoices }: { invoices: Item[] }) {
	return invoices.length ? (
		<ul className="nfse-invoices">
			{invoices.slice(0, 10).map((x) => (
				<li key={x.id}>
					<span className="nfse-invoice-description">{displayFiscalText(x.description)}</span>
					<span className={`nfse-status ${x.status}`}>{statusLabel(x.status)}</span>
					{x.official_key && (
						<div className="nfse-invoice-downloads">
							<a className="nfse-artifact-link" href={`/api/nfse/invoices/${x.id}/xml`}><FileText size={15} /> XML</a>
							<a className="nfse-artifact-link primary" href={`/api/nfse/invoices/${x.id}/pdf`}><Download size={15} /> PDF</a>
						</div>
					)}
				</li>
			))}
		</ul>
	) : (
		<div className="nfse-empty">Nenhuma nota ou rascunho encontrado.</div>
	);
}

function displayFiscalText(value?: string) {
	return (value || "Sem descrição")
		.replace(/Servi\?os/g, "Serviços")
		.replace(/servi\?os/g, "serviços");
}

function statusLabel(status?: string) {
	return ({
		draft: "Rascunho",
		queued: "Na fila",
		claimed: "Processando",
		signing: "Assinando",
		transmitting: "Transmitindo",
		reconciling: "Consultando",
		authorized: "Autorizada",
		rejected: "Rejeitada",
		technical_failure: "Falha técnica",
		unknown: "Aguardando confirmação",
		persistence_pending: "Salvando resultado",
	}[status || ""] || status || "Desconhecido");
}
