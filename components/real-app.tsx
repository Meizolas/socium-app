"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as I from "lucide-react";

type Page =
  | "Visão geral"
  | "Importar Guias"
  | "Importar Parcelamentos"
  | "Processamentos"
  | "Clientes"
  | "Envios"
  | "Alertas"
  | "Configurações";
type Client = {
  id: string;
  legal_name: string;
  trade_name?: string;
  cnpj: string;
  owner_name?: string;
  email?: string;
  additional_emails?: string[];
  whatsapp?: string;
  preference?: string;
  active: boolean;
  notes?: string;
  auto_created?: boolean;
  created_at: string;
};
type Job = {
  id: string;
  file: string;
  type: string;
  size: string;
  client: string;
  clientId?: string | null;
  clientRegistered: boolean;
  clientNeedsCompletion: boolean;
  cnpj: string;
  stage: string;
  progress: number;
  status: string;
  time: string;
  duration: string;
  competence?: string;
  errorMessage?: string;
};
type Alert = {
  id: string;
  document_id?: string;
  client_id?: string;
  title: string;
  type: string;
  severity: string;
  created_at: string;
  read_at?: string | null;
  cnpj?: string;
  legal_name?: string;
};
type Shipment = {
  id: string;
  documentId: string;
  file: string;
  type: string;
  client: string;
  channel: string;
  status: string;
  sentAt?: string;
  errorMessage?: string;
  competence?: string;
};
const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
type Data = {
  officeId: string;
  clients: Client[];
  jobs: Job[];
  alerts: Alert[];
  shipments: Shipment[];
};
const empty: Data = { officeId: "", clients: [], jobs: [], alerts: [], shipments: [] };
const nav: [Page, React.ElementType][] = [
  ["Visão geral", I.House],
  ["Importar Guias", I.CloudUpload],
  ["Importar Parcelamentos", I.Files],
  ["Processamentos", I.Clock3],
  ["Clientes", I.Users],
  ["Envios", I.Send],
  ["Alertas", I.Bell],
  ["Configurações", I.Settings],
];
const Button = ({
  children,
  onClick,
  secondary,
  type = "button",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  type?: "button" | "submit";
  disabled?: boolean;
}) => (
  <button
    type={type}
    disabled={disabled}
    className={"btn " + (secondary ? "secondary" : "")}
    onClick={onClick}
  >
    {children}
  </button>
);
function Badge({ status }: { status: string }) {
  const color = /Ativo|Enviado|Pronto|Concluído/.test(status)
    ? "green"
    : /Erro|Crítico/.test(status)
      ? "red"
      : /Revisão|Atenção|Incompleto|não cadastrado/i.test(status)
        ? "yellow"
        : /Process|fila|extraindo|enviando|n8n/i.test(status)
          ? "blue"
          : "gray";
  return <span className={"badge " + color}>{status}</span>;
}

export function RealApp({ onOpenModules }: { onOpenModules: () => void }) {
  const [page, setPage] = useState<Page>("Visão geral"),
    [editClientId, setEditClientId] = useState<string | null>(null),
    [clientSeed, setClientSeed] = useState<{ name: string; cnpj: string } | null>(
      null,
    ),
    [collapsed, setCollapsed] = useState(false),
    [period, setPeriod] = useState("07/2026"),
    [data, setData] = useState<Data>(empty),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const lastNotificationReadRef=useRef<string|null>(null);
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" }),
        body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Falha ao carregar dados.");
      const lastRead=lastNotificationReadRef.current;
      if(lastRead)body.alerts=(body.alerts||[]).map((alert:Alert)=>!alert.read_at&&new Date(alert.created_at).getTime()<=new Date(lastRead).getTime()?{...alert,read_at:lastRead}:alert);
      setData(body);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar dados.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer=window.setTimeout(()=>{
      if (new URLSearchParams(window.location.search).has("gmail")) setPage("Configurações");
    },0);
    return()=>window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(true), 2000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);
  const filteredJobs = useMemo(
    () => data.jobs.filter((j) => !period || j.competence === period),
    [data.jobs, period],
  );
  async function viewNotifications(){
    const readBefore=new Date().toISOString();
    lastNotificationReadRef.current=readBefore;
    setData(current=>({...current,alerts:current.alerts.map(alert=>new Date(alert.created_at).getTime()<=new Date(readBefore).getTime()?{...alert,read_at:alert.read_at||readBefore}:alert)}));
    setPage("Alertas");
    try{
      const response=await fetch("/api/alerts/read",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({readBefore})});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||"Não foi possível marcar as notificações como lidas.");
      lastNotificationReadRef.current=body.readAt||readBefore;
    }catch(error){
      lastNotificationReadRef.current=null;
      await load(true);
      window.alert(error instanceof Error?error.message:"Falha ao atualizar notificações.");
    }
  }
  return (
    <div className={"app " + (collapsed ? "sidebar-collapsed" : "")}>
      <aside>
        <img className="logo" src="/api/logo" alt="Socium Contábil" />
        <nav>
          {nav.map(([name, Icon]) => (
            <button key={name} className={page === name ? "active" : ""} onClick={() => setPage(name)} title={collapsed ? name : undefined}>
              <Icon size={21} />
              <span>{name}</span>
            </button>
          ))}
        </nav>
        <button className="collapse" onClick={() => setCollapsed(!collapsed)}>
          <I.CircleChevronLeft className={collapsed ? "flipped" : ""} />
          <span>{collapsed ? "Expandir menu" : "Recolher menu"}</span>
        </button>
      </aside>
      <main>
        <Header
          page={page}
          setPage={setPage}
          period={period}
          setPeriod={setPeriod}
          alerts={data.alerts}
          onViewNotifications={() => void viewNotifications()}
          moduleName="Importar Guias"
		  onOpenModules={onOpenModules}
        />
        <div className="content">
          {error && (
            <section className="card setup-error">
              <I.DatabaseZap />
              <div>
                <h2>Serviço temporariamente indisponível</h2>
                <p>{error}</p>
                <small>
                  Não foi possível carregar os dados. Tente novamente ou contate o suporte.
                </small>
              </div>
              <Button onClick={load}>Tentar novamente</Button>
            </section>
          )}
          {!error && loading && (
            <div className="loading">
              <I.LoaderCircle className="spin" />
              Carregando dados…
            </div>
          )}
          {!error && !loading && page === "Visão geral" && (
            <Overview data={data} jobs={data.jobs} go={setPage} />
          )}
          {!error && !loading && page === "Importar Guias" && (
            <ImportPage period={period} refresh={load} kind="GUIA" />
          )}
          {!error && !loading && page === "Importar Parcelamentos" && (
            <ImportPage period={period} refresh={load} kind="PARCELAMENTO" />
          )}
          {!error && !loading && page === "Processamentos" && (
            <Processings
              jobs={data.jobs}
              refresh={load}
              onCompleteClient={(clientId) => {
                setEditClientId(clientId);
                setPage("Clientes");
              }}
            />
          )}
          {!error && !loading && page === "Clientes" && (
            <Clients
              initial={data.clients}
              refresh={load}
              seed={clientSeed}
              clearSeed={() => setClientSeed(null)}
              editClientId={editClientId}
              clearEditClient={() => setEditClientId(null)}
            />
          )}
          {!error && !loading && page === "Alertas" && (
            <Alerts
              items={data.alerts}
              onRegister={(alert) => {
                if(alert.client_id)setEditClientId(alert.client_id);
                else setClientSeed({name:alert.legal_name||"",cnpj:alert.cnpj||""});
                setPage("Clientes");
              }}
            />
          )}
          {!error && !loading && page === "Envios" && (
            <Shipments items={data.shipments.filter(item=>!period||item.competence===period)} />
          )}
          {!error && !loading && page === "Configurações" && (
            <Settings />
          )}
        </div>
      </main>
    </div>
  );
}

