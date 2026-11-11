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
} from "lucide-react";
type Area = "overview" | "issue" | "registrations" | "settings" | "setup";
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
	environment?: "government_homologation" | "government_production";
	issuers: Item[];
	services: Item[];
	takers: Item[];
	invoices: Item[];
	certificates: Item[];
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
			if (first.current) { first.current = false; if (!b.issuers.length || !b.services.length || !b.certificates.some((x: Item) => x.status === "active")) setArea("setup"); }
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
		ready = Boolean(issuer && services.length && cert),
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
			<Sidebar area={area} go={setArea} collapsed={collapsed} setCollapsed={setCollapsed} />
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
							cert={cert}
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
					{area === "settings" && (
						<CertificateSettings
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
function Sidebar({ area, go, collapsed, setCollapsed }: { area: Area; go: (a: Area) => void; collapsed: boolean; setCollapsed: (value: boolean) => void }) {
	const item = (key: Area, label: string, Icon: typeof Home) => (
		<button className={area === key ? "active" : ""} onClick={() => go(key)} title={collapsed ? label : undefined}>
			<Icon size={20} />
			<span>{label}</span>
		</button>
	);
	return (
		<aside>
			<img className="logo" src="/api/logo" alt="Socium Contábil" />
			<nav>
				{item("overview", "Visão geral", Home)}
				{item("issue", "Emitir NFS-e", FilePlus2)}
				{item("registrations", "Cadastros fiscais", Users)}
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
	const labels: Record<Area, string> = { overview: "Visão geral", issue: "Emitir NFS-e", registrations: "Cadastros fiscais", settings: "Configurações", setup: "Configuração inicial" };
	async function logout() { await fetch("/api/auth/logout", { method: "POST" }); location.reload(); }
	return (
		<header>
			<div className="nfse-breadcrumb">
				<button className="breadcrumb-home" type="button" onClick={onOpenModules}>Socium</button><span>/</span><strong>Emitir NFS-e</strong><span>/</span><b>{labels[area]}</b>
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
function CertificateSettings({
	issuer,
	cert,
	setMessage,
	refresh,
}: {
	issuer?: Item;
	cert?: Item;
	setMessage: (m: string) => void;
	refresh: () => Promise<unknown>;
}) {
	const [uploading, setUploading] = useState(false),
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
