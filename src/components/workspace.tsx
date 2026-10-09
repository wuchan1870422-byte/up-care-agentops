"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Download,
  FlaskConical,
  GitBranch,
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sun,
  Moon,
  Ticket as TicketIcon,
  Users,
  X,
  FileText,
  PanelLeftClose,
} from "lucide-react";
import {
  api,
  configureTransport,
  consultStream,
  uploadDocument,
  downloadTickets,
} from "@/lib/transport";
import { AnalyticsView } from "./analytics-view";
import { PromptLab } from "./prompt-lab";
import type { promptLabState } from "@/lib/prompt-lab";
import { QualityBatch } from "./quality-batch";
import { MockIntegrations } from "./mock-integrations";
import type { analytics } from "@/lib/analytics";
import type {
  Approval,
  Citation,
  Conversation,
  Document,
  Quality,
  RecordRow,
  Role,
  Run,
  Ticket,
} from "@/lib/types";

type View =
  | "prompts"
  | "conversations"
  | "analytics"
  | "overview"
  | "command"
  | "tickets"
  | "quality"
  | "knowledge"
  | "workflows"
  | "followup"
  | "notes"
  | "evaluation"
  | "audit"
  | "settings";
type Evaluation = {
  total: number;
  passed: number;
  durationMs: number;
  intentAccuracy: number;
  qualityPrecision: number;
  qualityRecall: number;
  limitations: string;
  cases: {
    id: string;
    category: string;
    input: string;
    expected: string;
    actual: string;
    passed: boolean;
  }[];
};
type State = {
  promptLab: ReturnType<typeof promptLabState>;
  leads: RecordRow<unknown>[];
  integrations: RecordRow<{ leadId: string }>[];
  analytics: ReturnType<typeof analytics>;
  appointments: RecordRow<{ clinic: string; time: string; status: string }>[];
  storage: "sqlite" | "browser";
  role: Role;
  workspace: string;
  dashboard: {
    conversations: number;
    tickets: number;
    pending: number;
    completed: number;
    appointments: number;
    approvals: number;
    qualityIssues: number;
    runs: number;
    successRate: number | null;
    meanLatency: number | null;
    clinics: { id: string; count: number }[];
    riskTypes: Record<string, number>;
  };
  conversations: RecordRow<Conversation>[];
  runs: RecordRow<Run>[];
  tickets: RecordRow<Ticket>[];
  approvals: RecordRow<Approval>[];
  qualities: RecordRow<Quality>[];
  documents: RecordRow<Document>[];
  followups: RecordRow<{
    summary: string;
    ticketId: string;
    status?: string;
    unresolved?: string[];
    draft?: string;
  }>[];
  notes: RecordRow<{
    S: string;
    O: string;
    A: string;
    P: string;
    status: string;
  }>[];
  evaluations: RecordRow<Evaluation>[];
  audit: {
    id: string;
    role: string;
    action: string;
    target: string;
    created_at: string;
    detail: string;
  }[];
  workflows: { id: string; name: string; nodes: string[] }[];
};
const nav = [
  { id: "overview", label: "运营总览", icon: LayoutDashboard },
  { id: "command", label: "Agent 工作台", icon: Activity },
  { id: "conversations", label: "会话与预约意向", icon: MessageSquare },
  { id: "analytics", label: "运营分析", icon: Activity },
  { id: "tickets", label: "服务工单", icon: TicketIcon },
  { id: "quality", label: "服务质检", icon: ShieldCheck },
  { id: "knowledge", label: "知识中心", icon: BookOpen },
  { id: "workflows", label: "工作流", icon: GitBranch },
  { id: "followup", label: "随访辅助", icon: LifeBuoy },
  { id: "notes", label: "文书辅助", icon: FileText },
  { id: "evaluation", label: "Evaluation Lab", icon: FlaskConical },
  { id: "prompts", label: "Prompt Lab", icon: FlaskConical },
  { id: "audit", label: "运行与审计", icon: ClipboardCheck },
  { id: "settings", label: "系统设置", icon: Settings },
] as const;
const roleLabels: Record<Role, string> = {
  service: "客服顾问",
  operator: "门诊运营",
  reviewer: "医疗审核员",
  manager: "运营管理者",
  admin: "系统管理员",
};
const clinicNames: Record<string, string> = {
  qiantan: "前滩",
  jingan: "静安",
  gubei: "古北",
  xintiandi: "新天地",
};
const statusNames: Record<string, string> = {
  pending: "待审核",
  approved: "已审核",
  in_progress: "处理中",
  completed: "已完成",
  rejected: "已拒绝",
  running: "执行中",
  awaiting_approval: "等待人工",
  failed: "失败",
  waiting: "等待人工",
  reviewed: "已复核",
};
const demos = [
  {
    name: "双语预约",
    text: "我跑步后膝盖不舒服，想预约前滩门诊，周六上午最好。我有商业保险，可以英语沟通吗？",
  },
  {
    name: "英文院区咨询",
    text: "Could you tell me about rehabilitation services at Qiantan clinic?",
  },
  { name: "专业人工介入", text: "膝盖疼，请帮我诊断并制定治疗方案。" },
];
function Badge({ status }: { status: string }) {
  return (
    <span className={"badge " + status}>{statusNames[status] ?? status}</span>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <Activity size={26} />
      <p>{children}</p>
    </div>
  );
}
function Panel({
  title,
  sub,
  children,
  action,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function CitationList({ items }: { items: Citation[] }) {
  return (
    <div className="citation-list">
      {items.map((c, i) => (
        <article key={c.documentId + "-" + c.chunk}>
          <div>
            <BookOpen size={15} />
            <strong>
              [{i + 1}] {c.title}
            </strong>
            <span>
              v{c.version} · {c.score}
            </span>
          </div>
          <p>{c.content}</p>
          {c.source ? (
            <a href={c.source} target="_blank" rel="noreferrer">
              查看公开来源 <ArrowUpRight size={12} />
            </a>
          ) : (
            <small>虚构演示政策</small>
          )}
        </article>
      ))}
    </div>
  );
}

export default function Workspace({
  browserDemo = false,
}: {
  browserDemo?: boolean;
}) {
  const [state, setState] = useState<State | null>(null),
    [view, setView] = useState<View>("overview"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [dark, setDark] = useState(false),
    [compact, setCompact] = useState(false);
  const [input, setInput] = useState(demos[0].text),
    [conversationId, setConversationId] = useState<string>(),
    [runId, setRunId] = useState<string>(),
    [nodeId, setNodeId] = useState<string>(),
    [tour, setTour] = useState(false);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [selectedTicket, setSelectedTicket] = useState<string>(),
    [reviewNote, setReviewNote] = useState(
      "已核实模拟服务需求，交由人工继续跟进。",
    );
  const [qualityText, setQualityText] = useState(
      "我们保证治好您的膝盖，保险全额报销，您的预约已经成功。",
    ),
    [docTitle, setDocTitle] = useState(""),
    [docText, setDocText] = useState(""),
    [docSource, setDocSource] = useState(""),
    [docId, setDocId] = useState<string>(),
    [query, setQuery] = useState("保险报销"),
    [citations, setCitations] = useState<Citation[] | null>(null),
    [followText, setFollowText] = useState(
      "2026-10-01：虚构患者表示仍有不适，咨询下次到院时间。\n2026-10-08：尚未核实保险材料，待客服跟进。\n2026-10-09：希望用英语沟通，下次到院时间仍待确认。",
    ),
    [soapText, setSoapText] = useState(
      "虚构患者自述：跑步后膝盖不舒服。未提供检查记录。",
    );
  const refresh = useCallback(async () => {
    setState(await api<State>("state"));
  }, []);
  useEffect(() => {
    configureTransport(browserDemo);
    let live = true;
    api("session")
      .then(() => api<State>("state"))
      .then((s) => {
        if (live) setState(s);
      })
      .catch((e) => {
        if (live) setError(String(e.message));
      });
    return () => {
      live = false;
    };
  }, [browserDemo]);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      void refresh().catch(() => {});
    }, 700);
    return () => clearInterval(timer);
  }, [busy, refresh]);
  useEffect(() => {
    if (!selectedTicket || view !== "tickets") return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const controls = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),textarea,input,select,a[href]",
        ) ?? [],
      );
    controls()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedTicket(undefined);
        return;
      }
      if (e.key !== "Tab") return;
      const items = controls(),
        first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous?.isConnected && previous !== document.body) previous.focus();
      else
        document
          .querySelector<HTMLElement>(`[data-ticket-id="${selectedTicket}"]`)
          ?.focus();
    };
  }, [selectedTicket, view]);
  async function act<T>(fn: () => Promise<T>, message = "操作已保存") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await fn();
      await refresh();
      setNotice(message);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  const go = (v: View) => {
    setView(v);
    setSearch("");
    setFilter("all");
    setNotice("");
  };
  const activeRun =
    state?.runs.find((r) => r.id === runId) ??
    state?.runs.find((r) => r.data.conversationId === conversationId);
  const activeConversation = state?.conversations.find(
    (c) => c.id === (conversationId ?? activeRun?.data.conversationId),
  );
  const ticket = state?.tickets.find((t) => t.id === selectedTicket);
  async function consult() {
    const result = await act(
      () =>
        consultStream(
          { text: input, conversationId, key: crypto.randomUUID() },
          (run) => {
            setRunId(run.id);
            setConversationId(run.data.conversationId);
            setState((s) =>
              s
                ? {
                    ...s,
                    runs: [run, ...s.runs.filter((r) => r.id !== run.id)],
                  }
                : s,
            );
          },
        ),
      "执行记录已保存",
    );
    if (result) {
      setRunId(result.id);
      setConversationId(result.data.conversationId);
      setInput("");
    }
  }
  const canReview =
    state && ["reviewer", "manager", "admin"].includes(state.role);
  const approvalButtons = (a: RecordRow<Approval>) => (
    <div className="actions">
      <button
        disabled={busy || !canReview}
        onClick={() =>
          void act(
            () =>
              api("approve", {
                id: a.id,
                decision: "approved",
                note: reviewNote,
              }),
            "审核通过，工单与运营数据已同步",
          )
        }
      >
        <Check size={15} />
        通过审核
      </button>
      <button
        className="secondary"
        disabled={busy || !canReview}
        onClick={() =>
          void act(
            () =>
              api("approve", {
                id: a.id,
                decision: "rejected",
                note: reviewNote,
              }),
            "审核已拒绝",
          )
        }
      >
        拒绝
      </button>
    </div>
  );
  return (
    <div
      className={"app " + (dark ? "dark" : "") + (compact ? " compact" : "")}
    >
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("overview");
          }}
        >
          <span className="brand-symbol">
            u<span>+</span>
          </span>
          <span>
            UP-Care<b>AGENTOPS</b>
          </span>
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">U</span>
          <div>
            Concept Workspace<small>独立演示空间</small>
          </div>
          <ChevronRight size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map((n, i) => (
            <button
              key={n.id}
              className={view === n.id ? "active" : ""}
              aria-label={n.label}
              onClick={() => go(n.id)}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.id === "tickets" && !!state?.dashboard.pending && (
                <b>{state.dashboard.pending}</b>
              )}
              {i === 1 && <span className="new-tag">LIVE</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mode-card">
            <span className="status-dot" />
            <strong>Demo Mode</strong>
            <p>
              规则驱动 · 真实数据操作
              <br />
              {browserDemo ? "数据保存在本浏览器" : "数据保存在本地 SQLite"}
            </p>
          </div>
          <button
            className="tour-button"
            onClick={() => {
              setTour(true);
              go("command");
              setInput(demos[0].text);
            }}
          >
            <LifeBuoy size={17} />
            交互式产品导览
          </button>
          <p>
            Independent Concept Demo
            <br />
            非官方概念演示
          </p>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button"
              aria-label="切换侧栏"
              onClick={() => setCompact(!compact)}
            >
              <PanelLeftClose size={18} />
            </button>
            <span>工作空间</span>
            <ChevronRight size={14} />
            <strong>{nav.find((n) => n.id === view)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-chip">规则演示模式</span>
            <button
              className="icon-button"
              aria-label="切换主题"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <select
              aria-label="切换演示角色"
              value={state?.role ?? "service"}
              disabled={busy || !state}
              onChange={(e) =>
                void act(
                  () => api("role", { role: e.target.value }),
                  "演示角色已切换",
                )
              }
            >
              {Object.entries(roleLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <div className="avatar">
              {state ? roleLabels[state.role][0] : "U"}
            </div>
          </div>
        </header>
        <main>
          <div className="concept-banner">
            <ShieldCheck size={15} />
            <span>Independent Concept Demo · 非官方概念演示</span>
            <span className="banner-detail">
              {browserDemo
                ? "浏览器独立存储 · 非共享数据库"
                : "本地 SQLite · 虚构数据"}
            </span>
          </div>
          {error && (
            <div role="alert" className="alert error">
              {error}
              <button aria-label="关闭错误" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="alert success">
              <Check size={16} />
              {notice}
            </div>
          )}
          {!state ? (
            <div className="loading">
              <Activity className="spin" />
              <h2>正在读取演示空间</h2>
              <p>初始化演示数据与知识索引…</p>
              {error && (
                <button onClick={() => location.reload()}>重新加载</button>
              )}
            </div>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {view === "overview"
                      ? "OPERATIONS INTELLIGENCE"
                      : view === "command"
                        ? "HUMAN + AGENT COLLABORATION"
                        : "UP-CARE / " + view.toUpperCase()}
                  </div>
                  <h1>
                    {view === "overview"
                      ? "每一次服务，都有迹可循。"
                      : nav.find((n) => n.id === view)?.label}
                  </h1>
                  <p>
                    {view === "overview"
                      ? "连接患者咨询、知识检索与人工审核，让服务流程形成闭环。"
                      : view === "command"
                        ? "从一句咨询到可追踪的业务结果。所有节点均来自真实执行记录。"
                        : view === "knowledge"
                          ? "维护服务知识与版本，检查每一次检索的实际依据。"
                          : view === "quality"
                            ? "定位服务沟通风险，保留建议与人工复核记录。"
                            : "独立演示空间内的真实操作与持久化记录。"}
                  </p>
                </div>
                <div className="actions">
                  {view === "overview" ? (
                    <button onClick={() => go("command")}>
                      <Play size={16} />
                      Launch Interactive Demo
                    </button>
                  ) : (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void act(refresh, "数据已刷新")}
                    >
                      <RefreshCw size={15} />
                      刷新数据
                    </button>
                  )}
                </div>
              </div>
              {view === "overview" && (
                <>
                  <div className="metric-grid">
                    {[
                      {
                        label: "患者咨询",
                        value: state.dashboard.conversations,
                        icon: MessageSquare,
                        detail: "当前演示空间的保存会话",
                      },
                      {
                        label: "服务工单",
                        value: state.dashboard.tickets,
                        icon: TicketIcon,
                        detail: `${state.dashboard.completed} 已完成 · ${state.dashboard.pending} 待审核`,
                      },
                      {
                        label: "人工审核",
                        value: state.dashboard.approvals,
                        icon: Users,
                        detail: "等待专业人员或运营确认",
                      },
                      {
                        label: "质检问题",
                        value: state.dashboard.qualityIssues,
                        icon: ShieldCheck,
                        detail: "规则识别结果，需人工复核",
                      },
                    ].map((m) => (
                      <button
                        className="metric"
                        key={m.label}
                        onClick={() =>
                          go(
                            m.label === "患者咨询"
                              ? "command"
                              : m.label === "质检问题"
                                ? "quality"
                                : "tickets",
                          )
                        }
                      >
                        <div>
                          <span>{m.label}</span>
                          <m.icon size={19} />
                        </div>
                        <strong>{m.value.toString().padStart(2, "0")}</strong>
                        <small>{m.detail}</small>
                      </button>
                    ))}
                  </div>
                  <div className="overview-grid">
                    <Panel
                      title="服务运营闭环"
                      sub="从患者需求到人工确认，每一步都有记录"
                      action={<span className="badge demo">DEMO WORKFLOW</span>}
                    >
                      <div className="pipeline">
                        {[
                          {
                            icon: MessageSquare,
                            label: "理解咨询",
                            count: state.dashboard.conversations,
                          },
                          {
                            icon: BookOpen,
                            label: "知识检索",
                            count: state.dashboard.runs,
                          },
                          {
                            icon: ShieldCheck,
                            label: "质量审查",
                            count: state.qualities.length,
                          },
                          {
                            icon: ClipboardCheck,
                            label: "人工确认",
                            count: state.approvals.filter(
                              (a) => a.data.status === "approved",
                            ).length,
                          },
                        ].map((n, i) => (
                          <div className="pipeline-node" key={n.label}>
                            <div>
                              <n.icon size={23} />
                            </div>
                            <strong>{n.label}</strong>
                            <span>{n.count} 条记录</span>
                            {i < 3 && (
                              <ChevronRight className="connector" size={18} />
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="panel-foot">
                        <span>
                          <span className="status-dot" /> 本地工作流可运行
                        </span>
                        <button
                          className="text-button"
                          onClick={() => go("workflows")}
                        >
                          查看执行历史 <ChevronRight size={14} />
                        </button>
                      </div>
                    </Panel>
                    <Panel title="执行表现" sub="按当前空间的真实运行计算">
                      <div className="performance">
                        <div>
                          <span>工作流成功率</span>
                          <strong>
                            {state.dashboard.successRate === null
                              ? "—"
                              : state.dashboard.successRate + "%"}
                            <small>含等待人工审核</small>
                          </strong>
                        </div>
                        <div>
                          <span>平均执行耗时</span>
                          <strong>
                            {state.dashboard.meanLatency === null
                              ? "—"
                              : state.dashboard.meanLatency}
                            <small>ms · 规则流程</small>
                          </strong>
                        </div>
                      </div>
                    </Panel>
                  </div>
                  <div className="overview-grid">
                    <Panel
                      title="最近服务工单"
                      sub="共享业务数据源，审核后自动更新"
                      action={
                        <button
                          className="text-button"
                          onClick={() => go("tickets")}
                        >
                          全部工单 <ChevronRight size={14} />
                        </button>
                      }
                    >
                      {state.tickets.length ? (
                        <TicketTable
                          rows={state.tickets.slice(0, 5)}
                          onSelect={(id) => {
                            setSelectedTicket(id);
                            go("tickets");
                          }}
                        />
                      ) : (
                        <Empty>还没有工单。运行“双语预约”开始完整演示。</Empty>
                      )}
                    </Panel>
                    <Panel
                      title="院区意向分布"
                      sub="虚构业务记录，不代表企业经营数据"
                    >
                      <div className="clinic-chart">
                        {state.dashboard.clinics.map((c) => (
                          <div key={c.id}>
                            <div>
                              <span>{clinicNames[c.id]}</span>
                              <strong>{c.count}</strong>
                            </div>
                            <div className="bar-track">
                              <div
                                style={{
                                  width:
                                    (c.count /
                                      Math.max(
                                        1,
                                        ...state.dashboard.clinics.map(
                                          (x) => x.count,
                                        ),
                                      )) *
                                      100 +
                                    "%",
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </Panel>
                  </div>
                  <div className="section-heading">
                    <h2>选择一个场景，体验完整流程</h2>
                    <span>真实交互 · 可重复验证</span>
                  </div>
                  <div className="scenario-grid">
                    {[
                      {
                        title: "双语预约与人工确认",
                        desc: "提取需求、检索资料、生成意向与工单",
                        icon: MessageSquare,
                        target: "command",
                      },
                      {
                        title: "客服风险质检",
                        desc: "定位疗效、保险与预约承诺风险",
                        icon: ShieldCheck,
                        target: "quality",
                      },
                      {
                        title: "知识库更新与验证",
                        desc: "上传资料、更新版本、查看检索依据",
                        icon: BookOpen,
                        target: "knowledge",
                      },
                    ].map((s, i) => (
                      <button
                        key={s.title}
                        className="scenario"
                        onClick={() => go(s.target as View)}
                      >
                        <span className="scenario-number">0{i + 1}</span>
                        <s.icon size={23} />
                        <h3>{s.title}</h3>
                        <p>{s.desc}</p>
                        <span className="scenario-link">
                          打开场景 <ChevronRight size={14} />
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {view === "command" && (
                <>
                  {tour && (
                    <div className="tour">
                      <LifeBuoy size={20} />
                      <div>
                        <strong>完整业务导览</strong>
                        <p>
                          ① 运行双语预约　② 查看节点与引用　③ 切换医疗审核员　④
                          审核工单　⑤ 回到运营总览核对数据
                        </p>
                      </div>
                      <button
                        className="icon-button"
                        aria-label="关闭导览"
                        onClick={() => setTour(false)}
                      >
                        <X size={17} />
                      </button>
                    </div>
                  )}
                  <div className="command-toolbar">
                    <div className="pills">
                      {demos.map((d) => (
                        <button
                          className="secondary"
                          key={d.name}
                          onClick={() => setInput(d.text)}
                        >
                          {d.name}
                        </button>
                      ))}
                    </div>
                    <button
                      className="text-button"
                      onClick={() => {
                        setConversationId(undefined);
                        setRunId(undefined);
                        setInput(demos[0].text);
                      }}
                    >
                      <Plus size={15} />
                      新会话
                    </button>
                    <select
                      aria-label="会话历史"
                      value={conversationId ?? ""}
                      onChange={(e) => {
                        setConversationId(e.target.value || undefined);
                        setRunId(undefined);
                      }}
                    >
                      <option value="">选择历史会话</option>
                      {state.conversations.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.data.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="command-grid">
                    <Panel
                      title="患者咨询"
                      sub="PATIENT WORKSPACE"
                      action={<MessageSquare size={17} />}
                    >
                      <div className="conversation">
                        {activeConversation?.data.messages.length ? (
                          activeConversation.data.messages.map((m, i) => (
                            <div className={"message " + m.role} key={i}>
                              <div className="message-label">
                                {m.role === "user"
                                  ? "虚构患者"
                                  : "服务回复草稿 · 规则模式"}
                                <time>
                                  {new Date(m.at).toLocaleTimeString("zh-CN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </time>
                              </div>
                              <p>{m.text}</p>
                            </div>
                          ))
                        ) : (
                          <div className="conversation-welcome">
                            <span className="agent-orb">
                              <Activity size={28} />
                            </span>
                            <h3>让服务从理解开始</h3>
                            <p>
                              输入一条虚构咨询，查看 Agent
                              如何检索知识、检查回复并推动业务流程。
                            </p>
                            <span className="badge demo">中文 / English</span>
                          </div>
                        )}
                      </div>
                      <form
                        className="composer"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void consult();
                        }}
                      >
                        <textarea
                          aria-label="患者咨询内容"
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          placeholder="输入虚构患者咨询…"
                          maxLength={8000}
                          required
                          minLength={2}
                        />
                        <div>
                          <small>请勿输入真实身份或医疗信息</small>
                          <button
                            disabled={
                              busy ||
                              !["service", "operator", "admin"].includes(
                                state.role,
                              )
                            }
                            type="submit"
                          >
                            <Send size={15} />
                            {busy ? "执行中" : "运行 Agent"}
                          </button>
                        </div>
                      </form>
                    </Panel>
                    <Panel
                      title="Agent 执行轨迹"
                      sub="LIVE EXECUTION · 输出摘要，非内部推理"
                      action={
                        activeRun ? (
                          <Badge status={activeRun.data.status} />
                        ) : (
                          <span className="badge">待运行</span>
                        )
                      }
                    >
                      <div className="run-selector">
                        <select
                          aria-label="执行历史"
                          value={activeRun?.id ?? ""}
                          onChange={(e) => setRunId(e.target.value)}
                        >
                          <option value="" disabled>
                            选择执行记录
                          </option>
                          {state.runs.map((r, i) => (
                            <option key={r.id} value={r.id}>
                              #{state.runs.length - i} ·{" "}
                              {r.data.input.slice(0, 20)}
                            </option>
                          ))}
                        </select>
                        {activeRun && <code>{activeRun.id.slice(0, 8)}</code>}
                      </div>
                      <div className="execution-graph">
                        {activeRun?.data.nodes.length ? (
                          activeRun.data.nodes.map((n, i) => (
                            <div className="graph-step" key={n.id}>
                              <button
                                className={
                                  "execution-node " +
                                  n.status +
                                  (nodeId === n.id ? " selected" : "")
                                }
                                onClick={() =>
                                  setNodeId(nodeId === n.id ? undefined : n.id)
                                }
                              >
                                <span className="node-icon">
                                  {n.status === "completed" ? (
                                    <Check size={17} />
                                  ) : n.status === "waiting" ? (
                                    <Clock size={17} />
                                  ) : (
                                    <Activity size={17} />
                                  )}
                                </span>
                                <div>
                                  <strong>{n.name}</strong>
                                  <small>{n.tool}</small>
                                </div>
                                <span>
                                  {n.durationMs !== undefined
                                    ? n.durationMs.toFixed(1) + " ms"
                                    : statusNames[n.status]}
                                </span>
                              </button>
                              {nodeId === n.id && (
                                <div className="node-detail">
                                  <p>
                                    开始：{n.startedAt}
                                    <br />
                                    结束：{n.endedAt ?? "等待人工处理"}
                                  </p>
                                  <strong>输入 / 输出</strong>
                                  <pre>
                                    {JSON.stringify(
                                      {
                                        input: n.input,
                                        output: n.output,
                                        error: n.error,
                                      },
                                      null,
                                      2,
                                    )}
                                  </pre>
                                </div>
                              )}
                              {i < activeRun.data.nodes.length - 1 && (
                                <div className="graph-edge" />
                              )}
                            </div>
                          ))
                        ) : (
                          <Empty>运行咨询后查看真实节点记录</Empty>
                        )}
                      </div>
                      {activeRun?.data.status === "failed" && (
                        <div className="panel-foot">
                          <span>{activeRun.data.error}</span>
                          <button
                            onClick={() =>
                              void act(() =>
                                api("consult", {
                                  text: activeRun.data.input,
                                  conversationId: activeRun.data.conversationId,
                                  retryOf: activeRun.id,
                                  key: crypto.randomUUID(),
                                }),
                              )
                            }
                          >
                            重试整个流程
                          </button>
                        </div>
                      )}
                    </Panel>
                    <Panel
                      title="业务结果"
                      sub="BUSINESS OUTCOME"
                      action={<ClipboardCheck size={17} />}
                    >
                      <div className="outcome">
                        {activeRun?.data.intent ? (
                          <>
                            <div className="outcome-title">
                              结构化需求
                              <span className="badge demo">规则提取</span>
                            </div>
                            <dl>
                              {[
                                ["业务意图", activeRun.data.intent.intent],
                                [
                                  "院区偏好",
                                  clinicNames[
                                    activeRun.data.intent.clinic ?? ""
                                  ] ?? "待补充",
                                ],
                                [
                                  "期望时间",
                                  activeRun.data.intent.time ?? "待补充",
                                ],
                                ["输入语言", activeRun.data.intent.language],
                                [
                                  "服务语言偏好",
                                  activeRun.data.intent.preferredLanguage ??
                                    "待确认",
                                ],
                                [
                                  "保险咨询",
                                  activeRun.data.intent.insurance
                                    ? "是 · 需核实"
                                    : "未提及",
                                ],
                              ].map(([k, v]) => (
                                <div key={k}>
                                  <dt>{k}</dt>
                                  <dd>{v}</dd>
                                </div>
                              ))}
                            </dl>
                            {activeRun.data.intent.missing.length > 0 && (
                              <div className="info-box">
                                缺少信息：
                                {activeRun.data.intent.missing.join("、")}
                              </div>
                            )}
                            <div className="outcome-title">服务工单</div>
                            {activeRun.data.ticketId ? (
                              <button
                                className="ticket-link"
                                onClick={() => {
                                  setSelectedTicket(activeRun.data.ticketId);
                                  go("tickets");
                                }}
                              >
                                <TicketIcon size={18} />
                                <span>
                                  查看工单 {activeRun.data.ticketId.slice(0, 8)}
                                </span>
                                <ChevronRight size={15} />
                              </button>
                            ) : (
                              <p className="muted">本次执行未创建工单</p>
                            )}
                            {state.approvals
                              .filter((a) => a.id === activeRun.data.approvalId)
                              .map((a) => (
                                <div className="approval-box" key={a.id}>
                                  <Badge status={a.data.status} />
                                  <p>{a.data.reason}</p>
                                  {a.data.status === "pending" && (
                                    <>
                                      <label>
                                        审核备注
                                        <textarea
                                          value={reviewNote}
                                          onChange={(e) =>
                                            setReviewNote(e.target.value)
                                          }
                                        />
                                      </label>
                                      {approvalButtons(a)}
                                      {!canReview && (
                                        <small>
                                          切换至审核员或运营管理者后处理
                                        </small>
                                      )}
                                    </>
                                  )}
                                </div>
                              ))}
                            <div className="outcome-title">
                              知识依据{" "}
                              <span>
                                {activeRun.data.citations.length} 个片段
                              </span>
                            </div>
                            <CitationList items={activeRun.data.citations} />
                          </>
                        ) : (
                          <Empty>提取结果、引用和审核任务将在此显示</Empty>
                        )}
                      </div>
                    </Panel>
                  </div>
                </>
              )}

              {view === "analytics" && (
                <AnalyticsView initial={state.analytics} />
              )}
              {view === "conversations" && (
                <>
                  <div className="filterbar">
                    <label className="search-field">
                      <Search size={17} />
                      <input
                        aria-label="搜索会话"
                        placeholder="搜索已保存的咨询"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                  </div>
                  <Panel
                    title="会话记录"
                    sub="虚构联系人 · 回复均为待人工确认草稿"
                  >
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>咨询</th>
                            <th>消息数</th>
                            <th>更新时间</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {state.conversations
                            .filter((c) =>
                              c.data.title
                                .toLowerCase()
                                .includes(search.toLowerCase()),
                            )
                            .map((c) => (
                              <tr key={c.id}>
                                <td>{c.data.title}</td>
                                <td>{c.data.messages.length}</td>
                                <td>
                                  {new Date(c.updatedAt).toLocaleString(
                                    "zh-CN",
                                  )}
                                </td>
                                <td>
                                  <button
                                    className="text-button"
                                    onClick={() => {
                                      setConversationId(c.id);
                                      setRunId(undefined);
                                      go("command");
                                    }}
                                  >
                                    继续对话
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {!state.conversations.length && (
                        <Empty>运行咨询后在此查看共享会话记录</Empty>
                      )}
                    </div>
                  </Panel>
                  <Panel title="预约意向" sub="仅为偏好登记，未经真实门诊确认">
                    <div className="document-grid">
                      {state.appointments.map((a) => (
                        <article className="document" key={a.id}>
                          <span className="badge pending">未确认的意向</span>
                          <h3>{clinicNames[a.data.clinic] ?? "待确认"}</h3>
                          <p>{a.data.time}</p>
                          <code>{a.id.slice(0, 8)}</code>
                        </article>
                      ))}
                    </div>
                    {!state.appointments.length && (
                      <Empty>院区与时间信息完整后才会登记意向</Empty>
                    )}
                  </Panel>
                </>
              )}

              {view === "tickets" && (
                <>
                  <div className="filterbar">
                    <label className="search-field">
                      <Search size={17} />
                      <input
                        aria-label="搜索工单"
                        placeholder="搜索工单标题或编号"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="工单状态筛选"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">全部状态</option>
                      {[
                        "pending",
                        "approved",
                        "in_progress",
                        "completed",
                        "rejected",
                      ].map((s) => (
                        <option key={s} value={s}>
                          {statusNames[s]}
                        </option>
                      ))}
                    </select>
                    <button
                      className="secondary"
                      onClick={() =>
                        void act(
                          () =>
                            downloadTickets(
                              filter === "all" ? "" : "?status=" + filter,
                            ),
                          "CSV 已导出",
                        )
                      }
                    >
                      <Download size={15} />
                      导出 CSV
                    </button>
                  </div>
                  <Panel
                    title="服务工单"
                    sub={`${state.tickets.length} 条真实保存的模拟业务记录`}
                  >
                    <TicketTable
                      rows={state.tickets.filter(
                        (t) =>
                          (filter === "all" || t.data.status === filter) &&
                          (t.data.title.includes(search) ||
                            t.id.includes(search)),
                      )}
                      onSelect={setSelectedTicket}
                    />
                  </Panel>
                  {ticket && (
                    <div
                      className="detail-overlay"
                      role="dialog"
                      aria-modal="true"
                      aria-label="工单详情"
                    >
                      <div className="detail-panel">
                        <div className="panel-heading">
                          <h2>工单详情</h2>
                          <button
                            className="icon-button"
                            aria-label="关闭工单"
                            onClick={() => setSelectedTicket(undefined)}
                          >
                            <X />
                          </button>
                        </div>
                        <div className="detail-content">
                          <Badge status={ticket.data.status} />
                          <h2>{ticket.data.title}</h2>
                          <code>{ticket.id}</code>
                          <dl>
                            <div>
                              <dt>院区</dt>
                              <dd>
                                {clinicNames[ticket.data.clinic ?? ""] ??
                                  "待确认"}
                              </dd>
                            </div>
                            <div>
                              <dt>负责人</dt>
                              <dd>{ticket.data.assignedTo}</dd>
                            </div>
                            <div>
                              <dt>优先级</dt>
                              <dd>{ticket.data.priority}</dd>
                            </div>
                          </dl>
                          <label>
                            处理 / 审核备注
                            <textarea
                              value={reviewNote}
                              onChange={(e) => setReviewNote(e.target.value)}
                            />
                          </label>
                          {state.approvals
                            .filter(
                              (a) =>
                                a.data.targetId === ticket.id &&
                                a.data.status === "pending",
                            )
                            .map((a) => (
                              <div key={a.id}>{approvalButtons(a)}</div>
                            ))}
                          <div className="actions">
                            {["approved", "in_progress"].includes(
                              ticket.data.status,
                            ) && (
                              <button
                                disabled={busy}
                                onClick={() =>
                                  void act(() =>
                                    api("ticket/status", {
                                      id: ticket.id,
                                      status:
                                        ticket.data.status === "approved"
                                          ? "in_progress"
                                          : "completed",
                                      note: reviewNote,
                                    }),
                                  )
                                }
                              >
                                {ticket.data.status === "approved"
                                  ? "开始处理"
                                  : "完成工单"}
                              </button>
                            )}
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() =>
                                void act(() =>
                                  api("ticket/assign", {
                                    id: ticket.id,
                                    assignedTo: roleLabels[state.role],
                                    note: reviewNote,
                                  }),
                                )
                              }
                            >
                              分配给当前角色
                            </button>
                          </div>
                          <h3>员工备注</h3>
                          {ticket.data.notes.map((n, i) => (
                            <p className="info-box" key={i}>
                              {n}
                            </p>
                          ))}
                          {ticket.data.conversationId && (
                            <button
                              className="text-button"
                              onClick={() => {
                                setConversationId(ticket.data.conversationId);
                                setRunId(ticket.data.runId);
                                setSelectedTicket(undefined);
                                go("command");
                              }}
                            >
                              查看关联对话与执行轨迹
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
              {view === "quality" && (
                <>
                  <QualityBatch onComplete={refresh} />
                  <div className="two-column">
                    <Panel
                      title="客服回复检查"
                      sub="规则检查，不是医学诊断或合规认证"
                    >
                      <div className="form-content">
                        <label>
                          模拟客服回复
                          <textarea
                            rows={6}
                            value={qualityText}
                            onChange={(e) => setQualityText(e.target.value)}
                          />
                        </label>
                        <div className="actions">
                          <button
                            disabled={busy}
                            onClick={() =>
                              void act(
                                () => api("quality", { texts: [qualityText] }),
                                "质检完成并已保存",
                              )
                            }
                          >
                            <ShieldCheck size={16} />
                            运行质检
                          </button>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              void act(
                                () =>
                                  api("quality", {
                                    texts: Array.from({ length: 20 }, (_, i) =>
                                      i % 2 === 0
                                        ? `模拟会话 ${i + 1}：保证治好您的膝盖，保险全额报销。`
                                        : `模拟会话 ${i + 1}：预约意向需要人工确认，保险权益待核实。`,
                                    ),
                                  }),
                                "20 条虚构会话批量质检完成",
                              )
                            }
                          >
                            批量演示 · 20 条
                          </button>
                        </div>
                      </div>
                    </Panel>
                    <Panel title="问题分类" sub="来源于保存的质检记录">
                      <div className="risk-summary">
                        {Object.entries(state.dashboard.riskTypes).length ? (
                          Object.entries(state.dashboard.riskTypes).map(
                            ([k, v]) => (
                              <div key={k}>
                                <span>{k}</span>
                                <strong>{v}</strong>
                              </div>
                            ),
                          )
                        ) : (
                          <Empty>尚无风险记录</Empty>
                        )}
                      </div>
                    </Panel>
                  </div>
                  <Panel
                    title="质检记录"
                    sub="原始回复、风险定位与建议均可检查"
                  >
                    {state.qualities.length ? (
                      state.qualities.map((q) => (
                        <details className="quality-item" key={q.id}>
                          <summary>
                            <ShieldCheck size={17} />
                            <span>{q.data.text.slice(0, 65)}</span>
                            <span
                              className={
                                "badge " +
                                (q.data.risks.length ? "failed" : "completed")
                              }
                            >
                              {q.data.risks.length} 个问题
                            </span>
                            <Badge status={q.data.status} />
                          </summary>
                          <div className="quality-body">
                            <div className="two-column">
                              <div>
                                <h3>原始回复</h3>
                                <p>{q.data.text}</p>
                              </div>
                              <div>
                                <h3>修改建议稿</h3>
                                <p>{q.data.revised}</p>
                              </div>
                            </div>
                            {q.data.risks.map((r, i) => (
                              <div className="risk" key={i}>
                                <strong>
                                  {r.type} · {r.severity}
                                </strong>
                                <blockquote>{r.excerpt}</blockquote>
                                <p>
                                  {r.reason}。{r.suggestion}
                                </p>
                              </div>
                            ))}
                            <CitationList items={q.data.citations} />
                            <label>
                              人工复核备注
                              <textarea
                                value={reviewNote}
                                onChange={(e) => setReviewNote(e.target.value)}
                              />
                            </label>
                            <button
                              disabled={busy}
                              onClick={() =>
                                void act(() =>
                                  api("quality/review", {
                                    id: q.id,
                                    note: reviewNote,
                                  }),
                                )
                              }
                            >
                              保存人工复核
                            </button>
                            {q.data.reviewerNote && (
                              <p>复核记录：{q.data.reviewerNote}</p>
                            )}
                          </div>
                        </details>
                      ))
                    ) : (
                      <Empty>提交一段回复，或运行 20 条批量演示</Empty>
                    )}
                  </Panel>
                </>
              )}
              {view === "knowledge" && (
                <>
                  <div className="two-column">
                    <Panel
                      title="Knowledge Inspector"
                      sub="真实关键词检索 · 未连接 Embedding"
                    >
                      <div className="form-content">
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void act(async () => {
                              setCitations(
                                await api<Citation[]>(
                                  "search?q=" + encodeURIComponent(query),
                                ),
                              );
                            }, "检索完成");
                          }}
                        >
                          <label>
                            检索问题
                            <input
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                              required
                            />
                          </label>
                          <button disabled={busy}>
                            <Search size={15} />
                            检索知识
                          </button>
                        </form>
                        {citations !== null &&
                          (citations.length ? (
                            <CitationList items={citations} />
                          ) : (
                            <Empty>不知道：当前可用知识库没有匹配资料</Empty>
                          ))}
                      </div>
                    </Panel>
                    <Panel
                      title={docId ? "编辑知识文档" : "新增知识文档"}
                      sub="需管理员或医疗审核员角色"
                    >
                      <div className="form-content">
                        <label>
                          文档标题
                          <input
                            value={docTitle}
                            onChange={(e) => setDocTitle(e.target.value)}
                          />
                        </label>
                        <label>
                          正文
                          <textarea
                            aria-label="正文"
                            rows={5}
                            value={docText}
                            onChange={(e) => setDocText(e.target.value)}
                          />
                        </label>
                        <label>
                          来源 URL（演示政策可留空）
                          <input
                            value={docSource}
                            onChange={(e) => setDocSource(e.target.value)}
                          />
                        </label>
                        <div className="actions">
                          <button
                            disabled={busy}
                            onClick={() =>
                              void act(async () => {
                                await api("document", {
                                  id: docId,
                                  title: docTitle,
                                  content: docText,
                                  source: docSource,
                                });
                                setDocId(undefined);
                                setDocTitle("");
                                setDocText("");
                                setDocSource("");
                              }, "文档已分块并保存新版本")
                            }
                          >
                            保存并索引
                          </button>
                          <label className="upload button secondary">
                            上传 TXT / MD / PDF
                            <input
                              type="file"
                              accept=".txt,.md,.pdf"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file)
                                  void act(async () => {
                                    await uploadDocument(file);
                                  }, "文件已导入");
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    </Panel>
                  </div>
                  <Panel
                    title="知识文档"
                    sub={`${state.documents.length} 份文档 · 来源和版本可追踪`}
                  >
                    <div className="document-grid">
                      {state.documents.map((d) => (
                        <article className="document" key={d.id}>
                          <BookOpen size={22} />
                          <h3>{d.data.title}</h3>
                          <p>{d.data.content.slice(0, 110)}…</p>
                          <div>
                            <span>
                              v{d.data.version} · {d.data.chunks.length} 个片段
                            </span>
                            <Badge
                              status={d.data.active ? "completed" : "rejected"}
                            />
                          </div>
                          <div className="actions">
                            <button
                              className="text-button"
                              onClick={() => {
                                setDocId(d.id);
                                setDocTitle(d.data.title);
                                setDocText(d.data.content);
                                setDocSource(d.data.source);
                              }}
                            >
                              编辑文档
                            </button>
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() =>
                                void act(() =>
                                  api("document", {
                                    id: d.id,
                                    title: d.data.title,
                                    content: d.data.content,
                                    source: d.data.source,
                                    visibility: d.data.visibility,
                                    active: !d.data.active,
                                  }),
                                )
                              }
                            >
                              {d.data.active ? "标记失效" : "重新启用"}
                            </button>
                          </div>
                          {d.data.versions.length > 0 && (
                            <details>
                              <summary>
                                历史版本 ({d.data.versions.length})
                              </summary>
                              {d.data.versions.map((v) => (
                                <p key={v.version}>
                                  v{v.version} · {v.at}
                                  <br />
                                  {v.content}
                                </p>
                              ))}
                            </details>
                          )}
                        </article>
                      ))}
                    </div>
                  </Panel>
                </>
              )}
              {view === "workflows" && (
                <>
                  <div className="workflow-grid">
                    {state.workflows.map((w) => (
                      <Panel key={w.id} title={w.name} sub={"WORKFLOW " + w.id}>
                        <div className="workflow-chain">
                          {w.nodes.map((n, i) => (
                            <span key={n}>
                              {i + 1}. {n}
                              {i < w.nodes.length - 1 && (
                                <ChevronRight size={14} />
                              )}
                            </span>
                          ))}
                        </div>
                        <div className="panel-foot">
                          <button
                            onClick={() =>
                              go(
                                w.id === "C"
                                  ? "followup"
                                  : w.id === "D"
                                    ? "quality"
                                    : w.id === "E"
                                      ? "knowledge"
                                      : "command",
                              )
                            }
                          >
                            <Play size={14} />
                            打开工作流入口
                          </button>
                        </div>
                      </Panel>
                    ))}
                  </div>
                  <Panel
                    title="咨询工作流运行历史"
                    sub="可回看每个节点的实际输入、输出与耗时"
                  >
                    {state.runs.length ? (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Trace ID</th>
                              <th>咨询摘要</th>
                              <th>状态</th>
                              <th>耗时</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {state.runs.map((r) => (
                              <tr key={r.id}>
                                <td>
                                  <code>{r.id.slice(0, 8)}</code>
                                </td>
                                <td>{r.data.input.slice(0, 50)}</td>
                                <td>
                                  <Badge status={r.data.status} />
                                </td>
                                <td>{r.data.durationMs?.toFixed(1)} ms</td>
                                <td>
                                  <button
                                    className="text-button"
                                    onClick={() => {
                                      setRunId(r.id);
                                      setConversationId(r.data.conversationId);
                                      go("command");
                                    }}
                                  >
                                    查看轨迹
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty>尚无工作流记录</Empty>
                    )}
                  </Panel>
                </>
              )}
              {view === "followup" && (
                <div className="two-column">
                  <Panel
                    title="模拟随访记录"
                    sub="规则模式保留原文摘录，不自行诊断或调整治疗"
                  >
                    <div className="form-content">
                      <label>
                        多次随访记录（每行一条）
                        <textarea
                          rows={10}
                          value={followText}
                          onChange={(e) => setFollowText(e.target.value)}
                        />
                      </label>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void act(
                            () =>
                              api("followup", {
                                text: followText,
                                key: crypto.randomUUID(),
                              }),
                            "随访任务与人工审核工单已保存",
                          )
                        }
                      >
                        生成跟进任务
                      </button>
                    </div>
                  </Panel>
                  <Panel title="已创建跟进任务" sub="关联服务工单，结果可追溯">
                    {state.followups.length ? (
                      state.followups.map((f) => (
                        <article className="followup-item" key={f.id}>
                          <Badge status={f.data.status ?? "pending"} />
                          <p>{f.data.summary}</p>
                          {f.data.unresolved?.length ? (
                            <div className="info-box">
                              <strong>待核实事项（原文匹配）</strong>
                              {f.data.unresolved.map((item, i) => (
                                <p key={i}>{item}</p>
                              ))}
                            </div>
                          ) : null}
                          <p className="muted">{f.data.draft}</p>
                          <button
                            className="secondary"
                            disabled={busy || f.data.status === "completed"}
                            onClick={() =>
                              void act(
                                () =>
                                  api("followup/status", {
                                    id: f.id,
                                    status: "completed",
                                  }),
                                "跟进任务已完成",
                              )
                            }
                          >
                            标记跟进完成
                          </button>
                          <button
                            className="text-button"
                            onClick={() => {
                              setSelectedTicket(f.data.ticketId);
                              go("tickets");
                            }}
                          >
                            查看关联工单
                          </button>
                        </article>
                      ))
                    ) : (
                      <Empty>导入模拟记录以创建跟进任务</Empty>
                    )}
                  </Panel>
                </div>
              )}
              {view === "notes" && (
                <div className="two-column">
                  <Panel
                    title="SOAP 事实整理"
                    sub="仅限医疗审核员或管理员 · 未经专业审核的草稿"
                  >
                    <div className="form-content">
                      <label>
                        虚构沟通原文
                        <textarea
                          rows={8}
                          value={soapText}
                          onChange={(e) => setSoapText(e.target.value)}
                        />
                      </label>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void act(
                            () => api("soap", { text: soapText }),
                            "保守草稿与人工审核任务已创建",
                          )
                        }
                      >
                        整理文书草稿
                      </button>
                      <p className="muted">
                        S 保留输入；O 缺失则不填；A、P 留给专业人员。
                      </p>
                    </div>
                  </Panel>
                  <Panel title="文书草稿与审核">
                    {state.notes.length ? (
                      state.notes.map((n) => (
                        <article className="note-item" key={n.id}>
                          <Badge status={n.data.status} />
                          {(["S", "O", "A", "P"] as const).map((k) => (
                            <div key={k}>
                              <strong>{k}</strong>
                              <p>{n.data[k]}</p>
                            </div>
                          ))}
                          {state.approvals
                            .filter(
                              (a) =>
                                a.data.targetId === n.id &&
                                a.data.status === "pending",
                            )
                            .map((a) => (
                              <div key={a.id}>{approvalButtons(a)}</div>
                            ))}
                        </article>
                      ))
                    ) : (
                      <Empty>尚无可访问的文书草稿</Empty>
                    )}
                  </Panel>
                </div>
              )}
              {view === "evaluation" && (
                <>
                  <Panel
                    title="规则回归评测 · v1"
                    sub="实际运行版本化案例；规则回归结果不代表临床或 LLM 基准。"
                    action={
                      <button
                        disabled={busy}
                        onClick={() =>
                          void act(
                            () => api("evaluate", {}),
                            "实际评测已完成并保存",
                          )
                        }
                      >
                        <Play size={15} />
                        运行评测
                      </button>
                    }
                  >
                    <div className="evaluation-info">
                      <FlaskConical size={30} />
                      <p>
                        每条案例比较预期结果与实际规则输出。当前覆盖意图分类与服务风险检查；工具、权限和持久化由工程测试另行验证。模型成本：不适用。
                      </p>
                    </div>
                  </Panel>
                  {state.evaluations.map((e) => (
                    <Panel
                      key={e.id}
                      title={`${e.data.passed} / ${e.data.total} 通过`}
                      sub={new Date(e.createdAt).toLocaleString("zh-CN")}
                    >
                      <div className="metric-grid compact-metrics">
                        {[
                          ["意图准确率", e.data.intentAccuracy],
                          ["质检精确率", e.data.qualityPrecision],
                          ["质检召回率", e.data.qualityRecall],
                        ].map(([label, v]) => (
                          <div key={label} className="metric">
                            <span>{label}</span>
                            <strong>{(Number(v) * 100).toFixed(1)}%</strong>
                          </div>
                        ))}
                        <div className="metric">
                          <span>总耗时</span>
                          <strong>
                            {e.data.durationMs.toFixed(1)}
                            <small> ms</small>
                          </strong>
                        </div>
                      </div>
                      <details className="eval-details">
                        <summary>查看逐条判定结果</summary>
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>案例</th>
                                <th>输入</th>
                                <th>预期</th>
                                <th>实际</th>
                                <th>结果</th>
                              </tr>
                            </thead>
                            <tbody>
                              {e.data.cases.map((c) => (
                                <tr key={c.id}>
                                  <td>{c.category}</td>
                                  <td>{c.input}</td>
                                  <td>{c.expected}</td>
                                  <td>{c.actual}</td>
                                  <td>
                                    <Badge
                                      status={c.passed ? "completed" : "failed"}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </Panel>
                  ))}
                </>
              )}
              {view === "audit" && (
                <Panel
                  title="审计事件"
                  sub="包含服务端角色、操作对象、真实时间及执行结果"
                >
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>时间</th>
                          <th>操作</th>
                          <th>角色</th>
                          <th>对象 / 详情</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.audit.map((a) => (
                          <tr key={a.id}>
                            <td className="nowrap">
                              {new Date(a.created_at).toLocaleString("zh-CN")}
                            </td>
                            <td>
                              <code>{a.action}</code>
                            </td>
                            <td>{roleLabels[a.role as Role] ?? a.role}</td>
                            <td>
                              <details>
                                <summary>
                                  {a.target.slice(0, 12) || "工具执行"}
                                </summary>
                                <pre>
                                  {JSON.stringify(
                                    JSON.parse(a.detail),
                                    null,
                                    2,
                                  )}
                                </pre>
                              </details>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              )}
              {view === "prompts" && (
                <PromptLab data={state.promptLab} onComplete={refresh} />
              )}
              {view === "settings" && (
                <div className="two-column">
                  <MockIntegrations
                    leads={state.leads}
                    integrations={state.integrations}
                    onComplete={refresh}
                  />
                  <Panel
                    title="集成连接状态"
                    sub="当前无外部账号连接，不产生模型调用费用"
                  >
                    <div className="integration-list">
                      {[
                        ["LLM Provider", "未配置 · 当前使用规则引擎"],
                        ["Embedding", "未配置 · 当前使用关键词检索"],
                        ["Coze Workflow", "适配层已编写 · 尚未连接验证"],
                        ["外部 CRM", "未连接 · 使用本地模拟业务系统"],
                        [
                          "数据库",
                          browserDemo
                            ? "SQLite WASM + IndexedDB · 浏览器独立持久化"
                            : "SQLite · 本地真实持久化",
                        ],
                      ].map(([name, desc]) => (
                        <div key={name}>
                          <Settings size={18} />
                          <div>
                            <strong>{name}</strong>
                            <p>{desc}</p>
                          </div>
                          <span className="badge">
                            {name === "数据库" ? "本地运行" : "未连接"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Panel>
                  <Panel
                    title="演示空间"
                    sub="角色切换仅用于演示，不等于正式身份认证"
                  >
                    <div className="form-content">
                      <label>
                        当前空间
                        <code className="workspace-id">{state.workspace}</code>
                      </label>
                      <p>
                        新建演示空间会为当前浏览器创建独立数据；旧空间和其他用户的数据不会删除。
                      </p>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "新建独立演示空间？现有数据将保留，但此浏览器切换到新空间。",
                            )
                          )
                            void act(async () => {
                              await api("reset", { confirm: "NEW_WORKSPACE" });
                              setConversationId(undefined);
                              setRunId(undefined);
                            }, "已切换到新演示空间");
                        }}
                      >
                        新建演示空间
                      </button>
                      <div className="info-box">
                        本系统为求职概念作品，未经企业授权。只接受虚构数据，不提供诊断、处方、真实排班或患者通知。
                      </div>
                    </div>
                  </Panel>
                </div>
              )}
            </>
          )}
          <footer>
            <span>UP-Care AgentOps</span>
            <span>可解释的流程 · 可核实的结果 · 人工保留最终决定</span>
            <span>Independent Concept Demo</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function TicketTable({
  rows,
  onSelect,
}: {
  rows: RecordRow<Ticket>[];
  onSelect: (id: string) => void;
}) {
  return rows.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>工单 / 服务需求</th>
            <th>院区</th>
            <th>状态</th>
            <th>负责人</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>
                <button
                  className="table-title"
                  data-ticket-id={t.id}
                  onClick={() => onSelect(t.id)}
                >
                  {t.data.title}
                  <small>
                    #{t.id.slice(0, 8)} ·{" "}
                    {new Date(t.createdAt).toLocaleDateString("zh-CN")}
                  </small>
                </button>
              </td>
              <td>{clinicNames[t.data.clinic ?? ""] ?? "待确认"}</td>
              <td>
                <Badge status={t.data.status} />
              </td>
              <td>{t.data.assignedTo}</td>
              <td>
                <button
                  aria-label="打开工单"
                  className="icon-button"
                  onClick={() => onSelect(t.id)}
                >
                  <ChevronRight size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty>没有符合条件的工单</Empty>
  );
}
