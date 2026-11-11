"use client";
import { useMemo, useRef, useState } from "react";
import * as I from "lucide-react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { alerts, clients, jobs } from "@/lib/data";

type Page =
  | "Visão geral"
  | "Importar Guias"
  | "Processamentos"
  | "Clientes"
  | "Envios"
  | "Alertas"
  | "Configurações";
const nav: [Page, React.ElementType][] = [
  ["Visão geral", I.House],
  ["Importar Guias", I.CloudUpload],
  ["Processamentos", I.Clock3],
  ["Clientes", I.Users],
  ["Envios", I.Send],
  ["Alertas", I.Bell],
  ["Configurações", I.Settings],
];
const IconButton = ({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
}) => (
  <button
    type="button"
    className="iconbtn"
    title={label}
    aria-label={label}
    onClick={onClick}
  >
    {children}
  </button>
);
function Button({
  children,
  secondary = false,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  secondary?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={"btn " + (secondary ? "secondary" : "")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Badge({ status }: { status: string }) {
  const c =
    status === "Concluído" || status === "Ativo" || status === "Enviado"
      ? "green"
      : status === "Erro" || status === "Crítico"
        ? "red"
        : status === "Revisar" ||
            status === "Incompleto" ||
            status === "Atenção"
          ? "yellow"
          : status === "Processando"
            ? "blue"
            : "gray";
  return <span className={"badge " + c}>{status}</span>;
}
function Sidebar({
  page,
  setPage,
  collapsed,
  setCollapsed,
}: {
  page: Page;
  setPage: (p: Page) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}) {
  return (
    <aside>
      <img className="logo" src="/api/logo" alt="Socium Contábil" />
      <nav>
        {nav.map(([n, Icon]) => (
          <button
            title={collapsed ? n : undefined}
            key={n}
            onClick={() => setPage(n)}
            className={page === n ? "active" : ""}
          >
            <Icon size={21} />
            <span>{n}</span>
          </button>
        ))}
      </nav>
      <button
        type="button"
        className="collapse"
        onClick={() => setCollapsed(!collapsed)}
      >
        <I.CircleChevronLeft className={collapsed ? "flipped" : ""} size={20} />
        <span>{collapsed ? "Expandir menu" : "Recolher menu"}</span>
      </button>
    </aside>
  );
}
const periods = [
  "Julho 2026",
  "Junho 2026",
  "Maio 2026",
  "Abril 2026",
  "Março 2026",
  "Fevereiro 2026",
];
function Header({
  page,
  period,
  setPeriod,
  go,
}: {
  page: Page;
  period: string;
  setPeriod: (p: string) => void;
  go: (p: Page) => void;
}) {
  const [open, setOpen] = useState<
    "period" | "notifications" | "profile" | null
  >(null);
  return (
    <header>
      <div>
        <u>
          {page === "Clientes"
            ? "Cadastros"
            : page === "Visão geral"
              ? "Painel"
              : "Automação"}
        </u>
        <span>/</span>
        <b>{page}</b>
      </div>
      <div className="headright">
        <div className="headmenu">
          <button
            type="button"
            className="month"
            aria-expanded={open === "period"}
            onClick={() => setOpen(open === "period" ? null : "period")}
          >
            <I.CalendarDays size={18} />
            {period}
            <I.ChevronDown size={16} />
          </button>
          {open === "period" && (
            <div className="dropdown periodmenu">
              {periods.map((p) => (
                <button
                  type="button"
                  className={p === period ? "selected" : ""}
                  key={p}
                  onClick={() => {
                    setPeriod(p);
                    setOpen(null);
                  }}
                >
                  {p}
                  {p === period && <I.Check size={16} />}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="headmenu">
          <IconButton
            label="Notificações"
            onClick={() =>
              setOpen(open === "notifications" ? null : "notifications")
            }
          >
            <I.Bell size={21} />
            <i>3</i>
          </IconButton>
          {open === "notifications" && (
            <div className="dropdown notifications">
              <h4>
                Notificações{" "}
                <button type="button" onClick={() => go("Alertas")}>
                  Ver todas
                </button>
              </h4>
              {alerts.slice(0, 3).map((a) => (
                <button
                  type="button"
                  key={a.title}
                  onClick={() => {
                    go("Alertas");
                    setOpen(null);
                  }}
                >
                  <I.TriangleAlert size={18} />
                  <span>
                    <b>{a.title}</b>
                    <small>{a.detail}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="headmenu">
          <button
            type="button"
            className="profilebtn"
            onClick={() => setOpen(open === "profile" ? null : "profile")}
          >
            <span className="avatar">KS</span>
            <I.ChevronDown size={15} />
          </button>
          {open === "profile" && (
            <div className="dropdown profilemenu">
              <div>
                <span className="avatar">KS</span>
                <p>
                  <b>Karina Souza</b>
                  <small>Administradora</small>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  go("Configurações");
                  setOpen(null);
                }}
              >
                <I.UserRound size={17} />
                Meu perfil
              </button>
              <button
                type="button"
                onClick={() => {
                  go("Configurações");
                  setOpen(null);
                }}
              >
                <I.Settings size={17} />
                Configurações
              </button>
              <button type="button">
                <I.LogOut size={17} />
                Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
type Metric = [string, string, React.ElementType, string];
const metrics: Record<"overview" | "processing" | "clients", Metric[]> = {
  overview: [
    ["248", "Documentos", I.FileText, "blue"],
    ["221", "Enviados", I.Send, "green"],
    ["18", "Processando", I.LoaderCircle, "blue"],
    ["9", "Com atenção", I.TriangleAlert, "yellow"],
  ],
  processing: [
    ["248", "Processados hoje", I.FileText, "blue"],
    ["12", "Na fila", I.Clock3, "green"],
    ["4", "Em andamento", I.LoaderCircle, "gray"],
    ["3", "Com erro", I.TriangleAlert, "red"],
  ],
  clients: [
    ["248", "Total de clientes", I.Users, "blue"],
    ["231", "Ativos", I.CircleCheck, "green"],
    ["12", "Cadastros incompletos", I.CircleAlert, "yellow"],
    ["5", "Sem canal de envio", I.Ban, "gray"],
  ],
};
function Metrics({ kind }: { kind: keyof typeof metrics }) {
  return (
    <div className="metrics">
      {metrics[kind].map(([v, l, Icon, c]) => (
        <div className="metric" key={l as string}>
          <span className={"metricicon " + c}>
            <Icon size={31} />
          </span>
          <div>
            <strong>{v as string}</strong>
            <small>{l as string}</small>
          </div>
        </div>
      ))}
    </div>
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
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
function Overview({ go }: { go: (p: Page) => void }) {
  const data = [
    ["Fev", 88, 60],
    ["Mar", 120, 83],
    ["Abr", 153, 107],
    ["Mai", 176, 130],
    ["Jun", 198, 145],
    ["Jul", 235, 214],
  ].map((x) => ({ m: x[0], p: x[1], e: x[2] }));
  return (
    <>
      <Title
        title="Visão geral"
        sub="Acompanhe os processamentos, envios e pendências do escritório."
        actions={
          <Button onClick={() => go("Importar Guias")}>
            <I.CloudUpload />
            Importar arquivos
          </Button>
        }
      />
      <Metrics kind="overview" />
      <div className="charts">
        <section className="card chart">
          <h3>Processamentos por competência</h3>
          <div className="legend">
            <i className="bl" />
            Processados <i className="gr" />
            Enviados
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={data}>
              <CartesianGrid stroke="#e5eaf3" vertical={false} />
              <XAxis dataKey="m" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} />
              <Tooltip />
              <Line dataKey="p" stroke="#0865f5" strokeWidth={2} />
              <Line dataKey="e" stroke="#17a65b" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </section>
        <section className="card donutcard">
          <h3>Status dos envios</h3>
          <Donut />
          <div className="donutlabels">
            <b>
              ● 89% <span>Enviados</span>
            </b>
            <b>
              ● 7% <span>Processando</span>
            </b>
            <b>
              ● 4% <span>Com atenção</span>
            </b>
          </div>
        </section>
      </div>
      <div className="bottom">
        <section className="card recent">
          <h3>Atividade recente</h3>
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Documento</th>
                <th>Competência</th>
                <th>Status</th>
                <th>Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {jobs.slice(0, 5).map((j) => (
                <tr key={j.id}>
                  <td>{j.client}</td>
                  <td>{j.file}</td>
                  <td>07/2026</td>
                  <td>
                    <Badge
                      status={j.status === "Concluído" ? "Enviado" : j.status}
                    />
                  </td>
                  <td>{j.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <div className="sidecards">
          <section className="card priorities">
            <h3>Pendências prioritárias</h3>
            {alerts.slice(0, 3).map((a, i) => (
              <div key={a.title}>
                <span className={"alertico " + (i === 1 ? "red" : "yellow")}>
                  <I.TriangleAlert />
                </span>
                <p>
                  <b>{a.title}</b>
                  <small>{a.detail}</small>
                </p>
                <I.ChevronRight />
              </div>
            ))}
          </section>
          <section className="card deadline">
            <span>
              <I.CalendarDays />
            </span>
            <p>
              <b>Próximo vencimento: 20 jul</b>
              <small>32 documentos</small>
            </p>
            <I.ChevronRight />
          </section>
        </div>
      </div>
    </>
  );
}
function Donut() {
  return (
    <div className="donut">
      <ResponsiveContainer width="100%" height={170}>
        <PieChart>
          <Pie
            data={[{ v: 89 }, { v: 7 }, { v: 4 }]}
            dataKey="v"
            innerRadius={50}
            outerRadius={73}
            paddingAngle={3}
          >
            {["#1bab5b", "#3188f5", "#ffb000"].map((c) => (
              <Cell key={c} fill={c} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
type Upload = {
  id: string;
  file: File;
  hash: string;
  status: "Pronto" | "Enviando" | "Duplicado";
  progress: number;
};
function ImportPage() {
  const [files, setFiles] = useState<Upload[]>([]),
    [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function add(list: FileList | null) {
    if (!list) return;
    const next: Upload[] = [];
    for (const file of Array.from(list)) {
      if (file.type !== "application/pdf" || file.size > 20 * 1024 * 1024)
        continue;
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
        ),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      next.push({
        id: crypto.randomUUID(),
        file,
        hash,
        status: [...files, ...next].some((x) => x.hash === hash)
          ? "Duplicado"
          : "Pronto",
        progress: 0,
      });
    }
    setFiles((x) => [...x, ...next]);
  }
  async function process() {
    for (const f of files.filter((x) => x.status === "Pronto")) {
      setFiles((x) =>
        x.map((y) =>
          y.id === f.id ? { ...y, status: "Enviando", progress: 35 } : y,
        ),
      );
      const body = new FormData();
      body.append("file", f.file);
      body.append("competence", "07/2026");
      try {
        await fetch("/api/documents", { method: "POST", body });
        setFiles((x) =>
          x.map((y) => (y.id === f.id ? { ...y, progress: 100 } : y)),
        );
      } catch {
        setFiles((x) =>
          x.map((y) =>
            y.id === f.id ? { ...y, status: "Pronto", progress: 0 } : y,
          ),
        );
      }
    }
  }
  return (
    <>
      <Title
        title="Importar Guias"
        sub="Envie vários documentos para leitura, identificação e distribuição automática."
      />
      <div className="importtop">
        <div
          className="drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            add(e.dataTransfer.files);
          }}
        >
          <I.CloudUpload size={64} />
          <h2>Arraste os arquivos DAS aqui</h2>
          <p>PDF • até 20 MB por arquivo • envio em lote</p>
          <input
            ref={input}
            type="file"
            accept="application/pdf"
            multiple
            hidden
            onChange={(e) => add(e.target.files)}
          />
          <Button onClick={() => input.current?.click()}>
            Selecionar arquivos
          </Button>
          {files.length > 0 && <b>{files.length} arquivo(s) selecionado(s)</b>}
        </div>
        <section className="card summary">
          <h3>Resumo do processamento</h3>
          <Donut />
          <p>
            <b>{24 + files.length}</b> arquivos
            <br />
            <b>18</b> concluídos
            <br />
            <b>
              {4 + files.filter((f) => f.status === "Enviando").length}
            </b>{" "}
            processando
            <br />
            <b>
              {2 + files.filter((f) => f.status === "Duplicado").length}
            </b>{" "}
            com atenção
          </p>
        </section>
      </div>
      <section className="card queue">
        <div className="tablehead">
          <h3>Fila de processamento</h3>
          <div className="search">
            <I.Search />
            <input
              placeholder="Buscar arquivo ou cliente"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button onClick={process}>Iniciar processamento</Button>
        </div>
        {files.length > 0 && (
          <div className="uploads">
            {files
              .filter((f) =>
                f.file.name.toLowerCase().includes(query.toLowerCase()),
              )
              .map((f) => (
                <div key={f.id}>
                  <I.FileText />
                  <p>
                    <b>{f.file.name}</b>
                    <small>{(f.file.size / 1024 / 1024).toFixed(1)} MB</small>
                  </p>
                  <div className="progress">
                    <span style={{ width: f.progress + "%" }} />
                  </div>
                  <Badge status={f.status} />
                  <IconButton label="Remover">
                    <I.X
                      onClick={() =>
                        setFiles((x) => x.filter((y) => y.id !== f.id))
                      }
                    />
                  </IconButton>
                </div>
              ))}
          </div>
        )}
        <JobsTable compact />
      </section>
    </>
  );
}
function JobsTable({
  compact = false,
  onSelect,
}: {
  compact?: boolean;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Arquivo</th>
            <th>Cliente</th>
            {!compact && <th>Etapa atual</th>}
            <th>Progresso</th>
            {!compact && (
              <>
                <th>Iniciado em</th>
                <th>Duração</th>
              </>
            )}
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} onClick={() => onSelect?.(j.id)}>
              <td>
                <b>{j.file}</b>
                <small>{j.size}</small>
              </td>
              <td>
                {j.client}
                <small>{j.cnpj}</small>
              </td>
              {!compact && <td>{j.stage}</td>}
              <td>
                {j.progress ? (
                  <>
                    <small>{j.progress}%</small>
                    <div className="progress">
                      <span style={{ width: `${j.progress}%` }} />
                    </div>
                  </>
                ) : (
                  <span>—</span>
                )}
              </td>
              {!compact && (
                <>
                  <td>{j.time}</td>
                  <td>{j.duration}</td>
                </>
              )}
              <td>
                <Badge status={j.status} />
              </td>
              <td>
                <I.MoreVertical size={18} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Processings() {
  const [selected, setSelected] = useState("5");
  const job = jobs.find((j) => j.id === selected)!;
  return (
    <>
      <Title
        title="Processamentos"
        sub="Acompanhe a leitura e a preparação dos documentos em tempo real."
        actions={
          <>
            <Button secondary>
              <I.RefreshCw />
              Reprocessar erros
            </Button>
            <Button>
              <I.CloudUpload />
              Importar arquivos
            </Button>
          </>
        }
      />
      <Metrics kind="processing" />
      <div className="split">
        <section className="card queue">
          <div className="tablehead">
            <h3>Fila de processamento</h3>
            <div className="search">
              <I.Search />
              <input placeholder="Buscar arquivo, cliente ou CNPJ" />
            </div>
            <select>
              <option>Status</option>
            </select>
            <select>
              <option>Etapa</option>
            </select>
            <select>
              <option>Período</option>
            </select>
          </div>
          <div className="tabs">
            Todos <span>267</span>　 Em andamento <span>4</span>　 Com erro{" "}
            <span>3</span>
          </div>
          <JobsTable onSelect={setSelected} />
          <footer>
            1–25 de 267 processamentos{" "}
            <span>
              ‹　<b>1</b>　2　3　4　5　…　11　›
            </span>
          </footer>
        </section>
        <Detail job={job} />
      </div>
    </>
  );
}
function Detail({ job }: { job: (typeof jobs)[number] }) {
  return (
    <section className="card detail">
      <h3>
        Detalhes do processamento <I.X size={19} />
      </h3>
      <h4>
        <I.FileText />
        {job.file}
      </h4>
      <small>Cliente</small>
      <p>
        {job.client}
        <small>{job.cnpj}</small>
      </p>
      <small>Status</small>
      <p>
        <Badge status={job.status} />
      </p>
      <div className="timeline">
        {[
          "Arquivo recebido",
          "Leitura do PDF",
          "Identificação do cliente",
          "Renomeação",
        ].map((s, i) => (
          <div className={i < 2 ? "done" : i === 2 ? "fail" : ""} key={s}>
            <I.CircleCheck />
            <p>
              <b>{s}</b>
              <small>
                {i < 2
                  ? "15/07/2026 07:58"
                  : i === 2
                    ? "CNPJ não localizado na base de clientes."
                    : "Aguardando processamento"}
              </small>
            </p>
          </div>
        ))}
      </div>
      <Button secondary>Vincular cliente</Button>
      <Button>Tentar novamente</Button>
    </section>
  );
}
type Client = (typeof clients)[number];
function Clients() {
  const [items, setItems] = useState<Client[]>(clients),
    [selected, setSelected] = useState("2"),
    [query, setQuery] = useState(""),
    [editing, setEditing] = useState<Client | null | undefined>(undefined);
  const c = items.find((x) => x.id === selected) ?? items[0];
  const shown = items.filter((x) =>
    (x.name + x.cnpj + x.email).toLowerCase().includes(query.toLowerCase()),
  );
  function save(value: Client) {
    setItems((current) =>
      current.some((x) => x.id === value.id)
        ? current.map((x) => (x.id === value.id ? value : x))
        : [value, ...current],
    );
    setSelected(value.id);
    setEditing(undefined);
  }
  return (
    <>
      <Title
        title="Clientes"
        sub="Gerencie os dados e os canais de envio das empresas."
        actions={
          <>
            <label className="btn secondary">
              <I.FileUp />
              Importar planilha
              <input hidden type="file" accept=".csv,.xlsx" />
            </label>
            <Button onClick={() => setEditing(null)}>
              <I.Plus />
              Novo cliente
            </Button>
          </>
        }
      />
      <Metrics kind="clients" />
      <div className="split clientsplit">
        <section className="card queue">
          <div className="tablehead">
            <h3>Base de clientes</h3>
            <div className="search">
              <I.Search />
              <input
                placeholder="Buscar por empresa, CNPJ ou contato"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select>
              <option>Status</option>
            </select>
            <select>
              <option>Canal de envio</option>
            </select>
          </div>
          <div className="notice">
            <I.TriangleAlert />
            17 clientes precisam atualizar os dados de contato{" "}
            <b>Revisar cadastros　›</b>
          </div>
          <div className="tabs">
            Todos <span>{items.length}</span>　 Ativos{" "}
            <span>{items.filter((x) => x.status === "Ativo").length}</span>　
            Com pendências{" "}
            <span>{items.filter((x) => x.status === "Incompleto").length}</span>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>CNPJ</th>
                  <th>Contato</th>
                  <th>Preferência</th>
                  <th>Último envio</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((x) => (
                  <tr
                    className={x.id === selected ? "selectedrow" : ""}
                    key={x.id}
                    onClick={() => setSelected(x.id)}
                  >
                    <td>
                      <b>{x.name}</b>
                      <small>{x.owner}</small>
                    </td>
                    <td>{x.cnpj}</td>
                    <td>
                      {x.email}
                      <small>{x.phone}</small>
                    </td>
                    <td>
                      <Badge status={x.pref} />
                    </td>
                    <td>{x.last}</td>
                    <td>
                      <Badge status={x.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer>
            1–{items.length} de {items.length} clientes
          </footer>
        </section>
        <section className="card detail clientdetail">
          <h3>
            Resumo do cliente <I.X size={19} />
          </h3>
          <div className="person">
            <span>
              {c.name
                .split(" ")
                .slice(0, 2)
                .map((x) => x[0])
                .join("")}
            </span>
            <p>
              <b>{c.name}</b>
              <small>Cliente desde 12/03/2024</small>
            </p>
          </div>
          {[
            ["CNPJ", c.cnpj],
            ["E-mail", c.email],
            ["WhatsApp", c.phone],
            ["Preferência de envio", c.pref],
            ["Status", c.status],
            ["Último envio", c.last],
          ].map(([a, b]) => (
            <p key={a}>
              <small>{a}</small>
              {b}
            </p>
          ))}
          <Button secondary>
            <I.Clock3 />
            Ver histórico
          </Button>
          <Button onClick={() => setEditing(c)}>
            <I.Pencil />
            Editar cadastro
          </Button>
        </section>
      </div>
      {editing !== undefined && (
        <ClientModal
          client={editing}
          close={() => setEditing(undefined)}
          save={save}
        />
      )}
    </>
  );
}
function ClientModal({
  client,
  close,
  save,
}: {
  client: Client | null;
  close: () => void;
  save: (c: Client) => void;
}) {
  const [form, setForm] = useState({
    name: client?.name ?? "",
    tradeName: "",
    cnpj: client?.cnpj ?? "",
    owner: client?.owner ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    pref: client?.pref ?? "E-mail + WhatsApp",
    notes: "",
  });
  const field =
    (key: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm((v) => ({ ...v, [key]: e.target.value }));
  return (
    <div className="overlay" onMouseDown={close}>
      <form
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save({
            id: client?.id ?? crypto.randomUUID(),
            name: form.name,
            owner: form.owner,
            cnpj: form.cnpj,
            email: form.email,
            phone: form.phone,
            pref: form.pref,
            status: client?.status ?? "Ativo",
            last: client?.last ?? "Nenhum envio",
          });
        }}
      >
        <h2>
          {client ? "Editar cliente" : "Novo cliente"}{" "}
          <button
            type="button"
            className="modalclose"
            aria-label="Fechar"
            onClick={close}
          >
            <I.X />
          </button>
        </h2>
        <label>
          Razão social
          <input required value={form.name} onChange={field("name")} />
        </label>
        <label>
          Nome fantasia
          <input value={form.tradeName} onChange={field("tradeName")} />
        </label>
        <div>
          <label>
            CNPJ
            <input
              required
              value={form.cnpj}
              onChange={field("cnpj")}
              placeholder="00.000.000/0000-00"
            />
          </label>
          <label>
            Responsável
            <input required value={form.owner} onChange={field("owner")} />
          </label>
        </div>
        <label>
          E-mail principal
          <input
            required
            type="email"
            value={form.email}
            onChange={field("email")}
          />
        </label>
        <div>
          <label>
            WhatsApp
            <input value={form.phone} onChange={field("phone")} />
          </label>
          <label>
            Preferência
            <select value={form.pref} onChange={field("pref")}>
              <option>E-mail + WhatsApp</option>
              <option>Somente e-mail</option>
              <option>Somente WhatsApp</option>
              <option>Envio manual</option>
            </select>
          </label>
        </div>
        <label>
          Observações
          <textarea value={form.notes} onChange={field("notes")} />
        </label>
        <div className="modalactions">
          <Button secondary onClick={close}>
            Cancelar
          </Button>
          <Button type="submit">
            {client ? "Salvar alterações" : "Salvar cliente"}
          </Button>
        </div>
      </form>
    </div>
  );
}
function Alerts() {
  const [resolved, setResolved] = useState<string[]>([]);
  return (
    <>
      <Title
        title="Alertas"
        sub="Acompanhe pendências e ocorrências que precisam de atenção."
      />
      <section className="card alertpage">
        <div className="tablehead">
          <h3>Central de alertas</h3>
          <select>
            <option>Todos os tipos</option>
          </select>
          <select>
            <option>Severidade</option>
          </select>
          <select>
            <option>Últimos 30 dias</option>
          </select>
        </div>
        {alerts.map((a) => (
          <div
            className={
              "alertrow " + (resolved.includes(a.title) ? "resolved" : "")
            }
            key={a.title}
          >
            <span className="alertico yellow">
              <I.TriangleAlert />
            </span>
            <p>
              <b>{a.title}</b>
              <small>
                {a.type} • {a.detail}
              </small>
            </p>
            <Badge
              status={resolved.includes(a.title) ? "Resolvido" : a.severity}
            />
            <Button
              secondary
              onClick={() => setResolved((x) => [...x, a.title])}
            >
              Ver documento
            </Button>
            <Button onClick={() => setResolved((x) => [...x, a.title])}>
              Marcar resolvido
            </Button>
          </div>
        ))}
      </section>
    </>
  );
}
function ComingSoon({
  page,
}: {
  page: "Envios" | "Alertas" | "Configurações";
}) {
  return (
    <>
      <Title title={page} sub="" />
      <section className="coming development-state">
        <img
          src="/api/development-image"
          alt="Em desenvolvimento. O módulo estará disponível em breve."
        />
      </section>
    </>
  );
}
function Settings() {
  return (
    <>
      <Title
        title="Configurações"
        sub="Configure integrações, limites e preferências do escritório."
      />
      <section className="card settings">
        <h3>Automação de documentos</h3>
        <p>
          <span className="online" />
          Modo demonstração ativo
        </p>
        <label>
          URL do webhook
          <input placeholder="Configurado por variável de ambiente" disabled />
        </label>
        <h3>Importação</h3>
        <label>
          Limite por arquivo
          <input value="20 MB" readOnly />
        </label>
        <Button>Salvar configurações</Button>
      </section>
    </>
  );
}
export function App() {
  const [page, setPage] = useState<Page>("Visão geral"),
    [collapsed, setCollapsed] = useState(false),
    [period, setPeriod] = useState("Julho 2026");
  const content = useMemo(
    () =>
      page === "Visão geral" ? (
        <Overview go={setPage} />
      ) : page === "Importar Guias" ? (
        <ImportPage />
      ) : page === "Processamentos" ? (
        <Processings />
      ) : page === "Clientes" ? (
        <Clients />
      ) : (
        <ComingSoon page={page} />
      ),
    [page],
  );
  return (
    <div
      className={"app " + (collapsed ? "sidebar-collapsed" : "")}
      data-period={period}
    >
      <Sidebar
        page={page}
        setPage={setPage}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />
      <main>
        <Header
          page={page}
          period={period}
          setPeriod={setPeriod}
          go={setPage}
        />
        <div className="content">{content}</div>
      </main>
    </div>
  );
}