function Header({
  page,
  setPage,
  period,
  setPeriod,
  alerts,
  onViewNotifications,
  moduleName,
  onOpenModules,
}: {
  page: Page;
  setPage: (p: Page) => void;
  period: string;
  setPeriod: (p: string) => void;
  alerts: Alert[];
  onViewNotifications: () => void;
  moduleName: string;
  onOpenModules: () => void;
}) {
  const [open, setOpen] = useState("");
  const unread=alerts.filter(alert=>!alert.read_at).length;
  return (
    <header>
      <div>
		<button className="breadcrumb-home" onClick={onOpenModules}>Socium</button>
        <span>/</span>
        <strong>{moduleName}</strong>
        <span>/</span>
        <b>{page}</b>
      </div>
      <div className="headright">
        {page !== "Visão geral" && <div className="headmenu">
          <button
            className="month"
            onClick={() => setOpen(open === "date" ? "" : "date")}
          >
            <I.CalendarDays size={18} />
            <input
              aria-label="Competência"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="MM/AAAA"
              onClick={(e) => e.stopPropagation()}
            />
            <I.ChevronDown size={16} />
          </button>
          {open === "date" && (
            <div className="dropdown periodmenu">
              {["07/2026", "06/2026", "05/2026", "04/2026"].map((p) => (
                <button
                  className={period === p ? "selected" : ""}
                  key={p}
                  onClick={() => {
                    setPeriod(p);
                    setOpen("");
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>}
        <div className="headmenu">
          <button
            className="iconbtn"
            onClick={() => setOpen(open === "alerts" ? "" : "alerts")}
          >
            <I.Bell size={21} />
            {unread > 0 && <i>{unread}</i>}
          </button>
          {open === "alerts" && (
            <div className="dropdown notifications">
              <h4>
                Notificações{" "}
                <button onClick={()=>{setOpen("");onViewNotifications()}}>Ver notificações</button>
              </h4>
              {alerts.length ? (
                alerts.slice(0, 4).map((a) => (
                  <button key={a.id} onClick={()=>{setOpen("");onViewNotifications()}}>
                    <I.TriangleAlert />
                    <span>
                      <b>{a.title}</b>
                      <small>{a.type}</small>
                    </span>
                  </button>
                ))
              ) : (
                <p className="emptyline">Nenhuma notificação.</p>
              )}
            </div>
          )}
        </div>
        <div className="headmenu">
          <button
            className="profilebtn"
            onClick={() => setOpen(open === "profile" ? "" : "profile")}
          >
            <span className="avatar">SC</span>
            <I.ChevronDown />
          </button>
          {open === "profile" && (
            <div className="dropdown profilemenu">
              <div>
                <span className="avatar">SC</span>
                <p>
                  <b>Socium Contábil</b>
                  <small>Escritório atual</small>
                </p>
              </div>
              <button onClick={() => setPage("Configurações")}>
                <I.Settings />
                Configurações
              </button>
			  <button onClick={onOpenModules}>
				<I.LayoutGrid />
				Trocar módulo
			  </button>
              <button className="profile-logout" onClick={async()=>{await fetch('/api/auth/logout',{method:'POST'});location.reload()}}>
                <I.LogOut />
                Sair da conta
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
function Title({
  title,
  sub,
  actions,
}: {
  title: string;
  sub: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="title">
      <div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      <div className="actions">
        {title === "Clientes" && <ImportClientsButton />}
        {actions}
      </div>
    </div>
  );
}
function ImportClientsButton() {
  const input = useRef<HTMLInputElement>(null),
    [busy, setBusy] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/clients/import", {
        method: "POST",
        body: form,
      }),
      body = await response.json();
    setBusy(false);
    if (!response.ok) {
      window.alert(body.error || "Falha ao importar.");
      return;
    }
    const details = [`${body.imported} cliente(s) importado(s)`];
    if (body.duplicates)
      details.push(`${body.duplicates} CNPJ(s) duplicado(s)`);
    if (body.invalid) details.push(`${body.invalid} linha(s) inválida(s)`);
    window.alert(details.join("; ") + ".");
    window.location.reload();
  }
  return (
    <>
      <input
        hidden
        ref={input}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      <Button secondary disabled={busy} onClick={() => input.current?.click()}>
        <I.FileUp />
        {busy ? "Importando…" : "Importar planilha"}
      </Button>
    </>
  );
}
function Metric({
  value,
  label,
  Icon,
  color,
}: {
  value: number;
  label: string;
  Icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="metric">
      <span className={"metricicon " + color}>
        <Icon />
      </span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}
function Overview({
  data,
  jobs,
  go,
}: {
  data: Data;
  jobs: Job[];
  go: (p: Page) => void;
}) {
  const [typeFilter, setTypeFilter] = useState("Todos");
  const types = [...new Set(jobs.map((job) => job.type).filter(Boolean))].sort();
  const shownJobs =
    typeFilter === "Todos"
      ? jobs
      : jobs.filter((job) => job.type === typeFilter);
  return (
    <>
      <Title
        title="Visão geral"
        sub="Acompanhe documentos, envios e pendências do escritório."
        actions={
          <Button onClick={() => go("Importar Guias")}>
            <I.CloudUpload />
            Importar arquivos
          </Button>
        }
      />
      <div className="metrics">
        <Metric
          value={shownJobs.length}
          label="Documentos"
          Icon={I.FileText}
          color="blue"
        />
        <Metric
          value={shownJobs.filter((j) => /^Enviado/.test(j.status)).length}
          label="Enviados"
          Icon={I.Send}
          color="green"
        />
        <Metric
          value={
            shownJobs.filter((j) => /Processando|fila/.test(j.status)).length
          }
          label="Processando"
          Icon={I.LoaderCircle}
          color="blue"
        />
        <Metric
          value={data.alerts.length}
          label="Com atenção"
          Icon={I.TriangleAlert}
          color="yellow"
        />
      </div>
      <section className="card queue">
        <div className="tablehead">
          <h3>Atividade recente</h3>
          <select
            aria-label="Filtrar por tipo de guia"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option>Todos</option>
            {types.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </div>
        <JobsTable jobs={shownJobs.slice(0, 10)} />
      </section>
    </>
  );
}
function JobsTable({
  jobs,
  onDelete,
  deleting,
  sending,
  retrying,
  selected,
  onToggle,
  onToggleAll,
  onDownload,
  onSend,
  onRetry,
  onEditClient,
}: {
  jobs: Job[];
  onDelete?: (job: Job) => void;
  deleting?: string;
  sending?: string;
  retrying?: string;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  onToggleAll?: () => void;
  onDownload?: (id: string) => void;
  onSend?: (job: Job) => void;
  onRetry?: (job: Job) => void;
  onEditClient?: (job: Job) => void;
}) {
  return jobs.length ? (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            {onToggle && (
              <th>
                <input
                  type="checkbox"
                  aria-label="Selecionar todos"
                  checked={jobs.every((j) => selected?.has(j.id))}
                  onChange={onToggleAll}
                />
              </th>
            )}
            <th>Arquivo</th>
            <th>Tipo</th>
            <th>Cliente</th>
            <th>Competência</th>
            <th>Progresso</th>
            <th>Status</th>
            <th>Atualizado</th>
            {onDelete && <th aria-label="Ações" />}
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              {onToggle && (
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${j.file}`}
                    checked={selected?.has(j.id) || false}
                    onChange={() => onToggle(j.id)}
                  />
                </td>
              )}
              <td>
                <b>{j.file}</b>
              </td>
              <td>
                <Badge status={j.type} />
              </td>
              <td>
                {j.client}
                <small>
                  {j.cnpj}
                  {j.clientNeedsCompletion && j.cnpj
                    ? " — cadastro automático incompleto; adicione os contatos"
                    : ""}
                </small>
              </td>
              <td>{j.competence || "—"}</td>
              <td>
                <small>{j.progress}%</small>
                <div className="progress">
                  <span style={{ width: `${j.progress}%` }} />
                </div>
              </td>
              <td>
                <Badge status={j.status} />
                {j.errorMessage && <small>{j.errorMessage}</small>}
              </td>
              <td>{formatDateTime(j.time)}</td>
              {onDelete && (
                <td>
                  <div className="rowactions">
                    {j.clientNeedsCompletion && (
                      <button
                        type="button"
                        className="downloadbtn"
                        title="Completar cadastro do cliente"
                        aria-label={`Completar cadastro de ${j.client}`}
                        onClick={() => onEditClient?.(j)}
                      >
                        <I.UserRoundPen size={18} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="downloadbtn"
                      disabled={retrying === j.id}
                      title="Processar novamente"
                      aria-label={`Reprocessar ${j.file}`}
                      onClick={() => onRetry?.(j)}
                    >
                      {retrying === j.id ? (
                        <I.LoaderCircle className="spin" size={18} />
                      ) : (
                        <I.RefreshCw size={18} />
                      )}
                    </button>
                    <button
                      type="button"
                      className="downloadbtn"
                      disabled={sending === j.id}
                      title="Enviar ou tentar novamente"
                      aria-label={`Enviar ${j.file}`}
                      onClick={() => onSend?.(j)}
                    >
                      {sending === j.id ? (
                        <I.LoaderCircle className="spin" size={18} />
                      ) : (
                        <I.Send size={18} />
                      )}
                    </button>
                    <button
                      type="button"
                      className="downloadbtn"
                      title="Baixar DAS"
                      aria-label={`Baixar ${j.file}`}
                      onClick={() => onDownload?.(j.id)}
                    >
                      <I.Download size={18} />
                    </button>
                    <button
                      type="button"
                      className="deletebtn"
                      disabled={deleting === j.id}
                      title="Excluir processamento"
                      aria-label={`Excluir ${j.file}`}
                      onClick={() => onDelete(j)}
                    >
                      {deleting === j.id ? (
                        <I.LoaderCircle className="spin" size={18} />
                      ) : (
                        <I.Trash2 size={18} />
                      )}
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <EmptyLine text="Nenhum documento encontrado para esta competência." />
  );
}

function ImportPage({
  period,
  refresh,
  kind,
}: {
  period: string;
  refresh: () => Promise<void>;
  kind: "GUIA" | "PARCELAMENTO";
}) {
  const [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [uploads,setUploads]=useState<Record<string,{progress:number,status:string,error?:string}>>({}),
    [messages, setMessages] = useState<{text:string;kind:"success"|"duplicate"|"error"}[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const validPeriod=/^(0[1-9]|1[0-2])\/\d{4}$/.test(period);
  async function process() {
    if(!validPeriod){setMessages([{text:"Selecione uma competência no topo da página antes de iniciar o processamento.",kind:"error"}]);return}
    setBusy(true);
    const batchId=crypto.randomUUID();
    const uploadedIds:string[]=[];
    const output: {text:string;kind:"success"|"duplicate"|"error"}[] = [];
    let duplicateCount=0;
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      form.append("competence", period);
      form.append("batchId",batchId);
      form.append("batchSize",String(files.length));
      form.append("documentCategory",kind);
      try {
        setUploads(current=>({...current,[file.name]:{progress:0,status:"Preparando upload"}}));
        const body=await new Promise<{id?:string}>((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open("POST","/api/documents");xhr.upload.onprogress=event=>{if(event.lengthComputable){const progress=Math.round(event.loaded/event.total*100);setUploads(current=>({...current,[file.name]:{progress,status:progress<100?"Enviando arquivo":"Salvando arquivo"}}))}};xhr.onload=()=>{let result;try{result=JSON.parse(xhr.responseText)}catch{result={error:"Resposta inválida do servidor."}}if(xhr.status>=200&&xhr.status<300)resolve(result);else{const failure=new Error(result.error||`Falha no envio (${xhr.status})`) as Error&{status:number};failure.status=xhr.status;reject(failure)}};xhr.onerror=()=>reject(new Error("Falha de conexão com o servidor."));xhr.send(form)});
        setUploads(current=>({...current,[file.name]:{progress:100,status:"Aguardando processamento"}}));
        if(body.id)uploadedIds.push(body.id);
        output.push({text:`${file.name}: recebido com sucesso${body.id?` (documento ${body.id})`:""}`,kind:"success"});
      } catch(error) {
        const failure=error as Error&{status?:number},duplicate=failure.status===409;
        const detail=duplicate?"Este PDF já foi importado anteriormente. Use Reprocessar na tela de Processamentos ou exclua o registro anterior antes de importar novamente.":failure instanceof Error?failure.message:"Falha desconhecida";
        if(duplicate)duplicateCount++;
        setUploads(current=>({...current,[file.name]:{progress:0,status:duplicate?"Arquivo já importado":"Erro",error:detail}}));
        output.push({text:`${file.name}: ${detail}`,kind:duplicate?"duplicate":"error"});
      }
    }
    if(duplicateCount)output.unshift({text:`${duplicateCount} arquivo(s) não foram enviados porque já haviam sido importados.`,kind:"duplicate"});
    setMessages(output);
    if(uploadedIds.length)await fetch("/api/documents/batch/finalize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({batchId,documentIds:uploadedIds})});
    setBusy(false);
    await refresh();
  }
  return (
    <>
      <Title
        title={kind === "PARCELAMENTO" ? "Importar Parcelamentos" : "Importar Guias"}
        sub={validPeriod
          ? `Os ${kind === "PARCELAMENTO" ? "parcelamentos" : "arquivos"} serão enviados e processados na competência ${period}.`
          : "Selecione uma competência no topo da página antes de importar os PDFs."}
      />
      <section
        className="drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setFiles(
            [...e.dataTransfer.files].filter(
              (f) => f.type === "application/pdf",
            ),
          );
        }}
      >
        <I.CloudUpload size={60} />
        <h2>Arraste os PDFs aqui</h2>
        <input
          hidden
          ref={input}
          type="file"
          accept="application/pdf"
          multiple
          onChange={(e) => setFiles([...(e.target.files || [])])}
        />
        <Button onClick={() => input.current?.click()}>
          Selecionar arquivos
        </Button>
        <b>
          {files.length
            ? `${files.length} arquivo(s) pronto(s)`
            : "Nenhum arquivo selecionado"}
        </b>
      </section>
      {files.length > 0 && (
        <><div className="uploads">{files.map(file=>{const state=uploads[file.name];return <div key={`${file.name}-${file.size}`}><I.FileText/><p><b>{file.name}</b><small>{state?.error||state?.status||"Pronto para enviar"}</small></p><div className="progress"><span style={{width:`${state?.progress||0}%`}}/></div><Badge status={state?.status||"Pronto"}/></div>})}</div><div className="upload-actions">
          <Button onClick={process} disabled={busy || !validPeriod}>
            {busy ? (
              <>
                <I.LoaderCircle className="spin" />
                Enviando…
              </>
            ) : (
              <>Iniciar processamento</>
            )}
          </Button>
        </div></>
      )}
      {messages.map((message,index) => (
        <div className={`resultline ${message.kind}`} key={`${message.text}-${index}`}>
          {message.kind==="duplicate"?<I.TriangleAlert size={18}/>:message.kind==="error"?<I.CircleX size={18}/>:<I.CircleCheck size={18}/>} {message.text}
        </div>
      ))}
    </>
  );
}
function Processings({
  jobs,
  refresh,
  onCompleteClient,
}: {
  jobs: Job[];
  refresh: (silent?: boolean) => Promise<void>;
  onCompleteClient: (clientId: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [deleting, setDeleting] = useState(""),
    [sending, setSending] = useState(""),
    [retrying, setRetrying] = useState(""),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [downloading, setDownloading] = useState(false);
  const shown = jobs.filter((j) =>
    (j.file + j.client + j.cnpj).toLowerCase().includes(query.toLowerCase()),
  );
  async function completeClient(job:Job){
    if(job.clientId){onCompleteClient(job.clientId);return}
    const response=await fetch(`/api/documents/${job.id}/client`,{method:"POST"}),body=await response.json();
    if(!response.ok){window.alert(body.error||"Não foi possível criar o pré-cadastro.");return}
    await refresh();
    onCompleteClient(body.clientId);
  }
  async function send(job: Job) {
    setSending(job.id);
    const response = await fetch(`/api/documents/${job.id}/send`, {
        method: "POST",
      }),
      body = await response.json();
    setSending("");
    if(!response.ok)console.error(body.error||"Não foi possível enviar.");
    await refresh();
  }
  async function retry(job: Job) {
    setRetrying(job.id);
    const response = await fetch(`/api/documents/${job.id}/retry`, {
        method: "POST",
      }),
      body = await response.json();
    setRetrying("");
    if(!response.ok)console.error(body.error||"Não foi possível reprocessar.");
    await refresh();
  }
  async function remove(job: Job) {
    if (
      !window.confirm(
        `Excluir o processamento e o arquivo “${job.file}”? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    setDeleting(job.id);
    const response = await fetch(`/api/documents/${job.id}`, {
        method: "DELETE",
      }),
      body = await response.json();
    setDeleting("");
    if (!response.ok) {
      window.alert(body.error || "Não foi possível excluir.");
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      next.delete(job.id);
      return next;
    });
    if (body.warning) window.alert(body.warning);
    await refresh();
  }
  async function download(ids: string[]) {
    if (!ids.length) return;
    setDownloading(true);
    const response = await fetch("/api/documents/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!response.ok) {
      const body = await response.json();
      window.alert(body.error || "Não foi possível baixar.");
      setDownloading(false);
      return;
    }
    const blob = await response.blob(),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download =
      ids.length === 1 ? "documento-das.zip" : "documentos-das.zip";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setDownloading(false);
  }
  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((current) =>
      shown.every((j) => current.has(j.id))
        ? new Set([...current].filter((id) => !shown.some((j) => j.id === id)))
        : new Set([...current, ...shown.map((j) => j.id)]),
    );
  }
  return (
    <>
      <Title
        title="Processamentos"
        sub="Acompanhe o processamento dos documentos enviados."
        actions={
          <Button
            disabled={!selected.size || downloading}
            onClick={() => void download([...selected])}
          >
            {downloading ? <I.LoaderCircle className="spin" /> : <I.Download />}
            Baixar selecionados{selected.size ? ` (${selected.size})` : ""}
          </Button>
        }
      />
      <section className="card queue">
        <div className="tablehead">
          <h3>Fila de processamento</h3>
          <div className="search">
            <I.Search />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Arquivo, cliente ou CNPJ"
            />
          </div>
        </div>
        <JobsTable
          jobs={shown}
          onDelete={(job) => void remove(job)}
          onSend={(job) => void send(job)}
          onRetry={(job) => void retry(job)}
          onEditClient={(job) => void completeClient(job)}
          deleting={deleting}
          sending={sending}
          retrying={retrying}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onDownload={(id) => void download([id])}
        />
      </section>
    </>
  );
}

function Clients({
  initial,
  refresh,
  seed,
  clearSeed,
  editClientId,
  clearEditClient,
}: {
  initial: Client[];
  refresh: () => Promise<void>;
  seed: { name: string; cnpj: string } | null;
  clearSeed: () => void;
  editClientId: string | null;
  clearEditClient: () => void;
}) {
  const [selected, setSelected] = useState(initial[0]?.id || ""),
    [query, setQuery] = useState(""),
    [editing, setEditing] = useState<Client | null | undefined>();
  useEffect(() => {
    const timer=seed?window.setTimeout(()=>setEditing(null),0):undefined;
    return()=>window.clearTimeout(timer);
  }, [seed]);
  useEffect(() => {
    if(!editClientId)return;
    const client=initial.find((item)=>item.id===editClientId);
    const timer=client?window.setTimeout(()=>{setSelected(client.id);setEditing(client)},0):undefined;
    return()=>window.clearTimeout(timer);
  }, [editClientId,initial]);
  const shown = initial.filter((c) =>
      (c.legal_name + c.cnpj + (c.email || ""))
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
    client = initial.find((c) => c.id === selected) || initial[0];
  return (
    <>
      <Title
        title="Clientes"
        sub="Gerencie os clientes vinculados ao escritório."
        actions={
          <Button
            onClick={() => {
              clearSeed();
              clearEditClient();
              setEditing(null);
            }}
          >
            <I.Plus />
            Novo cliente
          </Button>
        }
      />
      <div className="split clientsplit">
        <section className="card queue">
          <div className="tablehead">
            <h3>Base de clientes</h3>
            <div className="search">
              <I.Search />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Empresa, CNPJ ou contato"
              />
            </div>
          </div>
          {shown.length ? (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>CNPJ</th>
                    <th>Contato</th>
                    <th>Preferência</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => (
                    <tr
                      key={c.id}
                      className={c.id === client?.id ? "selectedrow" : ""}
                      onClick={() => setSelected(c.id)}
                    >
                      <td>
                        <b>{c.legal_name}</b>
                        <small>{c.owner_name}</small>
                      </td>
                      <td>{c.cnpj}</td>
                      <td>
                        {c.email}
                        <small>{c.whatsapp}</small>
                      </td>
                      <td>{c.preference}</td>
                      <td>
                        <Badge status={c.active ? "Ativo" : "Inativo"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyLine text="Nenhum cliente cadastrado." />
          )}
        </section>
        {client && (
          <section className="card detail clientdetail">
            <h3>Resumo do cliente</h3>
            <div className="person">
              <span>{client.legal_name.slice(0, 2).toUpperCase()}</span>
              <p>
                <b>{client.legal_name}</b>
                <small>{client.trade_name}</small>
              </p>
            </div>
            <p>
              <small>CNPJ</small>
              {client.cnpj}
            </p>
            <p>
              <small>E-mail</small>
              {client.email || "—"}
            </p>
            <p>
              <small>WhatsApp</small>
              {client.whatsapp || "—"}
            </p>
            <p>
              <small>Preferência</small>
              {client.preference || "—"}
            </p>
            <Button onClick={() => setEditing(client)}>
              <I.Pencil />
              Editar cadastro
            </Button>
          </section>
        )}
      </div>
      {editing !== undefined && (
        <ClientModal
          client={editing}
          defaults={seed}
          close={() => {
            clearSeed();
            clearEditClient();
            setEditing(undefined);
          }}
          saved={async () => {
            clearSeed();
            clearEditClient();
            setEditing(undefined);
            await refresh();
          }}
        />
      )}
    </>
  );
}
function ClientModal({
  client,
  defaults,
  close,
  saved,
}: {
  client: Client | null;
  defaults?: { name: string; cnpj: string } | null;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
      name: client?.legal_name || defaults?.name || "",
      tradeName: client?.trade_name || "",
      cnpj: client?.cnpj || defaults?.cnpj || "",
      owner: client?.owner_name || "",
      email: client?.email || "",
      additionalEmails: (client?.additional_emails || []).join(", "),
      phone: client?.whatsapp || "",
      pref: client?.auto_created
        ? "Somente e-mail"
        : client?.preference || "Somente e-mail",
      notes: client?.notes || "",
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const change =
    (key: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm({ ...form, [key]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: client?.id }),
      }),
      body = await response.json();
    if (!response.ok) {
      setError(body.error);
      setBusy(false);
      return;
    }
    await saved();
  }
  return (
    <div className="overlay" onMouseDown={close}>
      <form
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2>
          {client ? "Editar cliente" : "Novo cliente"}
          <button type="button" className="modalclose" onClick={close}>
            <I.X />
          </button>
        </h2>
        {client?.auto_created && (
          <div className="resultline">
            <b>Cadastro criado automaticamente pela guia.</b> Confira a razão
            social e o CNPJ, informe pelo menos um contato e escolha como este
            cliente deve receber as próximas guias.
          </div>
        )}
        <label>
          Razão social
          <input required value={form.name} onChange={change("name")} />
        </label>
        <label>
          Nome fantasia
          <input value={form.tradeName} onChange={change("tradeName")} />
        </label>
        <div>
          <label>
            CNPJ
            <input required value={form.cnpj} onChange={change("cnpj")} />
          </label>
          <label>
            Responsável
            <input value={form.owner} onChange={change("owner")} />
          </label>
        </div>
        <label>
          E-mail
          <input type="email" value={form.email} onChange={change("email")} />
        </label>
        <label>
          E-mails adicionais
          <textarea value={form.additionalEmails} onChange={change("additionalEmails")} placeholder="financeiro@empresa.com, socio@empresa.com" />
          <small>Separe os destinatários por vírgula, ponto e vírgula ou uma linha por e-mail. Todos receberão a mesma guia.</small>
        </label>
        <div>
          <label>
            WhatsApp
            <input value={form.phone} onChange={change("phone")} />
          </label>
          <label>
            Preferência
            <select value={form.pref} onChange={change("pref")}>
              <option>E-mail + WhatsApp</option>
              <option>Somente e-mail</option>
              <option>Somente WhatsApp</option>
              <option>Envio manual</option>
            </select>
          </label>
        </div>
        <label>
          Observações
          <textarea value={form.notes} onChange={change("notes")} />
        </label>
        {error && <p className="formerror">{error}</p>}
        <div className="modalactions">
          <Button secondary onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </form>
    </div>
  );
}
function Shipments({items}:{items:Shipment[]}){
  return <>
    <Title title="Envios" sub="Histórico real das tentativas de envio por competência." />
    <section className="card queue">
      <div className="tablehead"><h3>Histórico de envios</h3><Badge status={`${items.length} registro(s)`}/></div>
      {items.length?<div className="tablewrap"><table><thead><tr><th>Arquivo</th><th>Tipo</th><th>Cliente</th><th>Canal</th><th>Status</th><th>Enviado/atualizado</th></tr></thead><tbody>
      {items.map(item=><tr key={item.id}><td><b>{item.file}</b></td><td><Badge status={item.type}/></td><td>{item.client}</td><td>{item.channel==='email'?'E-mail':'WhatsApp'}</td><td><Badge status={item.status}/>{item.errorMessage&&<small>{item.errorMessage}</small>}</td><td>{item.sentAt?formatDateTime(item.sentAt):"—"}</td></tr>)}
      </tbody></table></div>:<EmptyLine text="Nenhum envio registrado para esta competência."/>}
    </section>
  </>
}

function Alerts({
  items,
  onRegister,
}: {
  items: Alert[];
  onRegister: (alert: Alert) => void;
}) {
  return (
    <>
      <Title title="Alertas" sub="Pendências geradas pelo processamento." />
      <section className="card alertpage">
        {items.length ? (
          items.map((a) => (
            <div className="alertrow" key={a.id}>
              <span className="alertico yellow">
                <I.TriangleAlert />
              </span>
              <p>
                <b>{a.title}</b>
                <small>{a.type}</small>
              </p>
              {/Cadastro|Cliente não cadastrado/i.test(a.type) && (
                <Button secondary onClick={() => onRegister(a)}>
                  <I.UserPlus />
                  Cadastrar cliente/e-mail
                </Button>
              )}
              <Badge status={a.severity} />
            </div>
          ))
        ) : (
          <EmptyLine text="Nenhum alerta pendente." />
        )}
      </section>
    </>
  );
}
function Settings() {
  const [evo, setEvo] = useState({
      baseUrl: "",
      instance: "",
      apiKey: "",
      enabled: true,
    }),
    [configured, setConfigured] = useState<string[]>([]),
    [gmailReady, setGmailReady] = useState(false),
    [gmailEmail, setGmailEmail] = useState(""),
    [gmailRedirect, setGmailRedirect] = useState(""),
    [subjectTemplate,setSubjectTemplate]=useState("Guia {{tipo}} — {{competencia}} — {{cliente}}"),
    [messageTemplate,setMessageTemplate]=useState("Prezados,\n\nSegue(m) anexo guia(s) de imposto(s) ref. a empresa **{{cliente}}**.\n\n📅 **Data de vencimento:**\n{{vencimento}}\n\n💰 **Valor:**\n{{valor}}\n\nPedimos, por gentileza, que o pagamento seja realizado até a data informada para evitar encargos.\n\nEm caso de dúvidas, estamos à disposição.\n\nAtenciosamente,\n\n***Anselmo Júnior***\n***(77) 9 9174-0886 (zap)***\n***(77) 9 9995-4833***"),
    [groupSubjectTemplate,setGroupSubjectTemplate]=useState("Guias {{tipos}} — {{competencias}} — {{cliente}}"),
    [groupMessageTemplate,setGroupMessageTemplate]=useState("Prezados,\n\nSegue(m) anexo guia(s) de imposto(s) ref. a empresa **{{cliente}}**.\n\n📅 **Data de vencimento:**\n{{vencimento}}\n\n💰 **Valor:**\n{{valor}}\n\nPedimos, por gentileza, que o pagamento seja realizado até a data informada para evitar encargos.\n\nEm caso de dúvidas, estamos à disposição.\n\nAtenciosamente,\n\n***Anselmo Júnior***\n***(77) 9 9174-0886 (zap)***\n***(77) 9 9995-4833***"),
    [installmentSubjectTemplate,setInstallmentSubjectTemplate]=useState("PARCELAMENTO {{competencia_hifen}} - {{cliente_curto}}"),
    [installmentMessageTemplate,setInstallmentMessageTemplate]=useState("Prezados,\n\nSegue anexa a guia de imposto referente ao parcelamento.\n\n📅 Data de vencimento:\n{{vencimento}}.\n\n--\nAtenciosamente,\nEquipe Socium Contábil."),
    [installmentGroupSubjectTemplate,setInstallmentGroupSubjectTemplate]=useState("PARCELAMENTOS {{competencias_hifen}} - {{cliente_curto}}"),
    [installmentGroupMessageTemplate,setInstallmentGroupMessageTemplate]=useState("Prezados,\n\nSeguem anexas as guias de impostos referentes aos parcelamentos.\n\n📅 Datas de vencimento:\n{{vencimentos}}.\n\n--\nAtenciosamente,\nEquipe Socium Contábil."),
    [testing,setTesting]=useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/settings/integrations")
      .then((r) => r.json())
      .then((b) => {
        setConfigured(
          (b.integrations || [])
            .filter((x: { enabled: boolean }) => x.enabled)
            .map((x: { provider: string }) => x.provider),
        );
        setGmailReady(Boolean(b.gmailOAuthReady));
        setGmailRedirect(String(b.gmailRedirectUri || ""));
        const gmail=(b.integrations||[]).find((x:{provider:string})=>x.provider==="gmail");
        setGmailEmail(gmail?.config?.fromEmail||"");
        if(gmail?.config?.subjectTemplate)setSubjectTemplate(gmail.config.subjectTemplate);
        if(gmail?.config?.messageTemplate)setMessageTemplate(gmail.config.messageTemplate);
        if(gmail?.config?.groupSubjectTemplate)setGroupSubjectTemplate(gmail.config.groupSubjectTemplate);
        if(gmail?.config?.groupMessageTemplate)setGroupMessageTemplate(gmail.config.groupMessageTemplate);
        if(gmail?.config?.installmentSubjectTemplate)setInstallmentSubjectTemplate(gmail.config.installmentSubjectTemplate);
        if(gmail?.config?.installmentMessageTemplate)setInstallmentMessageTemplate(gmail.config.installmentMessageTemplate);
        if(gmail?.config?.installmentGroupSubjectTemplate)setInstallmentGroupSubjectTemplate(gmail.config.installmentGroupSubjectTemplate);
        if(gmail?.config?.installmentGroupMessageTemplate)setInstallmentGroupMessageTemplate(gmail.config.installmentGroupMessageTemplate);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search),
      gmail = query.get("gmail"),
      detail = query.get("message");
    const timer=window.setTimeout(()=>{
      if (gmail === "connected") setMessage("Conta Google conectada com sucesso.");
      if (gmail === "error") setMessage(`Erro ao conectar o Google: ${detail || "retorno OAuth inválido."}`);
    },0);
    if (gmail)
      window.history.replaceState({}, "", window.location.pathname);
    return()=>window.clearTimeout(timer);
  }, []);
  async function saveEvolution() {
    setMessage("Salvando…");
    const response = await fetch("/api/settings/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "evolution", ...evo }),
      }),
      body = await response.json();
    if (!response.ok) {
      setMessage(body.error || "Falha ao salvar.");
      return;
    }
    setConfigured((x) => [...new Set([...x, "evolution"])]);
    setMessage("Credenciais salvas e criptografadas.");
    setEvo((x) => ({ ...x, apiKey: "" }));
  }
  async function saveEmailTemplate(){setMessage("Salvando mensagens…");const response=await fetch("/api/settings/integrations",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider:"gmail",subjectTemplate,messageTemplate,groupSubjectTemplate,groupMessageTemplate,installmentSubjectTemplate,installmentMessageTemplate,installmentGroupSubjectTemplate,installmentGroupMessageTemplate})}),body=await response.json();setMessage(response.ok?"Mensagens de guias e parcelamentos salvas com sucesso.":body.error||"Falha ao salvar mensagens.")}
  async function testGmail(){setTesting(true);setMessage("Testando autenticação do Gmail…");const response=await fetch("/api/integrations/gmail/test",{method:"POST"}),body=await response.json();setTesting(false);setMessage(response.ok?`Gmail validado com sucesso: ${body.email}`:body.error||"Falha ao validar Gmail.")}
  return (
    <>
      <Title
        title="Configurações"
        sub="Credenciais de envio armazenadas de forma criptografada no servidor."
      />
      <div className="integration-grid">
        <section className="card settings">
          <h3>Processamento de documentos</h3>
          <p><span className="online" />Serviço operacional</p>
          <p>Os arquivos importados são identificados, organizados e preparados automaticamente para envio.</p>
        </section>
        {false&&<section className="card settings">
          <h3>WhatsApp — Evolution API</h3>
          <p>
            {configured.includes("evolution") ? (
              <>
                <span className="online" />
                Configurada
              </>
            ) : (
              <>Não configurada</>
            )}
          </p>
          <label>
            URL da Evolution API
            <input
              value={evo.baseUrl}
              placeholder="https://evolution.seudominio.com"
              onChange={(e) => setEvo({ ...evo, baseUrl: e.target.value })}
            />
          </label>
          <label>
            Nome da instância
            <input
              value={evo.instance}
              onChange={(e) => setEvo({ ...evo, instance: e.target.value })}
            />
          </label>
          <label>
            API Key
            <input
              type="password"
              autoComplete="new-password"
              value={evo.apiKey}
              onChange={(e) => setEvo({ ...evo, apiKey: e.target.value })}
            />
          </label>
          <Button onClick={() => void saveEvolution()}>
            Salvar Evolution API
          </Button>
          {configured.includes("gmail")&&<Button secondary disabled={testing} onClick={()=>void testGmail()}>{testing?<I.LoaderCircle className="spin"/>:<I.CircleCheck/>}Testar conexão Gmail</Button>}
          <label>Assunto padrão<input value={subjectTemplate} onChange={event=>setSubjectTemplate(event.target.value)}/></label>
          <label>Mensagem padrão<textarea rows={8} value={messageTemplate} onChange={event=>setMessageTemplate(event.target.value)}/></label>
          <small>Variáveis: {"{{cliente}}"}, {"{{tipo}}"}, {"{{competencia}}"}, {"{{vencimento}}"}, {"{{valor}}"} e {"{{arquivo}}"}.</small>
          <label>Assunto para várias guias<input value={groupSubjectTemplate} onChange={event=>setGroupSubjectTemplate(event.target.value)}/></label>
          <label>Mensagem para várias guias<textarea rows={8} value={groupMessageTemplate} onChange={event=>setGroupMessageTemplate(event.target.value)}/></label>
          <small>Para lotes, use também {"{{quantidade}}"}, {"{{tipos}}"} e {"{{competencias}}"}.</small>
          <Button disabled={!configured.includes("gmail")} onClick={()=>void saveEmailTemplate()}><I.Save/>Salvar mensagem padrão</Button>
        </section>}
        <section className="card settings">
          <h3>E-mail — Gmail API</h3>
          <p>
            {configured.includes("gmail") ? (
              <>
                <span className="online" />
                Conectada{gmailEmail ? ` como ${gmailEmail}` : ""}
              </>
            ) : (
              <>Não conectada</>
            )}
          </p>
          <p>
            O Client ID e o Client Secret ficam somente nas variáveis do
            servidor. A autorização da conta gera e armazena o token de
            renovação criptografado.
          </p>
          {gmailRedirect && (
            <label>
              URI de redirecionamento para cadastrar no Google
              <input
                readOnly
                value={gmailRedirect}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
          )}
          <Button
            disabled={!gmailReady}
            onClick={() => {
              window.location.href = "/api/integrations/gmail/connect";
            }}
          >
            <I.Mail />
            {configured.includes("gmail")
              ? "Reconectar conta Google"
              : "Conectar conta Google"}
          </Button>
          {configured.includes("gmail")&&<Button secondary disabled={testing} onClick={()=>void testGmail()}>{testing?<I.LoaderCircle className="spin"/>:<I.CircleCheck/>}Testar conexão Gmail</Button>}
          <h3>Mensagens de guias</h3>
          <label>Assunto — uma guia<input value={subjectTemplate} onChange={event=>setSubjectTemplate(event.target.value)}/></label>
          <label>Mensagem — uma guia<textarea rows={8} value={messageTemplate} onChange={event=>setMessageTemplate(event.target.value)}/></label>
          <label>Assunto — várias guias<input value={groupSubjectTemplate} onChange={event=>setGroupSubjectTemplate(event.target.value)}/></label>
          <label>Mensagem — várias guias<textarea rows={8} value={groupMessageTemplate} onChange={event=>setGroupMessageTemplate(event.target.value)}/></label>
          <small>Variáveis: {"{{cliente}}"}, {"{{tipo}}"}, {"{{tipos}}"}, {"{{competencia}}"}, {"{{competencias}}"}, {"{{vencimento}}"}, {"{{vencimentos}}"}, {"{{valor}}"}, {"{{quantidade}}"} e {"{{arquivo}}"}.</small>
          <h3>Mensagens de parcelamentos</h3>
          <label>Assunto — um parcelamento<input value={installmentSubjectTemplate} onChange={event=>setInstallmentSubjectTemplate(event.target.value)}/></label>
          <label>Mensagem — um parcelamento<textarea rows={8} value={installmentMessageTemplate} onChange={event=>setInstallmentMessageTemplate(event.target.value)}/></label>
          <label>Assunto — vários parcelamentos<input value={installmentGroupSubjectTemplate} onChange={event=>setInstallmentGroupSubjectTemplate(event.target.value)}/></label>
          <label>Mensagem — vários parcelamentos<textarea rows={8} value={installmentGroupMessageTemplate} onChange={event=>setInstallmentGroupMessageTemplate(event.target.value)}/></label>
          <small>Variáveis adicionais: {"{{cliente_curto}}"}, {"{{competencia_hifen}}"} e {"{{competencias_hifen}}"}. O sistema escolhe automaticamente o texto singular ou plural pela quantidade de anexos.</small>
          <Button disabled={!configured.includes("gmail")} onClick={()=>void saveEmailTemplate()}><I.Save/>Salvar mensagens de e-mail</Button>
          {!gmailReady && (
            <small>
              A integração de e-mail ainda não está disponível. Contate o suporte.
            </small>
          )}
        </section>
      </div>
      {message && <div className="resultline">{message}</div>}
    </>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <>
      <Title title={title} sub="" />
      <section className="card empty-state">
        <I.Database />
        <h2>{text}</h2>
      </section>
    </>
  );
}
function EmptyLine({ text }: { text: string }) {
  return (
    <div className="emptyline">
      <I.Database size={20} />
      {text}
    </div>
  );
}
