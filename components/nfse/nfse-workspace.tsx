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
};
export function NfseWorkspace() {
	const [data, setData] = useState<Data | null>(null),
		[message, setMessage] = useState(""),
		[busy, setBusy] = useState(""),
		[area, setArea] = useState<Area>("overview"),
		[issuerId, setIssuerId] = useState(""),
		[step, setStep] = useState(1),
		[draft, setDraft] = useState(emptyDraft),
		[resultId, setResultId] = useState("");
	const first = useRef(true);
	const load = useCallback(async () => {
		const r = await fetch("/api/nfse/workspace", { cache: "no-store" }),
			b = await r.json();
		if (!r.ok) {
			setMessage(b.error);
			return;
		}
		setData(b);
		setIssuerId((current) => current || b.issuers[0]?.id || "");
		if (first.current) {
			first.current = false;
			if (
				!b.issuers.length ||
				!b.services.length ||
				!b.certificates.some((x: Item) => x.status === "active")
			)
				setArea("setup");
		}
	}, []);
	useEffect(() => {
		void load();
	}, [load]);
	async function post(payload: Record<string, unknown>) {
		const r = await fetch("/api/nfse/workspace", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			}),
			b = await r.json();
		if (!r.ok) setMessage(b.error || "Não foi possível salvar.");
		if (r.ok) await load();
		return { ok: r.ok, body: b };
	}
	async function form(kind: string, values: FormData) {
		await post({ action: kind, ...Object.fromEntries(values) });
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
				setMessage(`${simulation ? "NFS-e simulada" : production ? "DPS de produção" : "DPS de homologação"} enfileirada. Aguardando o worker fiscal…`);
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
		<div className="app nfse-app">
			<Sidebar area={area} go={setArea} />
			<main>
				<Topbar
					issuer={issuer}
					issuers={data.issuers}
					value={issuerId}
					onChange={setIssuerId}
					simulation={data.simulation}
					production={production}
				/>
				<div className="nfse-content">
					<div className="nfse-banner">
						<div>
							<strong>{data.simulation ? "SIMULAÇÃO LOCAL - SEM VALOR FISCAL" : production ? "PRODUÇÃO GOVERNAMENTAL - EMISSÃO COM VALOR FISCAL" : "HOMOLOGAÇÃO GOVERNAMENTAL - SEM VALOR FISCAL"}</strong>
							<p>{data.simulation ? "Nenhuma chamada ao governo ou envio externo é realizado." : production ? "A emissão será transmitida à SEFIN Nacional e poderá gerar obrigação fiscal real." : "A integração usa somente a produção restrita configurada."}</p>
						</div>
						<ShieldCheck size={34} />
					</div>
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
						<Registrations issuer={issuer} submit={form} />
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
function Sidebar({ area, go }: { area: Area; go: (a: Area) => void }) {
	const item = (key: Area, label: string, Icon: typeof Home) => (
		<button className={area === key ? "active" : ""} onClick={() => go(key)}>
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
			<button
				className="collapse"
				onClick={async () => {
					await fetch("/api/auth/logout", { method: "POST" });
					location.reload();
				}}
			>
				<LogOut size={20} />
				<span>Sair</span>
			</button>
		</aside>
	);
}
function Topbar({
	issuer,
	issuers,
	value,
	onChange,
	simulation,
	production,
}: {
	issuer?: Item;
	issuers: Item[];
	value: string;
	onChange: (v: string) => void;
	simulation: boolean;
	production: boolean;
}) {
	return (
		<header>
			<div>
				<FileText size={21} />
				<b>Emissor NFS-e</b>
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
				<span className="badge blue">{simulation ? "Simulação local" : production ? "Produção governamental" : "Homologação governamental"}</span>
				<div className="avatar">
					{issuer?.legal_name?.slice(0, 2).toUpperCase() || "NF"}
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
	refresh: () => Promise<void>;
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
function Issue({
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
	refresh: () => Promise<void>;
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
										"Aguarde o worker concluir o processamento."}
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
}: {
	issuer?: Item;
	submit: (k: string, f: FormData) => Promise<void>;
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
					<form action={(f) => submit("issuer", f)}>
						<input name="taxId" placeholder="CNPJ" required />
						<input name="legalName" placeholder="Razão social" required />
						<input
							name="municipalityIbge"
							placeholder="Município IBGE"
							required
						/>
						<input name="taxRegime" placeholder="Regime tributário" required />
					<label>Opção pelo Simples<select name="simpleNationalOption" defaultValue=""><option value="" disabled>Selecione conforme cadastro fiscal</option><option value="1">Não optante</option><option value="2">Optante - MEI</option><option value="3">Optante - demais</option></select></label>
					<label>Regime de apuração no Simples<select name="simpleNationalTaxationRegime" defaultValue=""><option value="" disabled>Selecione</option><option value="1">Regime 1</option><option value="2">Regime 2</option><option value="3">Regime 3</option></select></label>
					<input name="specialTaxRegime" placeholder="Código do regime especial" inputMode="numeric" maxLength={1} required />
						<input
							name="dpsSeries"
							placeholder="Série DPS"
							defaultValue="1"
							required
						/>
						<button>Cadastrar emitente</button>
					</form>
				</section>
				<section className="card nfse-card">
					<h2>Serviços</h2>
					{issuer ? (
						<form action={(f) => submit("service", f)}>
							<input type="hidden" name="issuerId" value={issuer.id} />
							<input name="name" placeholder="Nome do serviço" required />
							<input
								name="nationalCode"
								placeholder="Código nacional"
								required
							/>
							<input name="municipalCode" placeholder="Código municipal (quando exigido)" />
							<input name="nbsCode" placeholder="NBS (quando aplicável)" />
							<input
								name="description"
								placeholder="Descrição fiscal"
								required
							/>
							<button>Cadastrar serviço</button>
						</form>
					) : (
						<p className="nfse-empty">Cadastre um emitente primeiro.</p>
					)}
				</section>
				<section className="card nfse-card">
					<h2>Tomadores</h2>
					{issuer ? (
						<form action={(f) => submit("taker", f)}>
							<input type="hidden" name="issuerId" value={issuer.id} />
							<input name="taxId" placeholder="CNPJ do tomador" inputMode="numeric" autoComplete="off" required />
							<input name="legalName" placeholder="Razão social" required />
							<input name="email" type="email" placeholder="E-mail" required />
							<button>Cadastrar tomador</button>
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
	refresh: () => Promise<void>;
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
