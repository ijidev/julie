import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { Markdown } from "./markdown";
import { VoiceFab, VOICE_STATE_EVENT, requestVoiceCapture } from "./voice-fab";
import { useSpeaking, speakWithTracking } from "./speaking";
import { Wave } from "./wave";
import { setVoiceConversationId, speechSupported, startSpeechRecognition, submitVoiceText, type VoiceState } from "./voice";
import { api, type ChatRunSnapshot, type Conversation, type GatewayStatus, type Message, type Task, type TaskActivity, type TaskSummary, type Workspace, type AgentAssignmentRow, type AgentOrganizationResponse, type AgentRoom, type AgentRoomActiveRun, type AgentRoomDetail, type AgentRoomMessage, type AgentOverviewItem, type AgentOverviewResponse, type AgentDetailResponse, type AgentChatMessage, type AgentOnboardingInput, type AgentOnboardingOptions, type AgentUpdateInput, type AgentUpdateResult, type AgentAssignmentsResponse, type AgentAvatarAsset, type AgentAvatarDirection, type AgentAvatarPreview, type AgentAvatarStudioResponse, type Tool, type Analytics, type Weather, type Device, type Insights, type TrendingItem, type OpencodeStatus, type OpencodeSessionRow, type OpencodeSessionsResponse, type OpencodeStatsResponse, type OpencodeActiveResponse, type OpencodeProjectsResponse, TASK_STATUSES } from "./api";

// --- Router Hook ---
function useRoute(): [string, (to: string) => void] {
  const [route, setRoute] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = useCallback((to: string) => {
    if (to !== window.location.pathname) window.history.pushState({}, "", to);
    setRoute(to);
  }, []);
  return [route, navigate];
}

const STATUS_LABEL: Record<string, string> = {
  backlog: "Backlog", ready: "Ready", in_progress: "In Progress", waiting_input: "Waiting Input",
  pending_review: "Pending Review", done: "Done", blocked: "Blocked",
};

// --- Main App ---
export default function App() {
  const [route, navigate] = useRoute();
  const [authState, setAuthState] = useState<"loading" | "anon" | "authed">("loading");

  useEffect(() => {
    api.session().then((s) => setAuthState(s.authenticated ? "authed" : "anon")).catch(() => setAuthState("anon"));
  }, []);

  if (authState === "loading") return <div className="login-wrap"><div style={{ color: "var(--text-dim)" }}>Initializing Julie AiOS…</div></div>;
  if (authState === "anon") return <Login onOk={() => setAuthState("authed")} />;

  return <Shell route={route} navigate={navigate} onLogout={() => { api.logout().finally(() => setAuthState("anon")); }} />;
}

function Login({ onOk }: { onOk: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { await api.login(password); onOk(); }
    catch (err: any) { setError(err.status === 401 ? "Invalid password." : err.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="login-wrap">
      <div className="login-card card">
        <div className="orb idle" style={{ width: 60, height: 60, margin: "0 auto 20px" }} />
        <h1 style={{ textAlign: "center" }}>Julie AiOS</h1>
        <p style={{ textAlign: "center", color: "var(--text-dim)", marginBottom: 24 }}>Owner Access</p>
        <form onSubmit={submit}>
          <input type="password" placeholder="Owner password" value={password} autoFocus
            onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="error-text">{error}</div>}
          <button className="btn" style={{ width: "100%", marginTop: 12 }} disabled={busy || !password}>{busy ? "Signing in…" : "Enter Command Center"}</button>
        </form>
      </div>
    </div>
  );
}

// --- Shell: Sidebar (Desktop) + Bottom Nav (Mobile) ---
type ShellNavItem = { path: string; label: string; icon: string; action?: "voice" | "menu" };

const SIDEBAR_SECTIONS: Array<{ label: string; items: ShellNavItem[] }> = [
  { label: "Command Center", items: [
    { path: "/", label: "Home", icon: "⌂" },
    { path: "/chat", label: "Chat", icon: "◉" },
    { path: "/agent-messenger", label: "Agent Messenger", icon: "✉" },
    { path: "/agents", label: "Agents", icon: "◇" },
  ] },
  { label: "Operations", items: [
    { path: "/tasks", label: "Task Board", icon: "✓" },
    { path: "/projects", label: "Projects", icon: "▤" },
    { path: "/analytics", label: "Analytics", icon: "◔" },
    { path: "/automations", label: "Automations", icon: "↻" },
  ] },
  { label: "System", items: [
    { path: "/tools", label: "Apps & Integrations", icon: "⌘" },
    { path: "/opencode", label: "OpenCode", icon: "◧" },
    { path: "/terminal", label: "Terminal", icon: ">_" },
    { path: "/settings", label: "Settings", icon: "⚙" },
    { path: "/profile", label: "Profile", icon: "◎" },
    { path: "/future", label: "Future Lab", icon: "✦" },
  ] },
];

const BOTTOM_NAV: ShellNavItem[] = [
  { path: "/", label: "Home", icon: "⌂" },
  { path: "/chat", label: "Chat", icon: "◉" },
  { path: "/voice", label: "Talk", icon: "◉", action: "voice" },
  { path: "/agents", label: "Agents", icon: "◇" },
  { path: "/menu", label: "More", icon: "•••", action: "menu" },
];

function FooterNavIcon({ item }: { item: ShellNavItem }) {
  if (item.action === "voice") return (
    <svg className="footer-icon-svg footer-mic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
  if (item.path === "/") return (
    <svg className="footer-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5" /><path d="M6.5 9.5V20h11V9.5" /><path d="M10 20v-6h4v6" />
    </svg>
  );
  if (item.path === "/chat") return (
    <svg className="footer-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 5.5h14v10H9l-4 3v-13Z" /><path d="M8.5 9.5h7M8.5 12.5h4.5" />
    </svg>
  );
  if (item.path === "/agents") return (
    <svg className="footer-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3" /><circle cx="16.5" cy="9.5" r="2.3" /><path d="M3.8 19c.6-3.1 2.3-4.7 5.2-4.7s4.6 1.6 5.2 4.7M14.5 14.5c2.8-.4 4.7 1 5.5 3.7" />
    </svg>
  );
  return (
    <svg className="footer-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}

function Shell({ route, navigate, onLogout }: { route: string; navigate: (to: string) => void; onLogout: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [gw, setGw] = useState<GatewayStatus | null>(null);
  const [voiceState, setVoiceState] = useState("idle");

  useEffect(() => {
    let alive = true;
    const tick = () => api.gatewayStatus().then((s) => alive && setGw(s)).catch(() => alive && setGw({ connected: false }));
    tick();
    const t = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    const onVoiceState = (event: Event) => {
      const state = (event as CustomEvent<{ state?: string }>).detail?.state;
      if (state) setVoiceState(state);
    };
    window.addEventListener(VOICE_STATE_EVENT, onVoiceState);
    return () => window.removeEventListener(VOICE_STATE_EVENT, onVoiceState);
  }, []);

  // The center microphone starts inline voice capture from any page; /voice remains
  // routable for deep links, but it is not duplicated in the desktop sidebar.
  const onNav = (item: Pick<ShellNavItem, "path" | "action">) => {
    if (item.action === "voice") { requestVoiceCapture(); return; }
    if (item.action === "menu") { setMenuOpen(true); return; }
    navigate(item.path);
    setMenuOpen(false);
  };

  const renderView = () => {
    if (route === "/") return <HomePage navigate={navigate} gw={gw} />;
    if (route === "/chat") return <ChatView />;
    if (route === "/agent-messenger") return <AgentMessengerPage />;
    if (route === "/voice") return <VoicePage />;
    if (route === "/tools") return <ToolsPage />;
    if (route === "/agents/new") return <AgentOnboardingPage navigate={navigate} />;
    if (route === "/agents") return <AgentsPage navigate={navigate} />;
    if (route.startsWith("/agents/")) {
      const encoded = route.slice("/agents/".length);
      let agentId = encoded;
      try { agentId = decodeURIComponent(encoded); } catch { /* API will return an honest not-found state */ }
      return <AgentDetailPage agentId={agentId} navigate={navigate} />;
    }
    if (route === "/analytics") return <AnalyticsPage />;
    if (route === "/opencode") return <OpencodePage />;
    if (route === "/terminal") return <TerminalPage />;
    if (route === "/tasks") return <BoardView />;
    if (route === "/profile") return <ProfilePage />;
    if (route === "/projects") return <ProjectsPage navigate={navigate} />;
    if (route === "/automations") return <ComingSoonPage title="Automations" icon="↻"
      description="Schedules, approvals, run history, and failures will be managed from this page."
      dependency="Requires a documented OpenClaw or Julie scheduler contract before controls can be enabled." navigate={navigate} />;
    if (route === "/settings") return <ComingSoonPage title="Settings" icon="⚙"
      description="A dedicated configuration center for voice, models, privacy, integrations, and workspace defaults is planned."
      dependency="Owner avatar and workspace controls remain available in Profile while this page is built." navigate={navigate} />;
    if (route === "/future") return <ComingSoonPage title="Future Lab" icon="✦"
      description="Experimental command-center capabilities will live here without pretending unfinished controls work."
      dependency="Roadmap items are tracked in the Julie task board and will appear only with verified data sources." navigate={navigate} />;
    return <HomePage navigate={navigate} gw={gw} />;
  };

  return (
    <div className={`app${menuOpen ? " mobile-menu-open" : ""}`}>
      <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />
      <aside id="primary-navigation" className={`sidebar${menuOpen ? " open" : ""}`}>
        <div className="sidebar-heading">
          <div className="brand">
            <div className="brand-orb" />
            <div><h1>Julie</h1><span>AiOS</span></div>
          </div>
          <button className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close navigation">×</button>
        </div>
        <div className="sidebar-nav-scroll">
          {SIDEBAR_SECTIONS.map((section) => (
            <div className="sidebar-section" key={section.label}>
              <div className="section-label">{section.label}</div>
              {section.items.map((item) => {
                const active = item.path === "/" ? route === "/" : route === item.path || route.startsWith(`${item.path}/`);
                return <button key={item.path} className={`nav-item${active ? " active" : ""}`}
                  onClick={() => onNav(item)} aria-current={active ? "page" : undefined}>
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
                </button>;
              })}
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <button className="icon-btn" onClick={onLogout}>Sign out</button>
        </div>
      </aside>

      <main className={`main${route === "/chat" ? " chat-main" : route === "/agent-messenger" ? " messenger-main" : ""}`}>
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open navigation"
            aria-expanded={menuOpen} aria-controls="primary-navigation">☰</button>
          <GatewayPill status={gw} />
        </header>
        <RouteErrorBoundary key={route} route={route} onHome={() => navigate("/")}>
          {renderView()}
        </RouteErrorBoundary>
      </main>

      <nav className="bottom-nav">
        {BOTTOM_NAV.map(item => {
          const active = item.action === "menu"
            ? menuOpen
            : !item.action && (item.path === "/" ? route === "/" : route === item.path || route.startsWith(`${item.path}/`));
          return <button key={item.path}
            className={`${active ? "active" : ""}${item.action === "voice" ? ` voice-entry ${voiceState}` : ""}`}
            onClick={() => onNav(item)} aria-label={item.action === "voice" ? "Talk to Julie" : item.label}
            aria-current={active && item.action !== "menu" ? "page" : undefined} aria-expanded={item.action === "menu" ? menuOpen : undefined}>
            <span className="icon"><FooterNavIcon item={item} /></span>
            <span className="bottom-nav-label">{item.label}</span>
          </button>;
        })}
      </nav>

      {/* Headless global voice controller. The footer-center microphone is the
          only visible voice control and dispatches into this component. */}
      <VoiceFab route={route} onOpenChat={() => navigate("/chat")} showButton={false} />
    </div>
  );
}

function GatewayPill({ status }: { status: GatewayStatus | null }) {
  const kind = !status ? "wait" : status.connected ? "ok" : "err";
  const label = !status ? "Checking gateway…" : status.connected ? "System Online" : "System Offline";
  const detail = status?.connected
    ? [status.serverVersion ? `Gateway ${status.serverVersion}` : "Gateway connected", status.latencyMs != null ? `${status.latencyMs} ms` : ""].filter(Boolean).join(" · ")
    : status?.error || label;
  return <span className={`status-pill ${kind}`} role="status" aria-live="polite" title={detail}>
    <span className="status-dot" /> <span>{label}</span>
  </span>;
}

function ComingSoonPage({ title, icon, description, dependency, navigate }: {
  title: string;
  icon: string;
  description: string;
  dependency: string;
  navigate: (to: string) => void;
}) {
  return (
    <section className="coming-soon-page">
      <div className="coming-soon-glow" aria-hidden="true" />
      <div className="coming-soon-icon" aria-hidden="true">{icon}</div>
      <div className="coming-soon-kicker">Planned capability</div>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="coming-soon-dependency">
        <span>Dependency</span>
        <strong>{dependency}</strong>
      </div>
      <div className="coming-soon-actions">
        <button className="btn" onClick={() => navigate("/tasks")}>View task board</button>
        <button className="btn-secondary" onClick={() => navigate("/")}>Back home</button>
      </div>
    </section>
  );
}

type RouteErrorBoundaryProps = {
  route: string;
  onHome: () => void;
  children: React.ReactNode;
};

class RouteErrorBoundary extends React.Component<RouteErrorBoundaryProps, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`Route render failed (${this.props.route})`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="route-error card" role="alert">
        <div className="route-error-icon" aria-hidden="true">!</div>
        <div className="chat-eyebrow">Page recovered</div>
        <h2>This view hit an unexpected error</h2>
        <p>Julie kept the rest of the command center running. Retry this view or return home.</p>
        <div className="route-error-actions">
          <button className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
          <button className="btn-secondary" onClick={this.props.onHome}>Back home</button>
          <button className="btn-secondary" onClick={() => window.location.reload()}>Reload app</button>
        </div>
      </section>
    );
  }
}

function PageState({ kind, title, detail, onRetry, action }: {
  kind: "loading" | "empty" | "error";
  title: string;
  detail?: string;
  onRetry?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <section className={`page-state ${kind}`} role={kind === "error" ? "alert" : "status"} aria-live="polite">
      <div className="page-state-symbol" aria-hidden="true">
        {kind === "loading" ? <span className="page-state-spinner" /> : kind === "error" ? "!" : "—"}
      </div>
      <strong>{title}</strong>
      {detail && <p>{detail}</p>}
      {onRetry && <button className="btn-secondary" onClick={onRetry}>Try again</button>}
      {action}
    </section>
  );
}

// --- Home Page: Dashboard (Phase D-1 reference design) ---
const OWNER_NAME = "Ikenna";

const AI_TOOLS: Array<{ label: string; icon: string; prompt: string }> = [
  { label: "Summarize", icon: "Σ", prompt: "Summarize the following text into the key points:\n\n" },
  { label: "Translate", icon: "文A", prompt: "Translate the following text into English:\n\n" },
  { label: "Write", icon: "✎", prompt: "Help me write something. My topic and instructions:\n\n" },
  { label: "Analyze", icon: "◔", prompt: "Analyze the following and explain what you find:\n\n" },
  { label: "Design", icon: "✦", prompt: "Propose a design concept for:\n\n" },
  { label: "Code", icon: "</>", prompt: "Write code for:\n\n" },
];

const SMART_SHORTCUTS: Array<{ title: string; sub: string; icon: string; tone: "cyan" | "violet"; prompt: string }> = [
  { title: "Meeting Summary", sub: "Summarize your meeting", icon: "▣", tone: "cyan", prompt: "Summarize my meeting: list the key decisions, action items, and owners." },
  { title: "Email Assistant", sub: "Draft professional email", icon: "✉", tone: "violet", prompt: "Draft a professional email for me. Ask me for the recipient and the key points first." },
  { title: "Study Helper", sub: "Explain any topic", icon: "◈", tone: "cyan", prompt: "Explain this topic simply, then quiz me with 3 short questions:\n" },
  { title: "Plan My Day", sub: "Schedule & prioritize", icon: "◷", tone: "violet", prompt: "Review my open tasks and plan my day: propose a prioritized schedule with time blocks." },
];

const TRENDING_HUB = "https://dev.to/t/ai";

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}
function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function msgTimeLabel(m: Message): string {
  const d = new Date(m.created_at);
  const sameDay = d.toDateString() === new Date().toDateString();
  return `${sameDay ? "TODAY" : ""} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`.trim();
}
function elapsedSince(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}
function dayAbbr(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
}
function wxIcon(code: string): string {
  const c = Number(code);
  if (Number.isNaN(c)) return "☁️";
  if (c === 0) return "☀️";
  if (c <= 2) return "🌤️";
  if (c === 3) return "☁️";
  if (c === 45 || c === 48) return "🌫️";
  if (c >= 51 && c <= 57) return "🌦️";
  if (c >= 61 && c <= 67) return "🌧️";
  if (c >= 71 && c <= 77) return "❄️";
  if (c >= 80 && c <= 82) return "🌧️";
  if (c === 85 || c === 86) return "❄️";
  if (c >= 95) return "⛈️";
  return "🌤️";
}

const BUST_PARTICLES = [
  { x: 18, y: 30, d: 0, s: 7 }, { x: 82, y: 26, d: 1.2, s: 8 }, { x: 12, y: 62, d: 2.1, s: 6 },
  { x: 88, y: 58, d: 0.6, s: 9 }, { x: 30, y: 12, d: 1.8, s: 7.5 }, { x: 66, y: 8, d: 2.6, s: 6.5 },
  { x: 46, y: 20, d: 0.3, s: 8.5 }, { x: 60, y: 88, d: 1.5, s: 7 }, { x: 24, y: 84, d: 2.9, s: 6.8 }, { x: 78, y: 82, d: 0.9, s: 7.2 },
];

function HologramBust() {
  return (
    <div className="hv-bust-wrap">
      <svg className="hv-bust" viewBox="0 0 220 300" aria-hidden="true">
        <defs>
          {/* skin: lit from upper-left for 3D volume */}
          <linearGradient id="hvSkin" x1="0.2" y1="0" x2="0.85" y2="1">
            <stop offset="0%" stopColor="#FFEFDC" />
            <stop offset="38%" stopColor="#FFC48C" />
            <stop offset="100%" stopColor="#D96A10" />
          </linearGradient>
          <radialGradient id="hvFaceGlow" cx="42%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#FFF3E6" stopOpacity="0.85" />
            <stop offset="55%" stopColor="#FFB36B" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#FF8C33" stopOpacity="0.05" />
          </radialGradient>
          <linearGradient id="hvHair" x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="#FFB366" />
            <stop offset="55%" stopColor="#E56B12" />
            <stop offset="100%" stopColor="#B85005" />
          </linearGradient>
          <linearGradient id="hvBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF9A3D" stopOpacity="0.44" />
            <stop offset="100%" stopColor="#D35400" stopOpacity="0.15" />
          </linearGradient>
          <radialGradient id="hvAura" cx="50%" cy="55%" r="60%">
            <stop offset="0%" stopColor="#FF9A3D" stopOpacity="0.22" />
            <stop offset="70%" stopColor="#E05E00" stopOpacity="0.07" />
            <stop offset="100%" stopColor="#E05E00" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hvCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFF3E6" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#FFB36B" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#FF8C33" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hvBase" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FF9A3D" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#FF9A3D" stopOpacity="0" />
          </radialGradient>
          {/* hologram dissolve: figure fades out at the bottom */}
          <linearGradient id="hvFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="74%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0.25" />
          </linearGradient>
          <mask id="hvDissolve">
            <rect x="0" y="0" width="220" height="300" fill="url(#hvFade)" />
          </mask>
          <filter id="hvSoft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id="hvSoft2" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>

        {/* ambient aura behind the figure */}
        <ellipse cx="110" cy="170" rx="98" ry="128" fill="url(#hvAura)" />
        {/* halo rings behind head */}
        <circle cx="110" cy="98" r="56" fill="none" stroke="#FFB36B" strokeOpacity="0.4" strokeWidth="1.2" />
        <circle cx="110" cy="98" r="65" fill="none" stroke="#FF8C33" strokeOpacity="0.2" strokeWidth="1" />

        {/* hologram figure (bottom dissolves) */}
        <g mask="url(#hvDissolve)">
          {/* hair — back silhouette with flowing tips */}
          <path d="M 110 34 C 74 36 60 62 63 94 C 65 124 59 158 48 194 C 62 186 72 168 77 148 C 76 122 76 100 80 86 C 86 70 96 62 110 62 C 124 62 134 70 140 86 C 144 100 144 122 143 148 C 148 168 158 186 172 194 C 161 158 155 124 157 94 C 160 62 146 36 110 34 Z"
            fill="url(#hvHair)" fillOpacity="0.68" stroke="#FFC08A" strokeOpacity="0.7" strokeWidth="1.1" />
          {/* hair — inner flow strands (volume) */}
          <path d="M 74 96 C 72 124 68 152 58 182 M 84 80 C 80 110 78 140 70 172 M 146 96 C 148 124 152 152 162 182 M 136 80 C 140 110 142 140 150 172"
            stroke="#FFC08A" strokeOpacity="0.5" strokeWidth="1" fill="none" />
          {/* D-3 M6: finer strands for readable texture */}
          <path d="M 80 88 C 76 116 72 146 64 176 M 90 74 C 86 104 84 134 76 166 M 95 66 C 92 96 90 126 84 156 M 140 88 C 144 116 148 146 156 176 M 130 74 C 134 104 136 134 144 166 M 125 66 C 128 96 130 126 136 156"
            stroke="#FFD9B0" strokeOpacity="0.3" strokeWidth="0.7" fill="none" />
          {/* D-3 M6: hair highlight streak (light catch, upper-left) */}
          <path d="M 84 74 C 80 96 78 124 74 152" stroke="#FFEFDC" strokeOpacity="0.55" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          {/* D-3 M6: shadow side (right) — deeper lit/shadow contrast for 3D */}
          <path d="M 110 45 C 128 46 144 62 142 94 C 141 112 136 128 128 138 C 124 142 118 144 114 145 C 124 138 132 128 134 112 C 137 88 130 64 110 45 Z"
            fill="#B85005" fillOpacity="0.3" filter="url(#hvSoft2)" />
          <path d="M 143 108 C 149 148 145 178 159 208 C 147 202 138 184 136 158 Z" fill="#B85005" fillOpacity="0.28" />
          {/* torso with drape */}
          <path d="M 40 268 C 44 220 58 196 84 186 C 92 183 99 180 103 176 L 105 154 C 108 156 112 156 115 154 L 117 176 C 121 180 128 183 136 186 C 162 196 176 220 180 268 Z"
            fill="url(#hvBody)" stroke="#FFC99B" strokeOpacity="0.75" strokeWidth="1.3" />
          {/* collarbone shading */}
          <path d="M 90 202 C 99 209 121 209 130 202 M 104 196 L 110 202 L 116 196"
            stroke="#FFD9B0" strokeOpacity="0.4" strokeWidth="1" fill="none" />
          {/* chest core + circuits */}
          <g className="hv-core">
            <circle cx="110" cy="220" r="16" fill="url(#hvCore)" filter="url(#hvSoft2)" />
            <path d="M 110 208 L 121 220 L 110 232 L 99 220 Z" fill="#FFE8D6" fillOpacity="0.5" stroke="#FFD9B0" strokeOpacity="0.85" strokeWidth="1.2" />
            <path d="M 110 236 L 110 252 M 102 246 L 94 258 M 118 246 L 126 258" stroke="#FF9A3D" strokeOpacity="0.6" strokeWidth="1" fill="none" />
            <circle cx="94" cy="258" r="1.8" fill="#FF8C33" />
            <circle cx="126" cy="258" r="1.8" fill="#FF8C33" />
          </g>
          {/* neck */}
          <path d="M 104 128 C 104 148 101 160 96 167 C 104 174 116 174 124 167 C 119 160 116 148 116 128 Z"
            fill="url(#hvSkin)" fillOpacity="0.55" stroke="#FFB36B" strokeOpacity="0.5" strokeWidth="1.1" />
          {/* neck shadow under jaw */}
          <path d="M 104 132 C 107 138 113 138 116 132 C 114 144 106 144 104 132 Z" fill="#B85005" fillOpacity="0.35" filter="url(#hvSoft2)" />
          {/* face */}
          <path d="M 78 94 C 78 70 92 56 110 56 C 128 56 142 70 142 94 C 142 110 136 123 128 133 C 122 140 116 143 110 143 C 104 143 98 140 92 133 C 84 123 78 110 78 94 Z"
            fill="url(#hvSkin)" fillOpacity="0.9" stroke="#FFD9B0" strokeOpacity="0.9" strokeWidth="1.4" />
          {/* face volume: lit top-left, soft cheek glow, jaw shade */}
          <ellipse cx="98" cy="96" rx="17" ry="21" fill="#FFF3E6" fillOpacity="0.22" filter="url(#hvSoft2)" />
          <ellipse cx="94" cy="115" rx="6.5" ry="4" fill="#FF9666" fillOpacity="0.16" filter="url(#hvSoft2)" />
          <ellipse cx="126" cy="115" rx="6.5" ry="4" fill="#FF9666" fillOpacity="0.12" filter="url(#hvSoft2)" />
          <path d="M 96 128 C 103 134 117 134 124 128 C 118 141 102 141 96 128 Z" fill="#C2620C" fillOpacity="0.28" filter="url(#hvSoft2)" />
          {/* brows */}
          <path d="M 88 95 C 94 91 102 91 107 94 M 113 94 C 118 91 126 91 132 95"
            stroke="#E56B12" strokeOpacity="0.75" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          {/* eyes — downcast, serene + lash hint (reference pose) */}
          <path d="M 92 105 C 96 109 102 109 106 105 M 114 105 C 118 109 124 109 128 105"
            stroke="#7A3A06" strokeOpacity="0.8" strokeWidth="1.7" strokeLinecap="round" fill="none" />
          <path d="M 93 108 L 91 110 M 105 108 L 107 110 M 115 108 L 113 110 M 127 108 L 129 110"
            stroke="#7A3A06" strokeOpacity="0.55" strokeWidth="1.1" strokeLinecap="round" />
          <path d="M 92 99 C 96 96 102 96 106 99 M 114 99 C 118 96 124 96 128 99"
            stroke="#FFB36B" strokeOpacity="0.4" strokeWidth="1" fill="none" />
          {/* nose hint */}
          <path d="M 110 102 C 109 108 108 112 106 115 C 108 117 112 117 114 115" stroke="#C2620C" strokeOpacity="0.45" strokeWidth="1.1" fill="none" strokeLinecap="round" />
          {/* lips */}
          <path d="M 104 126 C 108 124 112 124 116 126 C 112 130 108 130 104 126 Z" fill="#FF8C5A" fillOpacity="0.55" />
          <path d="M 104 126 L 116 126" stroke="#B85005" strokeOpacity="0.5" strokeWidth="0.8" strokeLinecap="round" />
          {/* hair — front layer over forehead */}
          <path d="M 78 94 C 75 62 92 46 110 45 C 128 46 145 62 142 94 C 136 74 129 64 117 60 C 112 74 95 82 83 79 C 80 83 79 89 78 94 Z"
            fill="url(#hvHair)" fillOpacity="0.85" stroke="#FFC08A" strokeOpacity="0.7" strokeWidth="1.2" />
          {/* side strands falling over shoulders */}
          <path d="M 77 108 C 71 148 75 178 61 208 C 73 202 82 184 84 158 L 86 116 Z" fill="url(#hvHair)" fillOpacity="0.72" stroke="#FFC08A" strokeOpacity="0.6" strokeWidth="1" />
          <path d="M 143 108 C 149 148 145 178 159 208 C 147 202 138 184 136 158 L 134 116 Z" fill="url(#hvHair)" fillOpacity="0.72" stroke="#FFC08A" strokeOpacity="0.6" strokeWidth="1" />
          {/* rim light — left edge for 3D pop */}
          <path d="M 79 92 C 79 68 93 56 110 56" stroke="#FFEFD9" strokeOpacity="0.95" strokeWidth="1.7" fill="none" strokeLinecap="round" />
          <path d="M 63 94 C 64 122 58 158 48 194" stroke="#FFEFD9" strokeOpacity="0.5" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </g>

        {/* base platform glow + rings */}
        <ellipse cx="110" cy="284" rx="62" ry="10" fill="url(#hvBase)" filter="url(#hvSoft)" />
        <ellipse cx="110" cy="284" rx="70" ry="12" fill="none" stroke="#FFB36B" strokeOpacity="0.5" strokeWidth="1.3" />
        <ellipse cx="110" cy="284" rx="48" ry="8" fill="none" stroke="#FF8C33" strokeOpacity="0.4" strokeWidth="1" />
      </svg>
      <div className="hv-scanline" aria-hidden="true" />
      {BUST_PARTICLES.map((p, i) => (
        <span key={i} className="hv-particle" style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${p.d}s`, animationDuration: `${p.s}s` }} />
      ))}
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const w = 300, h = 64, pad = 5;
  const max = Math.max(...points, 1);
  const n = points.length;
  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(n - 1, 1);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(n - 1).toFixed(1)} ${h - pad} L ${x(0).toFixed(1)} ${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="hv-spark" preserveAspectRatio="none" role="img" aria-label="Completed or evidenced tasks per day, last 14 days">
      <defs>
        <linearGradient id="hvSparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF9A3D" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#E05E00" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="hvSparkLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFA14E" />
          <stop offset="100%" stopColor="#E05E00" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#hvSparkFill)" />
      <path d={line} fill="none" stroke="url(#hvSparkLine)" strokeWidth="2" strokeLinecap="round" />
      <circle cx={x(n - 1)} cy={y(points[n - 1])} r="3" fill="#FFD9B0" />
    </svg>
  );
}

function ScoreRing({ value }: { value: number | null }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const clamped = value == null ? 0 : Math.min(Math.max(value, 0), 100);
  const off = value == null ? c : c * (1 - clamped / 100);
  return (
    <svg width={64} height={64} viewBox="0 0 64 64">
      <defs>
        <linearGradient id="hvRingGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFA14E" />
          <stop offset="100%" stopColor="#E05E00" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r={r} stroke="rgba(148,163,184,0.15)" strokeWidth="6" fill="none" />
      <circle cx="32" cy="32" r={r} stroke="url(#hvRingGrad)" strokeWidth="6" fill="none" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 32 32)" />
    </svg>
  );
}

function HomePage({ navigate, gw }: { navigate: (to: string) => void; gw: GatewayStatus | null }) {
  const [hour] = useState(() => new Date().getHours());
  const [activeWs, setActiveWs] = useState<number | null>(null);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherError, setWeatherError] = useState("");
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [devicesSource, setDevicesSource] = useState<"" | "gateway" | "fallback">("");
  const [ownerAvatar, setOwnerAvatar] = useState<string | null>(null);
  const [trending, setTrending] = useState<TrendingItem[] | null>(null);
  const [trendingError, setTrendingError] = useState("");
  const [insights, setInsights] = useState<Insights | null>(null);
  const [cmd, setCmd] = useState("");
  const [posting, setPosting] = useState<string | null>(null);
  // D2-6: top frequent prompts learned from the owner's real usage history
  const [learned, setLearned] = useState<Array<{ prompt_hash: string; prompt: string; uses: number }>>([]);

  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  useEffect(() => {
    api.workspaces().then((d) => {
      const activeId = d.activeWorkspaceId || d.workspaces[0]?.id;
      if (activeId) setActiveWs(activeId);
    }).catch(() => {});
    api.weather().then(setWeather).catch((e) => setWeatherError(e.message));
    api.devices().then((d) => { setDevices(d.devices); setDevicesSource(d.source); })
      .catch(() => setDevices([{ id: "this-device", name: "This device", connected: true, detail: "This device", lastSeenAtMs: null }]));
    api.insights().then((d) => setInsights(d.insights)).catch(() => {});
    api.avatar().then((d) => setOwnerAvatar(d.avatar)).catch(() => {});
    api.promptUsage(3).then((d) => setLearned(d.prompts.slice(0, 3))).catch(() => {});
    api.trending().then((d) => setTrending(d.items)).catch((e) => setTrendingError(e.message));
  }, []);

  useEffect(() => {
    if (activeWs == null) return;
    api.conversations(activeWs).then((d) => {
      setConvs(d.conversations);
      const latest = d.conversations[0];
      if (latest) api.messages(latest.id).then((m) => setMessages(m.messages)).catch(() => {});
      else setMessages([]);
    }).catch(() => {});
    api.tasks(activeWs).then((d) => setTasks(d.tasks)).catch(() => {});
  }, [activeWs]);

  const latestConv = convs[0] ?? null;
  const previewMsgs = messages.slice(-4);
  const lastMsg = messages[messages.length - 1] ?? null;
  const pendingTasks = tasks.filter((t) => t.status !== "done").length;

  const todayKey = new Date().toDateString();
  const schedule = tasks
    .filter((t) =>
      new Date(t.created_at).toDateString() === todayKey ||
      (t.run_started_at && new Date(t.run_started_at).toDateString() === todayKey) ||
      t.status === "in_progress")
    .map((t) => ({ ...t, time: new Date(t.run_started_at ?? t.created_at).getTime(), src: t.run_started_at ?? t.created_at }))
    .sort((a, b) => a.time - b.time);

  // Every widget interaction posts into the CURRENTLY OPEN conversation (latest in the
  // active workspace) — the Phase C.1 convId pattern. Never spawns a new session unless
  // none exists yet; then it creates one so the prompt has somewhere to live.
  const postToConversation = useCallback(async (text: string, tag: string) => {
    if (posting) return;
    setPosting(tag);
    try {
      let convId = latestConv?.id ?? null;
      if (!convId) {
        if (activeWs == null) throw new Error("No active workspace");
        const d = await api.createConversation(activeWs, "New conversation");
        convId = d.conversation.id;
        setConvs((prev) => [d.conversation, ...prev]);
      }
      await api.sendMessage(convId, text);
      navigate("/chat");
    } catch (e) {
      console.error("home post failed:", e);
    } finally {
      setPosting(null);
    }
  }, [posting, latestConv, activeWs, navigate]);

  const retryWeather = () => {
    setWeatherError("");
    api.weather().then(setWeather).catch((e) => setWeatherError(e.message));
  };

  const prod = insights?.productivity ?? null;
  const prodClass = !prod ? "flat" : prod.pct == null ? "flat" : prod.pct > 0 ? "up" : prod.pct < 0 ? "down" : "flat";

  return (
    <div className="home-v2">
      <div className="home-grid">
        {/* LEFT COLUMN */}
        <div className="home-col">
          {/* 1. Greeting */}
          <section className="hv-card card-greeting">
            <h2 className="hv-greeting-title">Hello, {OWNER_NAME}</h2>
            <p className="hv-greeting-sub">What would you like to accomplish today?</p>
            <Wave bars={24} className="hv-waveform" />
            <form className="hv-cmd" onSubmit={(e) => { e.preventDefault(); if (cmd.trim() && !posting) postToConversation(cmd.trim(), "cmd"); }}>
              <input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="Ask Julie anything…" aria-label="Command input" />
              <button className="hv-cmd-send" type="submit" disabled={!cmd.trim() || !!posting} aria-label="Send">➤</button>
            </form>
            {gw && !gw.connected && <div className="hv-empty" style={{ padding: "8px 0 0" }}>Gateway offline — responses may be delayed.</div>}
            {/* 2. AI tools live inside the greeting card as in the reference. */}
            <div className="hv-inline-tools">
            <div className="hv-card-head"><span className="hv-card-title">AI TOOLS</span></div>
            <div className="hv-tiles">
              {AI_TOOLS.map((t) => (
                <button key={t.label} className="hv-tile" disabled={!!posting} title={t.prompt.trim()} onClick={() => postToConversation(t.prompt, t.label)}>
                  <span className="hv-tile-icon">{t.icon}</span>
                  <span className="hv-tile-label">{t.label}</span>
                </button>
              ))}
            </div>
            <button className="hv-link" onClick={() => navigate("/tools")}>Explore all tools →</button>
            </div>
          </section>

          {/* 3. Smart shortcuts — static set + learned prompts (D2-6) */}
          <section className="hv-card card-shortcuts">
            <div className="hv-card-head"><span className="hv-card-title">SMART SHORTCUTS</span></div>
            {learned.length > 0 && (
              <>
                <div className="hv-learned-cap">FROM YOUR HISTORY</div>
                {learned.map((l) => (
                  <button key={l.prompt_hash} className="hv-row" disabled={!!posting}
                    title={`${l.prompt} — used ${l.uses}×`} onClick={() => postToConversation(l.prompt, `learned:${l.prompt_hash}`)}>
                    <span className="hv-row-icon hv-icon-violet">↺</span>
                    <span className="hv-row-body">
                      <span className="hv-row-title">{l.prompt}</span>
                      <span className="hv-row-sub">Learned from your usage</span>
                    </span>
                    <span className="hv-row-chev">{l.uses}×</span>
                  </button>
                ))}
              </>
            )}
            {SMART_SHORTCUTS.map((s) => (
              <button key={s.title} className="hv-row" disabled={!!posting} onClick={() => postToConversation(s.prompt, s.title)}>
                <span className={`hv-row-icon hv-icon-${s.tone}`}>{s.icon}</span>
                <span className="hv-row-body">
                  <span className="hv-row-title">{s.title}</span>
                  <span className="hv-row-sub">{s.sub}</span>
                </span>
                <span className="hv-row-chev">›</span>
              </button>
            ))}
          </section>

          {/* 4. Connected devices (real gateway data; honest single-row fallback) */}
          <section className="hv-card card-devices">
            <div className="hv-card-head"><span className="hv-card-title">CONNECTED DEVICES</span></div>
            {devices == null && <div className="hv-empty">Checking paired devices…</div>}
            {(devices ?? []).map((d) => (
              <div key={d.id} className="hv-row hv-device-row">
                <span className="hv-row-icon hv-icon-violet">▣</span>
                <span className="hv-row-body"><span className="hv-row-title">{d.name}</span></span>
                <span className="hv-device-status">
                  <span className={`hv-dot ${d.connected ? "on" : "off"}`} />
                  {d.detail}
                </span>
              </div>
            ))}
            <button className="hv-link" onClick={() => navigate("/profile")}>Manage devices →</button>
          </section>
        </div>

        {/* MIDDLE COLUMN */}
        <div className="home-col">
          {/* 5. AI assistant panel */}
          <section className="hv-card card-ai">
            <div className="hv-panel-head">
              {ownerAvatar && <img className="hv-owner-chip" src={ownerAvatar} alt="Owner" />}
              <span className="hv-panel-title">AI ASSISTANT</span>
            </div>
            <HologramBust />
            <div className="hv-bubble">
              {greeting}, {OWNER_NAME}. How can I help today?
            </div>
            <div className="hv-ai-meta">
              <span>{pendingTasks} {pendingTasks === 1 ? "task" : "tasks"}</span>
              <span aria-hidden="true">·</span>
              <span>{convs.length} {convs.length === 1 ? "chat" : "chats"}</span>
            </div>
          </section>

          {/* Chat history is its own bounded card, matching the reference. It
              cannot stretch the avatar panel when message content is long. */}
          <section className="hv-card card-chat-preview">
            <div className="hv-chat-label">{lastMsg ? msgTimeLabel(lastMsg) : "CHAT PREVIEW"}</div>
            <div className="hv-chat-preview">
              {messages.length === 0 && <div className="hv-empty">No messages yet — start from Chat, a tool, or a quick reply.</div>}
              {previewMsgs.map((m) => (
                <div key={m.id} className={`hv-msg ${m.role === "user" ? "user" : "assistant"}`}>
                  {m.role === "assistant" && <span className="hv-avatar">AI</span>}
                  <div className="hv-msg-bubble">{truncate(m.text, 170)}</div>
                </div>
              ))}
            </div>
            {latestConv && (
              <div className="hv-quick">
                {["Thanks!", "👍", "What's next?", "Explain this"].map((q) => (
                  <button key={q} className="hv-chip" disabled={!!posting} onClick={() => postToConversation(q, q)}>{q}</button>
                ))}
              </div>
            )}
          </section>

        </div>

        {/* RIGHT COLUMN */}
        <div className="home-col home-col-right">
          {/* 7. Weather (Port Harcourt via wttr.in, 30-min backend cache) */}
          <section className="hv-card card-weather">
            <div className="hv-card-head"><span className="hv-card-title">WEATHER</span></div>
            {weather ? (
              <>
                <div className="hv-wx-loc">◉ {weather.city}</div>
                <div className="hv-wx-main">
                  <span className="hv-wx-temp">{Math.round(weather.tempC)}°</span>
                  <span className="hv-wx-cond">{weather.condition}</span>
                </div>
                <div className="hv-wx-forecast">
                  {weather.forecast.slice(0, 5).map((d, i) => (
                    <div key={d.day} className="hv-wx-day">
                      <span className="hv-wx-dow">{i === 0 ? "TODAY" : dayAbbr(d.day)}</span>
                      <span className="hv-wx-icon">{wxIcon(d.icon)}</span>
                      <span className="hv-wx-t">{Math.round(d.tempC)}°</span>
                    </div>
                  ))}
                </div>
              </>
            ) : weatherError ? (
              <div className="hv-empty">
                <div>Weather unavailable</div>
                <p>Live data from wttr.in could not be fetched. Try again in a few minutes.</p>
                <button className="hv-link" onClick={retryWeather}>Retry →</button>
              </div>
            ) : (
              <div className="hv-empty">Loading weather…</div>
            )}
          </section>

          {/* 8. AI insights (real analytics from SQLite) */}
          <section className="hv-card card-insights">
            <div className="hv-card-head"><span className="hv-card-title">AI INSIGHTS</span></div>
            {insights ? (
              <>
                <Sparkline points={insights.spark.map((p) => p.count)} />
                <div className="hv-ins-row">
                  <div className="hv-prod">
                    <span className="hv-prod-label">Productivity</span>
                    <span className={`hv-prod-delta ${prodClass}`}>
                      {prod && prod.pct != null
                        ? `${prod.pct > 0 ? "↑" : prod.pct < 0 ? "↓" : "→"} ${Math.abs(prod.pct)}%`
                        : prod && prod.today > 0 ? `${prod.today} done` : "No work yet"}
                    </span>
                    <span className="hv-prod-sub" title="Completed tasks and tasks with saved run output today">
                      {prod ? `${prod.completedToday} completed · ${prod.evidencedRunsToday} verified` : "Real task evidence"}
                    </span>
                  </div>
                  <div className="hv-score">
                    <div className="hv-score-ring-wrap">
                      <ScoreRing value={insights.score} />
                      <span className="hv-score-num">{insights.score == null ? "—" : insights.score}</span>
                    </div>
                    <span className="hv-score-label">Score</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="hv-empty">Loading insights…</div>
            )}
          </section>

          {/* 9. Today's schedule (real tasks from the DB) */}
          <section className="hv-card card-schedule">
            <div className="hv-card-head"><span className="hv-card-title">TODAY'S SCHEDULE</span></div>
            {schedule.length === 0 ? (
              <div className="hv-empty">Nothing scheduled for today</div>
            ) : (
              schedule.slice(0, 6).map((t) => (
                <div key={t.id} className="hv-sched-row">
                  <span className="hv-sched-time">{hhmm(t.src)}</span>
                  <span className="hv-sched-title">{t.title}</span>
                  <span className={`hv-chip-status st-${t.status}`}>
                    {t.status === "in_progress" && t.run_started_at ? `${elapsedSince(t.run_started_at)} · ` : ""}{STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </div>
              ))
            )}
            <button className="hv-link" onClick={() => navigate("/tasks")}>View full calendar →</button>
          </section>

          {/* 10. Trending for you (live DEV API; real article thumbnails) */}
          <section className="hv-card card-trending">
            <div className="hv-card-head"><span className="hv-card-title">TRENDING FOR YOU</span></div>
            {trending == null && !trendingError && <div className="hv-empty">Loading live AI reads…</div>}
            {trendingError && (
              <div className="hv-empty">
                <div>Live reads unavailable</div>
                <p>DEV Community could not be reached.</p>
                <button className="hv-link" onClick={() => {
                  setTrendingError("");
                  api.trending().then((d) => setTrending(d.items)).catch((e) => setTrendingError(e.message));
                }}>Retry →</button>
              </div>
            )}
            {(trending ?? []).map((a) => (
              <a key={a.id} className="hv-row hv-trend-row" href={a.url} target="_blank" rel="noopener noreferrer">
                <img className="hv-trend-thumb" src={a.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
                <span className="hv-row-body">
                  <span className="hv-row-title">{a.title}</span>
                  <span className="hv-row-sub">{a.category} · {a.readTimeMinutes} min read</span>
                </span>
              </a>
            ))}
            <button className="hv-link" onClick={() => window.open(TRENDING_HUB, "_blank", "noopener,noreferrer")}>Explore more →</button>
          </section>
        </div>
      </div>
    </div>
  );
}

// --- Voice Chat Page (deep-link only; inline capture is handled by the global VoiceFab) ---
// Shares the exact capture + submit code path with the global voice button:
// web/src/voice.ts (Phase C.1 convId pattern: current conversation, never
// auto-created). The /voice route is kept for deep links; it never auto-starts.
function VoicePage() {
  const [status, setStatus] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [supported] = useState(() => speechSupported());
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const stopRef = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);

  useEffect(
    () => () => {
      stopRef.current?.();
    },
    []
  );

  const startListening = () => {
    const stop = startSpeechRecognition({
      onState: (s) => {
        if (s === "listening") setStatus("listening");
        if (s === "error" && !busyRef.current) setStatus("error");
        if (s === "ended" && !busyRef.current) setStatus((cur) => (cur === "listening" ? "idle" : cur));
      },
      onResult: (text) => {
        busyRef.current = true;
        setTranscript(text);
        setStatus("processing");
        submitVoiceText(text)
          .then((r) => {
            if (r.reply) {
              setResponse(r.reply);
              if (ttsEnabled) speakWithTracking(r.reply);
            }
            setStatus("idle");
          })
          .catch((e: any) => {
            console.error("Voice submission error:", e);
            setStatus("error");
          })
          .finally(() => {
            busyRef.current = false;
          });
      },
    });
    if (!stop) {
      setStatus("error");
      return;
    }
    stopRef.current = stop;
    setStatus("listening");
  };

  const stopListening = () => {
    stopRef.current?.();
    stopRef.current = null;
    setStatus((cur) => (cur === "listening" ? "idle" : cur));
  };

  const speak = (text: string) => {
    if (!ttsEnabled) return;
    speakWithTracking(text);
  };

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 40 }}>
      <div className={`orb ${status}`} style={{ width: 150, height: 150 }} />
      <Wave bars={28} className="voice-page-wave" />
      <div className="mt-4 text-dim" style={{ fontSize: "1.2rem", textTransform: "capitalize" }}>{status}</div>
      {!supported && <div className="error-text mt-4">SpeechRecognition not supported in this browser. Please use text input below.</div>}
      <div className="mt-4" style={{ display: "flex", gap: 10, width: "100%", maxWidth: 400 }}>
        <input placeholder="Text fallback input…" value={transcript} onChange={e => setTranscript(e.target.value)}
          onKeyDown={e => e.key === "Enter" && transcript.trim() && submitVoiceText(transcript)
            .then(r => { if (r.reply) { setResponse(r.reply); speak(r.reply); } })
            .catch((err) => { console.error("Voice submission error:", err); setStatus("error"); })}
          />
        <button className="btn" onClick={() => transcript.trim() && submitVoiceText(transcript)
          .then(r => { if (r.reply) { setResponse(r.reply); speak(r.reply); } })
          .catch((err) => { console.error("Voice submission error:", err); setStatus("error"); })}
          disabled={!transcript.trim()}>Send</button>
      </div>
      <div className="mt-4" style={{ display: "flex", gap: 10 }}>
        {status === "listening" ? (
          <button className="btn" style={{ background: "#d32f2f" }} onClick={stopListening}>⏹ Stop Listening</button>
        ) : (
          <button className="btn" onClick={startListening} disabled={!supported || status === "processing" || status === "speaking"}>🎤 Start Listening</button>
        )}
        <button className="icon-btn" onClick={() => setTtsEnabled(!ttsEnabled)} title="Toggle voice output">
          {ttsEnabled ? "🔊" : "🔇"}
        </button>
      </div>
      {response && <div className="mt-4 p-4 card" style={{ width: "100%" }}><strong>Julie:</strong> <Markdown text={response} /></div>}
    </div>
  );
}

// --- Agent archive (all facts come from the real Gateway overview endpoint) ---
const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function formatCount(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? compactNumber.format(value) : "—";
}

function formatUsd(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: value < 0.01 ? 4 : 2 }).format(value)
    : "—";
}

function relativeAgentTime(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "No activity time";
  const elapsed = Math.max(0, Date.now() - value);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : new Date(value).toLocaleDateString();
}

function agentStateCopy(state: AgentOverviewItem["activity"]["state"]) {
  if (state === "working") return { label: "Working", detail: "Active Gateway run reported" };
  if (state === "no_active_run") return { label: "No active run", detail: "Visible sessions report no direct run" };
  if (state === "no_sessions") return { label: "No visible sessions", detail: "Configured agent; no session rows reported" };
  return { label: "Activity unknown", detail: "Session activity could not be verified" };
}

function AgentAvatar({ agent }: { agent: AgentOverviewItem }) {
  const [fallbackFailed, setFallbackFailed] = useState(false);
  if (agent.identity.avatar) return <img className="agent-archive-avatar" src={agent.identity.avatar} alt="" />;
  const initials = agent.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || agent.id.slice(0, 2).toUpperCase();
  if (!fallbackFailed) return <img className="agent-archive-avatar avatar-svg-fallback" src={api.agentAvatarFallbackUrl(agent.id)} alt="" onError={() => setFallbackFailed(true)} />;
  return <div className="agent-archive-avatar fallback" aria-hidden="true">
    <span>{agent.identity.emoji || initials}</span><i />
  </div>;
}

function AgentAssignmentDialog({ workspace, onClose, onSaved }: {
  workspace: { id: number; name: string };
  onClose: () => void;
  onSaved: (data: AgentAssignmentsResponse) => void;
}) {
  const [data, setData] = useState<AgentAssignmentsResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.agentAssignments(workspace.id).then((result) => {
      setData(result);
      setSelected(result.agents.filter((agent) => agent.assigned).map((agent) => agent.id));
    }).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false));
  }, [workspace.id]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const save = async () => {
    if (!confirmed || saving) { setError("Confirm the workspace membership change."); return; }
    setSaving(true);
    setError("");
    try { onSaved(await api.setAgentAssignments(workspace.id, selected)); }
    catch (requestError: any) { setError(requestError?.message ?? "Could not save workspace assignments."); }
    finally { setSaving(false); }
  };

  const needle = query.trim().toLowerCase();
  const rows = (data?.agents ?? []).filter((agent) => !needle || [agent.id, agent.displayName, agent.role, agent.model].some((value) => value?.toLowerCase().includes(needle)));
  return (
    <div className="dialog-backdrop" onMouseDown={() => !saving && onClose()}>
      <section className="workspace-agent-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-agent-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div className="chat-eyebrow">Workspace roster</div><h2 id="workspace-agent-title">Manage {workspace.name}</h2><p>Only checked agents appear in this workspace archive. Membership in multiple workspaces is explicit sharing.</p><button className="dialog-close" onClick={onClose} aria-label="Close">×</button></header>
        {loading ? <PageState kind="loading" title="Loading Gateway roster" detail="Preparing current and unassigned agent memberships." /> : data && (
          <>
            <div className="workspace-agent-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Gateway agents" /><span>{selected.length} assigned · {data.summary.gatewayRosterTotal} total</span><button onClick={() => setSelected(data.agents.map((agent) => agent.id))}>Select all</button><button onClick={() => setSelected([])}>Clear</button></div>
            <div className="workspace-agent-list">{rows.map((agent) => {
              const otherAssignments = agent.assignments.filter((assignment) => assignment.id !== workspace.id);
              return <label key={agent.id} className={selected.includes(agent.id) ? "selected" : ""}>
                <input type="checkbox" checked={selected.includes(agent.id)} onChange={() => setSelected((current) => current.includes(agent.id) ? current.filter((id) => id !== agent.id) : [...current, agent.id])} />
                <span className="workspace-agent-avatar">{agent.emoji || agent.displayName.slice(0, 2).toUpperCase()}</span>
                <span className="workspace-agent-copy"><strong>{agent.displayName}{agent.isDefault ? " · Primary" : ""}</strong><code>{agent.id}</code><small>{agent.role || "Julie role not configured"} · {agent.model || "Model not reported"}</small></span>
                <span className="workspace-agent-sharing">{otherAssignments.length ? `Also in ${otherAssignments.map((item) => item.name).join(", ")}` : agent.assignments.length === 0 ? "Unassigned" : "Only here"}</span>
              </label>;
            })}</div>
            <label className="onboarding-confirm workspace-agent-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed the active-workspace roster and any explicit shared memberships.</span></label>
          </>
        )}
        {error && <div className="chat-alert" role="alert">{error}</div>}
        <footer><span>Removing an agent here does not delete it from OpenClaw or another workspace.</span><div><button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button className="btn" onClick={save} disabled={loading || saving || !confirmed}>{saving ? "Saving…" : "Save roster"}</button></div></footer>
      </section>
    </div>
  );
}

const OFFICE_ROSTER_SPOTS = [
  [37, 36], [47, 32], [57, 36], [67, 32], [42, 49], [52, 45], [62, 49], [47, 60], [57, 58], [67, 61], [37, 58], [72, 47],
];
const OFFICE_ZONE_SPOTS: Record<AgentOverviewItem["office"]["zone"], number[][]> = {
  desk: [[34, 34], [48, 28], [62, 34], [38, 57], [54, 52], [68, 58]],
  library: [[18, 45], [23, 52]],
  lounge: [[79, 47], [83, 57]],
  home: [[43, 84], [49, 87], [56, 84], [63, 87]],
  staging: OFFICE_ROSTER_SPOTS,
};

function AgentOfficeMvp({ agents, workspace, navigate }: {
  agents: AgentOverviewItem[];
  workspace: { id: number; name: string };
  navigate: (to: string) => void;
}) {
  const zoneCounters: Record<AgentOverviewItem["office"]["zone"], number> = { desk: 0, library: 0, lounge: 0, home: 0, staging: 0 };
  const placements = new Map<string, { left: number; top: number; zone: AgentOverviewItem["office"]["zone"] }>();
  for (const agent of agents) {
    const zone = agent.office.zone;
    const spots = OFFICE_ZONE_SPOTS[zone];
    const index = zoneCounters[zone]++;
    const base = spots[index % spots.length];
    const cycle = Math.floor(index / spots.length);
    placements.set(agent.id, { left: base[0] + cycle * 1.5, top: base[1] + cycle * 1.2, zone });
  }
  const zoneCounts = agents.reduce((counts, agent) => {
    counts[agent.office.zone] = (counts[agent.office.zone] ?? 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  const deskPlacements = agents.filter((agent) => agent.office.zone === "desk").map((agent) => placements.get(agent.id)!);
  return (
    <section className="agent-office-section">
      <header className="agent-office-head"><div><span>Evidence-mapped canvas</span><h3>{workspace.name} Office</h3><p>Responsive CSS/SVG environment with an accessible roster. Only an exact active-run fact changes an agent's room placement.</p></div><b>{agents.length} assigned</b></header>
      <div className="agent-office-world">
        <svg className="agent-office-scene" viewBox="0 0 1000 610" role="img" aria-label={`Stylized office floor for ${workspace.name}`}>
          <defs>
            <linearGradient id="officeFloor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#18253A" /><stop offset="1" stopColor="#0A101C" /></linearGradient>
            <linearGradient id="officeWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#243550" /><stop offset="1" stopColor="#101827" /></linearGradient>
            <linearGradient id="officeGlow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFB56F" stopOpacity=".8" /><stop offset="1" stopColor="#FF6A00" stopOpacity=".25" /></linearGradient>
            <filter id="officeShadow"><feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#000" floodOpacity=".45" /></filter>
          </defs>
          <polygon points="80,170 500,35 920,170 500,570" fill="url(#officeFloor)" stroke="#33445E" strokeWidth="2" filter="url(#officeShadow)" />
          <polygon points="80,170 500,35 500,87 80,222" fill="url(#officeWall)" stroke="#33445E" />
          <polygon points="500,35 920,170 920,222 500,87" fill="#111B2B" stroke="#33445E" />
          <path d="M500 88v482M80 222l420 348M920 222 500 570" stroke="#24334A" strokeWidth="2" opacity=".7" />
          <path d="m230 221 270-87 270 87-270 257Z" fill="rgba(255,122,26,.025)" stroke="rgba(255,122,26,.2)" strokeDasharray="7 8" />

          <g className="office-room-label"><rect x="122" y="190" width="132" height="31" rx="12" /><text x="188" y="210">LIBRARY</text></g>
          <g className="office-room-label"><rect x="747" y="190" width="125" height="31" rx="12" /><text x="809" y="210">LOUNGE</text></g>
          <g className="office-room-label active"><rect x="420" y="111" width="160" height="34" rx="13" /><text x="500" y="133">ROSTER LOBBY</text></g>
          <g className="office-room-label"><rect x="422" y="518" width="156" height="31" rx="12" /><text x="500" y="538">OFF-DUTY EXIT</text></g>

          <g className="office-library" transform="translate(128 238)">
            <polygon points="0,18 107,0 107,127 0,150" fill="#111A29" stroke="#3A4B64" />
            {[24, 54, 84, 114].map((y) => <line key={y} x1="6" y1={y} x2="101" y2={y - 17} stroke="#52627A" />)}
            {[12, 31, 50, 69, 88].map((x, index) => <rect key={x} x={x} y={28 + (index % 2) * 22} width="9" height="25" fill={index % 2 ? "#FF9142" : "#7185A0"} transform={`rotate(-9 ${x} ${28 + (index % 2) * 22})`} />)}
          </g>

          <g className="office-lounge" transform="translate(735 256)">
            <polygon points="0,35 95,58 95,111 0,86" fill="#2A1B24" stroke="#5A3541" />
            <polygon points="0,35 28,21 122,44 95,58" fill="#643440" stroke="#855063" />
            <polygon points="95,58 122,44 122,94 95,111" fill="#3F2630" stroke="#65404C" />
            <ellipse cx="25" cy="110" rx="27" ry="11" fill="#111827" stroke="#334155" /><circle cx="25" cy="99" r="13" fill="#FF7A1A" opacity=".16" />
          </g>

          <g className="office-desks">
            {[[300, 210], [445, 170], [590, 210], [345, 345], [510, 320], [650, 350]].map(([x, y], index) => <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
              <polygon points="0,27 68,6 112,26 43,49" fill="#25344B" stroke="#4A5E78" />
              <path d="M43 49v34M105 28v31M7 29v29" stroke="#40516A" strokeWidth="5" />
              <polygon points="36,4 75,-7 91,1 52,13" fill="#07101C" stroke="#6B7D95" />
              <polygon points="52,13 91,1 91,28 52,40" fill="#0A1523" stroke="#53677F" />
              <rect x="60" y="12" width="23" height="3" fill={index % 2 ? "#7CA9D0" : "#FF8B35"} opacity=".75" transform="rotate(-17 60 12)" />
            </g>)}
          </g>
          <g className="office-live-desk-glows">
            {deskPlacements.map((spot, index) => <ellipse key={`${spot.left}-${spot.top}-${index}`} cx={spot.left * 10} cy={spot.top * 6.1 + 25} rx="34" ry="12" fill="rgba(74,222,128,.13)" stroke="rgba(74,222,128,.48)" strokeDasharray="4 4" />)}
          </g>

          <g className="office-roster-platform">
            <ellipse cx="500" cy="305" rx="177" ry="89" fill="rgba(255,122,26,.035)" stroke="rgba(255,122,26,.28)" strokeDasharray="6 7" />
            <ellipse cx="500" cy="315" rx="117" ry="52" fill="none" stroke="rgba(255,161,78,.13)" />
            <text x="500" y="309" textAnchor="middle" fill="#6E7D92" fontSize="13" letterSpacing="3">STAGING — NO ACTIVITY LOCATION YET</text>
          </g>

          <g className="office-home-pods">
            {[390, 470, 550, 630].map((x) => <g key={x} transform={`translate(${x} 493)`}><polygon points="0,18 28,0 57,18 29,38" fill="#182336" stroke="#3D4D64" /><path d="M9 15v28l20 12 19-12V15" fill="#101827" stroke="#34445B" /><rect x="24" y="31" width="10" height="17" fill="#FF7A1A" opacity=".17" /></g>)}
          </g>
        </svg>

        <div className="office-agent-stage" aria-hidden="true">
          {agents.map((agent) => {
            const placement = placements.get(agent.id)!;
            const state = agentStateCopy(agent.activity.state);
            return <div key={agent.id} className={`office-agent-token ${agent.activity.state} zone-${placement.zone}`} style={{ left: `${placement.left}%`, top: `${placement.top}%` }} title={`${agent.displayName} — ${agent.office.label}. ${agent.office.evidence}`}>
              <i className="office-agent-head">{agent.identity.emoji || agent.displayName.slice(0, 1)}</i><i className="office-agent-body" /><span>{agent.displayName}</span>
            </div>;
          })}
        </div>
      </div>
      <div className="office-zone-legend"><div className="verified"><i />Desk <strong>{zoneCounts.desk ?? 0}</strong><span>verified active run</span></div><div><i />Library <strong>{zoneCounts.library ?? 0}</strong><span>no exact reading event source</span></div><div><i />Lounge <strong>{zoneCounts.lounge ?? 0}</strong><span>no exact break event source</span></div><div><i />Off-duty <strong>{zoneCounts.home ?? 0}</strong><span>duty state unavailable</span></div><div><i />Roster lobby <strong>{zoneCounts.staging ?? 0}</strong><span>unclassified evidence</span></div></div>
      <div className="agent-office-truth"><span>Placement policy</span><strong>Evidence only</strong><p>`hasActiveRun=true` places an agent at a generic desk. Library, lounge, and off-duty locations require exact future events; absent evidence stays in the roster lobby.</p></div>
      <div className="agent-office-accessible" aria-label="Accessible office roster">
        {agents.map((agent) => {
          const state = agentStateCopy(agent.activity.state);
          return <button key={agent.id} onClick={() => navigate(`/agents/${encodeURIComponent(agent.id)}`)} title={agent.office.evidence}><span>{agent.identity.emoji || "◇"}</span><div><strong>{agent.displayName}</strong><small>{agent.role || "Role not configured"} · {agent.office.label}</small></div><i>Open profile →</i></button>;
        })}
        {agents.length === 0 && <div className="detail-empty">No agents are assigned to this workspace.</div>}
      </div>
    </section>
  );
}

function AgentOrganizationView({ workspaceId, navigate }: { workspaceId: number; navigate: (to: string) => void }) {
  const [data, setData] = useState<AgentOrganizationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api.agentOrganization(workspaceId));
    } catch (requestError: any) {
      setError(requestError?.message ?? "Could not load the organization hierarchy.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);
  if (loading && !data) return <PageState kind="loading" title="Mapping the organization" detail="Joining the live Gateway roster to Julie's explicit HR reporting lines." />;
  if (error && !data) return <PageState kind="error" title="Organization unavailable" detail={error} onRetry={load} />;
  if (!data) return null;

  const executive = data.members.find((member) => member.agentId === "main" && member.configured);
  const leads = data.members.filter((member) => member.configured && member.level === "lead");
  const departments = leads.map((lead) => ({
    name: lead.department!,
    lead,
    specialists: data.members.filter((member) => member.configured && member.level === "specialist" && member.reportsTo === lead.agentId),
  })).sort((left, right) => left.name.localeCompare(right.name));
  const unconfigured = data.members.filter((member) => !member.configured);

  const agentCard = (member: AgentOrganizationResponse["members"][number], kind: "executive" | "lead" | "specialist") => (
    <button className={`org-person ${kind}`} key={member.agentId} onClick={() => navigate(`/agents/${encodeURIComponent(member.agentId)}`)}>
      <span className="org-person-avatar">{member.emoji || agentInitials(member.displayName)}</span>
      <span className="org-person-copy">
        <strong>{member.displayName}</strong>
        <small>{member.role || "Role not configured"}</small>
        <code>{member.agentId}</code>
      </span>
      <span className="org-person-open" aria-hidden="true">↗</span>
    </button>
  );

  return (
    <section className="org-view">
      <header className="org-view-head">
        <div><span>Office hierarchy</span><h3>Reporting structure · {data.workspace.name}</h3><p>Roles and reporting lines are Julie HR records; names and models are joined from the live Gateway roster.</p></div>
        <div className="org-view-actions"><span className={data.summary.complete ? "complete" : "partial"}>{data.summary.complete ? "Fully configured" : `${data.summary.unconfigured} unconfigured`}</span><button className="btn-secondary" onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div>
      </header>

      <div className="org-summary">
        <div><strong>{data.summary.rosterMembers}</strong><span>Office members</span></div>
        <div><strong>{data.summary.departments}</strong><span>Departments</span></div>
        <div><strong>{data.summary.leads}</strong><span>Department leads</span></div>
        <div><strong>{data.summary.specialists}</strong><span>Specialists</span></div>
      </div>

      {error && <div className="chat-alert" role="alert">Refresh failed; showing the prior organization snapshot. {error}</div>}

      <div className="org-tree" aria-label="Organization hierarchy">
        <div className="org-tier owner-tier">
          <div className="org-person owner">
            <span className="org-person-avatar">CEO</span>
            <span className="org-person-copy"><strong>{data.owner.displayName}</strong><small>{data.owner.role}</small><code>Owner authority</code></span>
          </div>
        </div>
        <div className="org-vertical-line" aria-hidden="true" />
        <div className="org-tier executive-tier">
          {executive ? agentCard(executive, "executive") : (
            <div className="org-person missing"><span className="org-person-avatar">J</span><span className="org-person-copy"><strong>Julie · main</strong><small>Executive role not configured</small><code>main</code></span></div>
          )}
        </div>
        <div className="org-branch-line" aria-hidden="true" />
        {departments.length > 0 ? (
          <div className="org-departments">
            {departments.map((department) => (
              <article className="org-department" key={department.name}>
                <header><span>{department.name}</span><small>{department.specialists.length + 1} member{department.specialists.length === 0 ? "" : "s"}</small></header>
                {agentCard(department.lead, "lead")}
                <div className="org-team-line" aria-hidden="true" />
                <div className="org-specialists">
                  {department.specialists.map((member) => agentCard(member, "specialist"))}
                  {department.specialists.length === 0 && <div className="org-empty-team">No specialists assigned</div>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="org-empty-departments"><strong>No departments configured yet</strong><span>The live roster is visible below, but Julie will not invent reporting lines.</span></div>
        )}
      </div>

      {unconfigured.length > 0 && (
        <section className="org-unconfigured">
          <header><div><span>Needs placement</span><strong>{unconfigured.length} roster member{unconfigured.length === 1 ? "" : "s"}</strong></div><p>These are real workspace agents with no complete local role/reporting record.</p></header>
          <div>{unconfigured.map((member) => agentCard(member, "specialist"))}</div>
        </section>
      )}
    </section>
  );
}

function AgentsPage({ navigate }: { navigate: (to: string) => void }) {
  const [data, setData] = useState<AgentOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentNotice, setAssignmentNotice] = useState("");
  const [viewMode, setViewMode] = useState<"archive" | "office" | "organization">("archive");

  const loadAgents = useCallback(async (force = false, initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      setData(await api.agentOverview(force));
    } catch (requestError: any) {
      setError(requestError?.message ?? "Could not load the Gateway agent snapshot.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadAgents(false, true); }, [loadAgents]);

  if (loading && !data) return <PageState kind="loading" title="Building agent archive" detail="Reading the live roster, sessions, tools, skills, and 30-day usage from OpenClaw Gateway." />;
  if (error && !data) return <PageState kind="error" title="Agent archive unavailable" detail={error} onRetry={() => loadAgents(true, true)} />;
  if (!data) return <PageState kind="empty" title="No agent snapshot" detail="The active workspace agent snapshot is unavailable." onRetry={() => loadAgents(true, true)} />;

  const modelOptions = [...new Set(data.agents.map((agent) => agent.model.primary).filter((value): value is string => Boolean(value)))].sort();
  const needle = query.trim().toLowerCase();
  const filtered = data.agents
    .filter((agent) => statusFilter === "all" || agent.activity.state === statusFilter)
    .filter((agent) => modelFilter === "all" || agent.model.primary === modelFilter)
    .filter((agent) => !needle || [agent.id, agent.displayName, agent.configuredName, agent.identity.theme, agent.model.primary]
      .some((value) => value?.toLowerCase().includes(needle)))
    .sort((a, b) => Number(b.activity.state === "working") - Number(a.activity.state === "working") || a.displayName.localeCompare(b.displayName));

  const usage = data.summary.usage;
  return (
    <section className="agent-archive-page">
      <header className="agent-archive-head">
        <div>
          <div className="chat-eyebrow">OpenClaw roster</div>
          <h2>Agent Archive · {data.workspace.name}</h2>
          <p>Only agents explicitly assigned to the active Julie workspace, with exact run state, capabilities, and recorded usage.</p>
        </div>
        <div className="agent-head-actions">
          <div className="agent-view-toggle"><button className={viewMode === "archive" ? "active" : ""} onClick={() => setViewMode("archive")}>Archive</button><button className={viewMode === "office" ? "active" : ""} onClick={() => setViewMode("office")}>Office</button><button className={viewMode === "organization" ? "active" : ""} onClick={() => setViewMode("organization")}>Hierarchy</button></div>
          <span className="agent-live-source"><span className="hv-dot on" /> Gateway snapshot · {new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          <button className="btn-secondary" onClick={() => loadAgents(true)} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh live data"}</button>
          <button className="btn-secondary" onClick={() => setAssignmentOpen(true)}>Manage roster</button>
          <button className="btn agent-onboard-button" onClick={() => navigate("/agents/new")}>＋ Onboard agent</button>
        </div>
      </header>

      <div className="agent-summary-grid">
        <div className="agent-summary-card"><span>Assigned here</span><strong>{data.summary.configuredAgents}</strong><small>of {data.summary.gatewayRosterTotal} Gateway agents</small></div>
        <div className="agent-summary-card working"><span>Working now</span><strong>{data.summary.workingAgents}</strong><small>Exact active runs</small></div>
        <div className="agent-summary-card"><span>Visible sessions</span><strong>{data.summary.visibleSessions}</strong><small>{data.summary.sessionSnapshotComplete ? "Complete snapshot" : "Partial snapshot"}</small></div>
        <div className="agent-summary-card"><span>30-day usage</span><strong>{usage.state === "pending" ? "Preparing" : formatCount(usage.totalTokens)}</strong><small>{usage.state === "unavailable" ? "Unavailable" : `${formatUsd(usage.totalCost)} recorded / estimated`}</small></div>
      </div>

      {(usage.models?.length ?? 0) > 0 && (
        <div className="agent-model-strip">
          <div className="agent-model-strip-label"><span>30-day model usage</span><small>Gateway-reported · all agents</small></div>
          {usage.models!.slice(0, 4).map((model) => (
            <div className="agent-model-strip-item" key={`${model.provider}-${model.model}`} title={`${model.input.toLocaleString()} input · ${model.output.toLocaleString()} output · ${model.cacheRead.toLocaleString()} cache read`}>
              <strong>{model.model}</strong><span>{formatCount(model.totalTokens)} tokens · {model.calls} calls · {formatUsd(model.totalCost)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="agent-workspace-context">
        <div><span>Workspace chats</span><strong>{data.workspaceContext.conversations}</strong><small>SQLite-scoped conversations</small></div>
        <div><span>Workspace tasks</span><strong>{data.workspaceContext.tasks.open}/{data.workspaceContext.tasks.total}</strong><small>open / total</small></div>
        <div><span>Shared agents</span><strong>{data.workspaceContext.policies.sharedAgents}</strong><small>explicit multi-workspace membership</small></div>
        <div className="unavailable"><span>Project access</span><strong>Not configured</strong><small>awaiting project registry</small></div>
      </div>

      {error && <div className="chat-alert" role="alert">Refresh failed; showing the previous snapshot. {error}</div>}
      {assignmentNotice && <div className="agent-update-notice" role="status">{assignmentNotice}</div>}
      {data.partialErrors.length > 0 && (
        <div className="agent-partial-note" role="status">Some Gateway reads were unavailable ({data.partialErrors.length}); affected fields are shown as unavailable rather than estimated.</div>
      )}

      {viewMode === "office" && <AgentOfficeMvp agents={data.agents} workspace={data.workspace} navigate={navigate} />}
      {viewMode === "organization" && <AgentOrganizationView workspaceId={data.workspace.id} navigate={navigate} />}
      {viewMode === "archive" && <>
      <div className="agent-filterbar">
        <label className="agent-search">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search identity, ID, theme, or model" aria-label="Search agents" />
        </label>
        <label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All states</option>
          <option value="working">Working</option>
          <option value="no_active_run">No active run</option>
          <option value="no_sessions">No visible sessions</option>
          <option value="unknown">Unknown</option>
        </select></label>
        <label><span>Primary model</span><select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}>
          <option value="all">All models</option>
          {modelOptions.map((model) => <option value={model} key={model}>{model}</option>)}
        </select></label>
        <div className="agent-result-count">{filtered.length} of {data.agents.length}</div>
      </div>

      {filtered.length === 0 ? (
        <div className="agent-no-results"><strong>{data.agents.length === 0 ? `No agents assigned to ${data.workspace.name}` : "No matching agents"}</strong><span>{data.agents.length === 0 ? `${data.summary.unassignedAgents} Gateway agents are currently unassigned. Use Manage roster to add explicit membership.` : "Change the search or filters to restore the workspace roster."}</span>{data.agents.length === 0 && <button className="btn" onClick={() => setAssignmentOpen(true)}>Manage workspace roster</button>}</div>
      ) : (
        <div className="agent-archive-grid">
          {filtered.map((agent) => {
            const state = agentStateCopy(agent.activity.state);
            const current = agent.activity.currentSession;
            const toolState = agent.capabilities.tools;
            const skillState = agent.capabilities.skills;
            return (
              <article className={`agent-archive-card ${agent.activity.state}`} key={agent.id}>
                <div className="agent-card-top">
                  <AgentAvatar agent={agent} />
                  <div className="agent-card-identity">
                    <div className="agent-name-line"><h3>{agent.displayName}</h3>{agent.isDefault && <span>Primary</span>}</div>
                    <code>{agent.id}</code>
                  </div>
                  <div className={`agent-run-state ${agent.activity.state}`} title={state.detail}><i />{state.label}</div>
                </div>

                <p className="agent-theme">{agent.identity.theme || "No identity theme reported by the Gateway."}</p>

                <dl className="agent-facts">
                  <div><dt>Julie role</dt><dd className={agent.role ? "" : "unavailable"}>{agent.role || "Not configured"}</dd></div>
                  <div><dt>Primary model</dt><dd title={agent.model.primary || "No model reported"}>{agent.model.primary || "Not reported"}</dd></div>
                  <div><dt>Runtime</dt><dd>{agent.runtime.id || "Not reported"}</dd></div>
                  <div><dt>Permission</dt><dd>{agent.permissionMode || "Not reported"}</dd></div>
                </dl>

                <div className="agent-current-work">
                  <div className="agent-current-head"><span>{current?.hasActiveRun ? "Current session" : "Latest visible session"}</span><small>{relativeAgentTime(current?.lastActivityAt ?? agent.activity.latestActivityAt)}</small></div>
                  <strong>{current?.displayName || "No visible session"}</strong>
                  <p>{current ? `${current.status || "Status not reported"} · ${current.model || "Model not reported"}` : state.detail}</p>
                  <div className="agent-task-link"><span>Current assigned task</span><strong>{agent.activity.currentTask ? `#${agent.activity.currentTask.id} · ${agent.activity.currentTask.title}` : "None assigned"}</strong></div>
                </div>

                <div className="agent-most-used-model"><span>Most used · 30d</span><strong title={agent.usage.models?.[0]?.model}>{agent.usage.models?.[0]?.model || (agent.usage.state === "ready" ? "No model usage reported" : "Usage unavailable")}</strong></div>

                <div className="agent-stat-grid">
                  <div><span>Sessions</span><strong>{agent.activity.visibleSessions}</strong><small>{agent.activity.activeSessions} active</small></div>
                  <div><span>Tokens · 30d</span><strong>{agent.usage.state === "pending" ? "…" : formatCount(agent.usage.totalTokens)}</strong><small>{agent.usage.state === "ready" ? formatUsd(agent.usage.totalCost) : agent.usage.state.replace("_", " ")}</small></div>
                  <div><span>Tools</span><strong>{formatCount(toolState.total)}</strong><small>{toolState.state === "ready" ? `${toolState.groups} groups` : "Unavailable"}</small></div>
                  <div><span>Skills</span><strong>{skillState.state === "ready" ? `${skillState.eligible}/${skillState.total}` : "—"}</strong><small>{skillState.state === "ready" ? "eligible" : "Unavailable"}</small></div>
                </div>

                <footer className="agent-card-footer">
                  <span>{agent.hr?.workspaceName ? `${agent.hr.workspaceName} · ` : ""}{agent.model.fallbacks.length} model {agent.model.fallbacks.length === 1 ? "fallback" : "fallbacks"} · {agent.workspaceGit ? "Git workspace" : "Workspace Git not reported"}</span>
                  <button onClick={() => navigate(`/agents/${encodeURIComponent(agent.id)}`)}>Open profile →</button>
                </footer>
              </article>
            );
          })}
        </div>
      )}
      </>}
      {assignmentOpen && <AgentAssignmentDialog workspace={data.workspace} onClose={() => setAssignmentOpen(false)} onSaved={(result) => {
        setAssignmentOpen(false);
        setAssignmentNotice(`${result.summary.assigned} agents are now assigned to ${result.workspace.name}; ${result.summary.shared} are explicitly shared across workspaces.`);
        loadAgents(true);
      }} />}
    </section>
  );
}

const ONBOARDING_STEPS = ["Identity", "Assignment", "Model", "Capabilities", "Review"] as const;

function onboardingIdPreview(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "pending-name";
}

function AgentOnboardingPage({ navigate }: { navigate: (to: string) => void }) {
  const [options, setOptions] = useState<AgentOnboardingOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState(0);
  const [roleChoice, setRoleChoice] = useState("researcher");
  const [customRole, setCustomRole] = useState("");
  const [toolSearch, setToolSearch] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.createAgent>> | null>(null);
  const [form, setForm] = useState<AgentOnboardingInput>({
    name: "",
    role: "Researcher",
    personality: "",
    emoji: "🔎",
    model: "",
    scheduleMode: "manual",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    workspaceId: null,
    requestedTools: [],
    requestedSkills: [],
    confirmed: false,
  });

  const loadOptions = useCallback(async (refresh = false) => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await api.agentOnboardingOptions(refresh);
      setOptions(data);
      setForm((current) => ({
        ...current,
        model: current.model || data.defaultModel || data.models.find((model) => model.available)?.id || "",
        workspaceId: current.workspaceId ?? data.workspaces[0]?.id ?? null,
      }));
    } catch (requestError: any) {
      setLoadError(requestError?.message ?? "Could not load onboarding options.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  if (loading && !options) return <PageState kind="loading" title="Opening HR onboarding" detail="Reading live models, tools, skills, agent IDs, and Julie workspaces." />;
  if (loadError && !options) return <PageState kind="error" title="Onboarding unavailable" detail={loadError} onRetry={() => loadOptions(true)} />;
  if (!options) return null;

  const selectedRole = roleChoice === "custom" ? customRole.trim() : options.roles.find((role) => role.id === roleChoice)?.label || "";
  const selectedModel = options.models.find((model) => model.id === form.model);
  const selectedWorkspace = options.workspaces.find((workspace) => workspace.id === form.workspaceId);
  const selectedSchedule = options.schedules.find((schedule) => schedule.id === form.scheduleMode);
  const toolNeedle = toolSearch.trim().toLowerCase();
  const skillNeedle = skillSearch.trim().toLowerCase();
  const visibleTools = options.tools.filter((tool) => !toolNeedle || [tool.id, tool.name, tool.group, tool.description].some((value) => value?.toLowerCase().includes(toolNeedle)));
  const visibleSkills = options.skills.filter((skill) => !skillNeedle || [skill.id, skill.name, skill.description].some((value) => value?.toLowerCase().includes(skillNeedle)));

  const update = <K extends keyof AgentOnboardingInput>(key: K, value: AgentOnboardingInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const toggleRequest = (key: "requestedTools" | "requestedSkills", id: string) => {
    setForm((current) => {
      const values = current[key];
      return { ...current, [key]: values.includes(id) ? values.filter((item) => item !== id) : values.length < 30 ? [...values, id] : values };
    });
  };

  const validateStep = (): string => {
    if (step === 0) {
      if (!form.name.trim()) return "Enter an agent name.";
      if (!selectedRole) return "Select or enter a role.";
      if (options.existingAgentIds.includes(onboardingIdPreview(form.name))) return "An agent with this canonical ID already exists.";
    }
    if (step === 1 && !form.timezone.trim()) return "Enter an IANA timezone.";
    if (step === 2 && (!selectedModel || !selectedModel.available)) return "Choose a model currently reported available by the Gateway catalog.";
    if (step === 4 && !form.confirmed) return "Confirm the reviewed creation plan.";
    return "";
  };

  const next = () => {
    const error = validateStep();
    if (error) { setFormError(error); return; }
    setFormError("");
    setStep((current) => Math.min(ONBOARDING_STEPS.length - 1, current + 1));
  };

  const submit = async () => {
    const error = validateStep();
    if (error || submitting) { setFormError(error); return; }
    setSubmitting(true);
    setFormError("");
    try {
      setResult(await api.createAgent({ ...form, role: selectedRole }));
    } catch (requestError: any) {
      setFormError(requestError?.message ?? "The Gateway did not create this agent.");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) return (
    <section className="onboarding-result">
      <div className="onboarding-result-orb" aria-hidden="true">{form.emoji || "◇"}</div>
      <div className="chat-eyebrow">Onboarding complete</div>
      <h2>{result.agent.name}</h2>
      <code>{result.agent.id}</code>
      <p>The Gateway confirmed agent creation. Julie recorded the reviewed HR plan and attempted the guarded SOUL.md write.</p>
      <div className="onboarding-receipts">
        <div className="ok"><span>Gateway agent</span><strong>Created</strong></div>
        <div className={result.applied.profileSaved ? "ok" : "warn"}><span>Julie HR profile</span><strong>{result.applied.profileSaved ? "Saved" : "Needs attention"}</strong></div>
        <div className={result.applied.soulSaved ? "ok" : "warn"}><span>SOUL.md</span><strong>{result.applied.soulSaved ? "Saved with hash guard" : "Needs attention"}</strong></div>
        <div><span>Gateway capability policy</span><strong>Unchanged</strong></div>
      </div>
      {result.warnings.length > 0 && <div className="agent-partial-note">{result.warnings.join(" ")}</div>}
      <div className="coming-soon-actions">
        <button className="btn" onClick={() => navigate(`/agents/${encodeURIComponent(result.agent.id)}`)}>Open agent profile</button>
        <button className="btn-secondary" onClick={() => navigate("/agents")}>Agent archive</button>
      </div>
    </section>
  );

  return (
    <section className="agent-onboarding-page">
      <header className="onboarding-head">
        <button className="agent-back" onClick={() => navigate("/agents")}>← Agent archive</button>
        <div className="onboarding-title-row">
          <div><div className="chat-eyebrow">HR Department</div><h2>Agent onboarding</h2><p>Create a real OpenClaw agent and record Julie-owned assignment context.</p></div>
          <span><i className="hv-dot on" /> agents.create available</span>
        </div>
      </header>

      <div className="onboarding-stepper">
        {ONBOARDING_STEPS.map((label, index) => <button key={label} className={`${index === step ? "active" : ""}${index < step ? " complete" : ""}`} onClick={() => index < step && setStep(index)}><i>{index < step ? "✓" : index + 1}</i><span>{label}</span></button>)}
      </div>

      <div className="onboarding-shell">
        <aside className="onboarding-brief">
          <div className="onboarding-avatar-preview"><span>{form.emoji || "◇"}</span><i /></div>
          <h3>{form.name || "New teammate"}</h3>
          <code>{onboardingIdPreview(form.name)}</code>
          <p>{selectedRole || "Choose a role"}</p>
          <dl>
            <div><dt>Model</dt><dd>{selectedModel?.name || "Not selected"}</dd></div>
            <div><dt>Workspace</dt><dd>{selectedWorkspace?.name || "Unassigned"}</dd></div>
            <div><dt>Schedule</dt><dd>{selectedSchedule?.label || "Not selected"}</dd></div>
            <div><dt>Requests</dt><dd>{form.requestedTools.length} tools · {form.requestedSkills.length} skills</dd></div>
          </dl>
        </aside>

        <div className="onboarding-form-card">
          {step === 0 && <div className="onboarding-step-content">
            <div className="onboarding-step-copy"><span>01 · Identity</span><h3>Who is joining the team?</h3><p>Name and emoji are applied by OpenClaw. Role and personality become Julie HR context and an owner-reviewed SOUL.md.</p></div>
            <div className="onboarding-two-col">
              <label><span>Agent name</span><input autoFocus maxLength={100} value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Product Researcher" /></label>
              <label><span>Visual marker</span><input maxLength={20} value={form.emoji} onChange={(event) => update("emoji", event.target.value)} placeholder="◇" /></label>
            </div>
            <label><span>Julie role</span><select value={roleChoice} onChange={(event) => setRoleChoice(event.target.value)}>{options.roles.map((role) => <option value={role.id} key={role.id}>{role.label}</option>)}</select></label>
            {roleChoice === "custom" && <label><span>Custom role title</span><input maxLength={100} value={customRole} onChange={(event) => setCustomRole(event.target.value)} placeholder="e.g. Product Strategist" /></label>}
            <div className="role-description">{options.roles.find((role) => role.id === roleChoice)?.description}</div>
            <label><span>Personality & working style</span><textarea maxLength={2000} rows={5} value={form.personality} onChange={(event) => update("personality", event.target.value)} placeholder="Describe communication style, priorities, and how this agent should approach work. Never enter credentials." /></label>
          </div>}

          {step === 1 && <div className="onboarding-step-content">
            <div className="onboarding-step-copy"><span>02 · Assignment</span><h3>Where and when does this agent belong?</h3><p>These are Julie-owned assignment facts. They do not grant autonomous execution or change OpenClaw routing.</p></div>
            <label><span>Julie workspace</span><select value={form.workspaceId ?? ""} onChange={(event) => update("workspaceId", event.target.value ? Number(event.target.value) : null)}><option value="">Unassigned</option>{options.workspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.name}</option>)}</select></label>
            <div className="onboarding-choice-grid">{options.schedules.map((schedule) => <button key={schedule.id} className={form.scheduleMode === schedule.id ? "selected" : ""} onClick={() => update("scheduleMode", schedule.id)}><strong>{schedule.label}</strong><span>{schedule.description}</span></button>)}</div>
            <label><span>IANA timezone</span><input value={form.timezone} onChange={(event) => update("timezone", event.target.value)} placeholder="UTC" /></label>
            <div className="onboarding-policy-note">Schedule is recorded context only. Automation enforcement is tracked separately and is not implied here.</div>
          </div>}

          {step === 2 && <div className="onboarding-step-content">
            <div className="onboarding-step-copy"><span>03 · Model</span><h3>Select the primary model</h3><p>Only models currently returned by the configured Gateway catalog can be selected. Catalog availability is not a live reachability probe.</p></div>
            <div className="onboarding-model-list">{options.models.filter((model) => model.available).map((model) => <button key={model.id} className={form.model === model.id ? "selected" : ""} onClick={() => update("model", model.id)}><div><strong>{model.name}</strong><code>{model.id}</code></div><span>{model.contextWindow ? `${formatCount(model.contextWindow)} context` : "Context not reported"}{model.reasoning ? " · reasoning" : ""}</span></button>)}</div>
          </div>}

          {step === 3 && <div className="onboarding-step-content capabilities-step">
            <div className="onboarding-step-copy"><span>04 · Capability requests</span><h3>Record the onboarding plan</h3><p>{options.policyNote}</p></div>
            <div className="onboarding-cap-tabs">
              <section><div className="onboarding-cap-head"><div><h4>Tools</h4><span>{form.requestedTools.length} requested</span></div><input value={toolSearch} onChange={(event) => setToolSearch(event.target.value)} placeholder="Search tools" /></div><div className="onboarding-check-list">{visibleTools.map((tool) => <label key={tool.id}><input type="checkbox" checked={form.requestedTools.includes(tool.id)} onChange={() => toggleRequest("requestedTools", tool.id)} /><span><strong>{tool.name}</strong><small>{tool.group || tool.id}</small></span></label>)}</div></section>
              <section><div className="onboarding-cap-head"><div><h4>Skills</h4><span>{form.requestedSkills.length} requested</span></div><input value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)} placeholder="Search skills" /></div><div className="onboarding-check-list">{visibleSkills.map((skill) => <label className={!skill.eligible ? "disabled" : ""} key={skill.id} title={skill.reason || "Eligible"}><input type="checkbox" disabled={!skill.eligible} checked={form.requestedSkills.includes(skill.id)} onChange={() => toggleRequest("requestedSkills", skill.id)} /><span><strong>{skill.emoji} {skill.name}</strong><small>{skill.eligible ? "Eligible" : skill.reason}</small></span></label>)}</div></section>
            </div>
            <div className="onboarding-policy-note warn">Requests are stored for owner review. Gateway tool and skill policy remains unchanged after creation.</div>
          </div>}

          {step === 4 && <div className="onboarding-step-content review-step">
            <div className="onboarding-step-copy"><span>05 · Review</span><h3>Approve the creation plan</h3><p>One confirmed action creates the OpenClaw agent, records Julie HR metadata, and writes the reviewed SOUL with a hash precondition.</p></div>
            <div className="onboarding-review-grid">
              <section><h4>Applied to OpenClaw</h4><div><span>Name / canonical ID</span><strong>{form.name} / {onboardingIdPreview(form.name)}</strong></div><div><span>Primary model</span><strong>{form.model}</strong></div><div><span>Emoji</span><strong>{form.emoji || "None"}</strong></div><div><span>SOUL.md</span><strong>Guarded write after creation</strong></div></section>
              <section><h4>Recorded by Julie</h4><div><span>Role</span><strong>{selectedRole}</strong></div><div><span>Workspace</span><strong>{selectedWorkspace?.name || "Unassigned"}</strong></div><div><span>Schedule</span><strong>{selectedSchedule?.label} · {form.timezone}</strong></div><div><span>Capability requests</span><strong>{form.requestedTools.length} tools · {form.requestedSkills.length} skills</strong></div></section>
            </div>
            <div className="onboarding-review-warning"><strong>Not changed by this action</strong><span>Gateway tool/skill permissions, autonomous schedules, channel routing, credentials, and spending authority.</span></div>
            <label className="onboarding-confirm"><input type="checkbox" checked={form.confirmed} onChange={(event) => update("confirmed", event.target.checked)} /><span>I reviewed this plan and authorize creation of the real Gateway agent.</span></label>
          </div>}

          {formError && <div className="chat-alert" role="alert">{formError}</div>}
          <footer className="onboarding-actions">
            <button className="btn-secondary" onClick={() => step === 0 ? navigate("/agents") : (setFormError(""), setStep((current) => current - 1))}>{step === 0 ? "Cancel" : "Back"}</button>
            <span>Step {step + 1} of {ONBOARDING_STEPS.length}</span>
            {step < ONBOARDING_STEPS.length - 1
              ? <button className="btn" onClick={next}>Continue</button>
              : <button className="btn" onClick={submit} disabled={submitting || !form.confirmed}>{submitting ? "Creating agent…" : "Create real agent"}</button>}
          </footer>
        </div>
      </div>
    </section>
  );
}

type AgentDetailTab = "overview" | "activity" | "chat" | "capabilities";

function detailTabFromHash(): AgentDetailTab {
  const value = window.location.hash.replace(/^#/, "");
  return value === "activity" || value === "chat" || value === "capabilities" ? value : "overview";
}

function AgentDetailAvatar({ agent }: { agent: AgentDetailResponse["agent"] }) {
  const [fallbackFailed, setFallbackFailed] = useState(false);
  if (agent.identity.avatar) return <img className="agent-detail-avatar" src={agent.identity.avatar} alt="" />;
  const initials = agent.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || agent.id.slice(0, 2).toUpperCase();
  if (!fallbackFailed) return <img className="agent-detail-avatar avatar-svg-fallback" src={api.agentAvatarFallbackUrl(agent.id)} alt="" onError={() => setFallbackFailed(true)} />;
  return <div className="agent-detail-avatar fallback" aria-hidden="true">
    <span>{agent.identity.emoji || agent.identity.effectiveAvatarLabel || initials}</span>
    <i className="avatar-scan" /><i className="avatar-base" />
  </div>;
}

function normalizedAvatarNotes(value: string): string {
  return value.replace(/[\0\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}

function AgentAvatarStudioDialog({ agent, onClose, onApplied }: {
  agent: AgentDetailResponse["agent"];
  onClose: () => void;
  onApplied: (detail: AgentDetailResponse, notice: string) => void;
}) {
  const [studio, setStudio] = useState<AgentAvatarStudioResponse | null>(null);
  const [preview, setPreview] = useState<AgentAvatarPreview | null>(null);
  const [direction, setDirection] = useState<AgentAvatarDirection>("synthetic_hologram");
  const [ownerNotes, setOwnerNotes] = useState("");
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<AgentAvatarAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [costAcknowledged, setCostAcknowledged] = useState(false);
  const [generationConfirmed, setGenerationConfirmed] = useState(false);
  const [applyConfirmed, setApplyConfirmed] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [remotePreviewUrl, setRemotePreviewUrl] = useState("");
  const [urlApplyConfirmed, setUrlApplyConfirmed] = useState(false);
  const [importingImage, setImportingImage] = useState(false);
  const [modelUrl, setModelUrl] = useState("");
  const [modelBusy, setModelBusy] = useState(false);
  const [resultNote, setResultNote] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      const result = await api.agentAvatarStudio(agent.id, refresh);
      setStudio(result);
      setPreview(result.preview);
      setDirection(result.preview.direction);
      setOwnerNotes(result.preview.ownerNotes);
      setSelectedAsset(result.assets[0] ?? null);
      const configured = result.providers.filter((provider) => provider.configured);
      const provider = configured[0];
      setProviderId(provider?.id ?? "");
      setModelId(provider?.models.find((model) => model.isDefault)?.id ?? provider?.models[0]?.id ?? "");
    } catch (requestError: any) {
      setError(requestError?.message ?? "Could not read image-generation readiness.");
    } finally {
      setLoading(false);
    }
  }, [agent.id]);

  useEffect(() => { load(); }, [load]);
  const busy = loading || previewing || generating || applying || importingImage || modelBusy;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const configuredProviders = studio?.providers.filter((provider) => provider.configured) ?? [];
  const unavailableProviders = studio?.providers.filter((provider) => !provider.configured) ?? [];
  const selectedProvider = configuredProviders.find((provider) => provider.id === providerId) ?? null;
  const selectedModel = selectedProvider?.models.find((model) => model.id === modelId) ?? null;
  const previewStale = !preview || preview.direction !== direction || preview.ownerNotes !== normalizedAvatarNotes(ownerNotes);
  const previewImage = remotePreviewUrl || selectedAsset?.url || agent.identity.avatar || studio?.fallback.url || api.agentAvatarFallbackUrl(agent.id);

  const changeProvider = (nextId: string) => {
    setProviderId(nextId);
    const provider = configuredProviders.find((entry) => entry.id === nextId);
    setModelId(provider?.models.find((model) => model.isDefault)?.id ?? provider?.models[0]?.id ?? "");
    setCostAcknowledged(false);
    setGenerationConfirmed(false);
  };

  const refreshPreview = async () => {
    if (previewing) return;
    setPreviewing(true);
    setError("");
    setResultNote("");
    try {
      const result = await api.previewAgentAvatar(agent.id, { direction, ownerNotes });
      setPreview(result.preview);
      setOwnerNotes(result.preview.ownerNotes);
      setCostAcknowledged(false);
      setGenerationConfirmed(false);
    } catch (requestError: any) {
      setError(requestError?.message ?? "Could not rebuild the avatar prompt.");
    } finally {
      setPreviewing(false);
    }
  };

  const generate = async () => {
    if (!preview || !selectedProvider || !selectedModel || previewStale || !costAcknowledged || !generationConfirmed || generating) return;
    setGenerating(true);
    setError("");
    setResultNote("One bounded Gateway image-generation call is running. The image will be stored locally but not applied automatically.");
    try {
      const result = await api.generateAgentAvatar(agent.id, {
        direction,
        ownerNotes,
        promptHash: preview.promptHash,
        provider: selectedProvider.id,
        model: selectedModel.id,
        confirmed: true,
        costAcknowledged: true,
      });
      setSelectedAsset(result.asset);
      setStudio((current) => current ? { ...current, assets: [result.asset, ...current.assets.filter((asset) => asset.id !== result.asset.id)] } : current);
      setApplyConfirmed(false);
      setResultNote(`Image stored locally and not yet applied. ${result.disclosure}`);
    } catch (requestError: any) {
      setResultNote("");
      setError(requestError?.message ?? "The Gateway did not return a generated avatar asset.");
    } finally {
      setGenerating(false);
    }
  };

  const apply = async () => {
    if (!selectedAsset || !selectedAsset.canApply || !applyConfirmed || applying) return;
    setApplying(true);
    setError("");
    try {
      const result = await api.applyAgentAvatar(agent.id, selectedAsset.id);
      const detail = await api.agentDetail(agent.id, true);
      onApplied(detail, `Reviewed avatar #${result.asset.id} was applied through OpenClaw and remains stored privately in Julie.`);
    } catch (requestError: any) {
      setError(requestError?.message ?? "The generated image was not applied to the Gateway identity.");
    } finally {
      setApplying(false);
    }
  };

  const importImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || importingImage) return;
    if (!/^image\/(?:png|jpeg|webp)$/i.test(file.type)) { setError("Choose a PNG, JPEG, or WebP image."); return; }
    setImportingImage(true);
    setError("");
    setResultNote("Downscaling the selected image locally; it will be stored but not applied.");
    try {
      const dataUrl = await downscaleImage(file, 512);
      const result = await api.importAgentAvatarImage(agent.id, dataUrl);
      setSelectedAsset(result.asset);
      setRemotePreviewUrl("");
      setStudio((current) => current ? { ...current, assets: [result.asset, ...current.assets.filter((asset) => asset.id !== result.asset.id)] } : current);
      setApplyConfirmed(false);
      setResultNote(result.disclosure);
    } catch (requestError: any) {
      setResultNote("");
      setError(requestError?.message ?? "Could not store the uploaded image.");
    } finally {
      setImportingImage(false);
    }
  };

  const previewRemoteImage = () => {
    try {
      const url = new URL(imageUrl.trim());
      if (url.protocol !== "https:") throw new Error("Use a public HTTPS image URL.");
      setSelectedAsset(null);
      setRemotePreviewUrl(url.toString());
      setUrlApplyConfirmed(false);
      setError("");
      setResultNote("Remote preview is loaded directly by this browser. It has not been fetched, copied, or applied by Julie.");
    } catch (requestError: any) {
      setError(requestError?.message ?? "Use a valid public HTTPS image URL.");
    }
  };

  const applyRemoteImage = async () => {
    if (!remotePreviewUrl || !urlApplyConfirmed || applying) return;
    setApplying(true);
    setError("");
    try {
      const result = await api.applyAgentAvatarUrl(agent.id, remotePreviewUrl);
      const detail = await api.agentDetail(agent.id, true);
      onApplied(detail, `Owner-reviewed HTTPS avatar from ${result.host} was applied. ${result.disclosure}`);
    } catch (requestError: any) {
      setError(requestError?.message ?? "The remote image URL was not applied.");
    } finally {
      setApplying(false);
    }
  };

  const importModel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || modelBusy) return;
    if (!file.name.toLowerCase().endsWith(".glb")) { setError("Choose a GLB 2.0 model file."); return; }
    if (file.size > 8 * 1024 * 1024) { setError("GLB model must be 8 MB or smaller."); return; }
    setModelBusy(true);
    setError("");
    try {
      const result = await api.uploadAgentAvatarModel(agent.id, file);
      setStudio((current) => current ? { ...current, models3d: [result.model, ...current.models3d] } : current);
      setResultNote(result.boundary);
    } catch (requestError: any) {
      setError(requestError?.message ?? "Could not store the GLB model.");
    } finally {
      setModelBusy(false);
    }
  };

  const addModelUrl = async () => {
    if (!modelUrl.trim() || modelBusy) return;
    setModelBusy(true);
    setError("");
    try {
      const result = await api.addAgentAvatarModelUrl(agent.id, modelUrl.trim());
      setStudio((current) => current ? { ...current, models3d: [result.model, ...current.models3d] } : current);
      setModelUrl("");
      setResultNote(result.boundary);
    } catch (requestError: any) {
      setError(requestError?.message ?? "Could not store the GLB URL.");
    } finally {
      setModelBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop avatar-studio-backdrop" onMouseDown={() => !busy && onClose()}>
      <section className="avatar-studio-dialog" role="dialog" aria-modal="true" aria-labelledby="avatar-studio-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="avatar-studio-head">
          <div><div className="chat-eyebrow">Personality-derived avatar pipeline</div><h2 id="avatar-studio-title">Avatar Studio · {agent.displayName}</h2><p>Preview is free. Generation and Gateway application are separate, owner-confirmed actions.</p></div>
          <button className="dialog-close" onClick={onClose} disabled={busy} aria-label="Close">×</button>
        </header>

        {loading && !studio ? <PageState kind="loading" title="Inspecting image readiness" detail="Reading the allowlisted OpenClaw image catalog and safe identity sources." /> : (
          <div className="avatar-studio-body">
            <aside className="avatar-studio-preview">
              <div className="avatar-studio-image-wrap">
                <img src={previewImage} alt={`Avatar preview for ${agent.displayName}`} />
                <span>{remotePreviewUrl ? "Remote URL preview" : selectedAsset ? selectedAsset.applied ? "Applied asset" : "Stored candidate" : agent.identity.avatar ? "Current Gateway avatar" : "Local SVG fallback"}</span>
              </div>
              {studio && <div className="avatar-readiness-card">
                <div><i className={studio.readiness.verifiedUsableProviderCount > 0 ? "ready" : ""} /><span>image_generate</span><strong>{studio.readiness.available ? `${studio.readiness.configuredProviderCount} configured · ${studio.readiness.verifiedUsableProviderCount} verified` : "Unavailable"}</strong></div>
                <p>{studio.readiness.policy}</p>
              </div>}
              {studio && studio.assets.length > 0 && <div className="avatar-asset-history"><span>Local candidates</span><div>{studio.assets.map((asset) => <button key={asset.id} className={selectedAsset?.id === asset.id && !remotePreviewUrl ? "active" : ""} onClick={() => { setSelectedAsset(asset); setRemotePreviewUrl(""); setApplyConfirmed(false); }}><img src={asset.url} alt="" /><i>{asset.applied ? "Applied" : `#${asset.id}`}</i></button>)}</div></div>}
            </aside>

            <div className="avatar-studio-controls">
              <section className="avatar-studio-section">
                <div className="avatar-studio-section-head"><div><span>1 · Visual direction</span><h3>Non-demographic by design</h3></div><b>No billed call</b></div>
                <div className="avatar-direction-grid">{studio?.directions.map((entry) => <button key={entry.id} className={direction === entry.id ? "selected" : ""} onClick={() => { setDirection(entry.id); setGenerationConfirmed(false); }}><strong>{entry.label}</strong><span>{entry.description}</span></button>)}</div>
                <label className="avatar-owner-notes"><span>Explicit visual notes · optional</span><textarea rows={3} maxLength={500} value={ownerNotes} onChange={(event) => { setOwnerNotes(event.target.value); setGenerationConfirmed(false); }} placeholder="Motifs, materials, color accents, or non-human symbols. Never enter credentials." /></label>
                <button className="btn-secondary avatar-preview-button" onClick={refreshPreview} disabled={previewing}>{previewing ? "Rebuilding…" : previewStale ? "Update prompt preview" : "Prompt preview current"}</button>
              </section>

              <section className="avatar-studio-section">
                <div className="avatar-studio-section-head"><div><span>2 · Prompt review</span><h3>Safe source projection</h3></div><b>{preview?.sources.length ?? 0} sources</b></div>
                <textarea className="avatar-prompt-preview" readOnly rows={10} value={preview?.prompt ?? ""} />
                <div className="avatar-source-row">{preview?.sources.map((source) => <span key={source}>{source}</span>)}</div>
                <div className="avatar-guardrail"><strong>Appearance guardrail</strong><span>{preview?.guardrail || "No appearance inference is available."}</span></div>
              </section>

              <section className="avatar-studio-section">
                <div className="avatar-studio-section-head"><div><span>3 · Provider & cost</span><h3>One bounded image</h3></div><b>{selectedModel ? "1 image" : "Unavailable"}</b></div>
                {configuredProviders.length ? <div className="avatar-provider-grid">
                  <label><span>Configured provider</span><select value={providerId} onChange={(event) => changeProvider(event.target.value)}>{configuredProviders.map((provider) => <option value={provider.id} key={provider.id}>{provider.label}{provider.runtimeState === "last_attempt_failed" ? " · last attempt failed" : provider.runtimeState === "generation_succeeded" ? " · verified" : " · unverified"}</option>)}</select></label>
                  <label><span>Model</span><select value={modelId} onChange={(event) => { setModelId(event.target.value); setCostAcknowledged(false); setGenerationConfirmed(false); }}>{selectedProvider?.models.map((model) => <option value={model.id} key={model.id}>{model.id}{model.isDefault ? " · default" : ""}</option>)}</select></label>
                </div> : <div className="detail-empty">No configured image provider is reported by OpenClaw. The SVG fallback remains available without billing.</div>}
                {unavailableProviders.map((provider) => <div className="avatar-provider-unavailable" key={provider.id}><div><strong>{provider.label}</strong><span>{provider.runtimeState.replaceAll("_", " ")}</span></div><p>{provider.unavailableReason || "No image-generation route is available."}</p></div>)}
                {selectedModel && <div className="avatar-cost-disclosure">
                  <div><span>Pre-call estimate</span><strong>Not reported</strong></div>
                  <p>{selectedModel.cost.disclosure}</p>
                  {selectedProvider?.runtimeState === "last_attempt_failed" && <p><strong>Runtime note:</strong> the most recent generation attempt through this provider failed before Julie received an asset.</p>}
                  <small>Bounded request: count 1 · square · 1K/1024 · low quality when supported · no automatic retry by Julie.</small>
                  {selectedModel.cost.pricingUrl && <a href={selectedModel.cost.pricingUrl} target="_blank" rel="noreferrer">Provider pricing reference ↗</a>}
                </div>}
                <label className="avatar-review-check"><input type="checkbox" checked={costAcknowledged} onChange={(event) => setCostAcknowledged(event.target.checked)} /><span>I understand the exact charge is unavailable and this call may consume provider quota or billed usage.</span></label>
                <label className="avatar-review-check"><input type="checkbox" checked={generationConfirmed} onChange={(event) => setGenerationConfirmed(event.target.checked)} /><span>I reviewed the current prompt, provider, and model and authorize exactly one generated image.</span></label>
                <button className="btn avatar-generate-button" onClick={generate} disabled={!selectedModel || previewStale || !costAcknowledged || !generationConfirmed || generating}>{generating ? "Generating one image…" : "Generate one candidate"}</button>
              </section>

              <section className="avatar-studio-section avatar-owner-assets">
                <div className="avatar-studio-section-head"><div><span>4 · Owner-supplied assets</span><h3>Upload, HTTPS image, or GLB model</h3></div><b>No generation call</b></div>
                <div className="avatar-owner-asset-grid">
                  <article>
                    <h4>Upload image</h4><p>PNG, JPEG, or WebP is downscaled to a private 512px JPEG in this browser, then stored as a candidate. It is not applied automatically.</p>
                    <label className="btn-secondary avatar-file-button">{importingImage ? "Importing…" : "Choose image"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={importImage} disabled={importingImage} /></label>
                  </article>
                  <article>
                    <h4>HTTPS image URL</h4><p>Julie does not fetch or verify it. Previewing contacts the remote host from this browser; applying stores the URL in OpenClaw identity.</p>
                    <div className="avatar-url-row"><input value={imageUrl} onChange={(event) => { setImageUrl(event.target.value); setUrlApplyConfirmed(false); }} placeholder="https://…/avatar.png" /><button className="btn-secondary" onClick={previewRemoteImage}>Preview</button></div>
                    {remotePreviewUrl && <><label className="avatar-review-check"><input type="checkbox" checked={urlApplyConfirmed} onChange={(event) => setUrlApplyConfirmed(event.target.checked)} /><span>I reviewed this exact remote image and accept that clients may request its host.</span></label><button className="btn avatar-apply-button" onClick={applyRemoteImage} disabled={!urlApplyConfirmed || applying}>{applying ? "Applying…" : "Apply HTTPS image URL"}</button></>}
                  </article>
                  <article>
                    <h4>3D companion model</h4><p>Store a GLB 2.0 file (max 8 MB) or public HTTPS `.glb` reference. It remains Julie-only: no viewer is configured and OpenClaw cannot use it as the image avatar.</p>
                    <label className="btn-secondary avatar-file-button">{modelBusy ? "Storing…" : "Choose GLB"}<input type="file" accept=".glb,model/gltf-binary" onChange={importModel} disabled={modelBusy} /></label>
                    <div className="avatar-url-row"><input value={modelUrl} onChange={(event) => setModelUrl(event.target.value)} placeholder="https://…/avatar.glb" /><button className="btn-secondary" onClick={addModelUrl} disabled={modelBusy || !modelUrl.trim()}>Store URL</button></div>
                  </article>
                </div>
                {studio && <div className="avatar-model-boundary">{studio.model3dBoundary}</div>}
                {studio && studio.models3d.length > 0 && <div className="avatar-model-list">{studio.models3d.map((model) => <a key={model.id} href={model.url} target={model.sourceType === "https_url" ? "_blank" : undefined} rel="noreferrer" download={model.sourceType === "upload" ? `agent-avatar-${model.id}.glb` : undefined}><strong>GLB #{model.id}</strong><span>{model.sourceType === "upload" ? `${formatCount(model.sizeBytes)} bytes · private file` : "HTTPS reference"}</span><i>Viewer unavailable</i></a>)}</div>}
              </section>

              {selectedAsset && <section className="avatar-studio-section avatar-apply-section">
                <div className="avatar-studio-section-head"><div><span>5 · Owner review</span><h3>Apply stored image candidate</h3></div><b>{selectedAsset.applied ? "Applied" : "Not applied"}</b></div>
                <dl><div><dt>Provider / model</dt><dd>{selectedAsset.provider} / {selectedAsset.model}</dd></div><div><dt>Stored size</dt><dd>{formatCount(selectedAsset.sizeBytes)} bytes</dd></div><div><dt>Reported cost</dt><dd>{selectedAsset.cost.state === "reported" ? formatUsd(selectedAsset.cost.usd) : "Not reported"}</dd></div><div><dt>Gateway limit</dt><dd>{selectedAsset.canApply ? "Within 2 MB" : "Too large to apply"}</dd></div></dl>
                {!selectedAsset.applied && <><label className="avatar-review-check"><input type="checkbox" checked={applyConfirmed} onChange={(event) => setApplyConfirmed(event.target.checked)} disabled={!selectedAsset.canApply} /><span>I reviewed this exact image and authorize applying it through OpenClaw agents.update.</span></label><button className="btn avatar-apply-button" onClick={apply} disabled={!selectedAsset.canApply || !applyConfirmed || applying}>{applying ? "Applying…" : "Apply reviewed avatar"}</button></>}
              </section>}

              {resultNote && <div className="agent-update-notice" role="status">{resultNote}</div>}
              {error && <div className="chat-alert" role="alert">{error}</div>}
            </div>
          </div>
        )}
        <footer className="avatar-studio-footer"><span>Generated files stay private under Julie data. No raw SOUL, credentials, or host paths are sent to this page.</span><button className="btn-secondary" onClick={onClose} disabled={busy}>Close</button></footer>
      </section>
    </div>
  );
}

function EditAgentDialog({ agent, onClose, onSaved }: {
  agent: AgentDetailResponse["agent"];
  onClose: () => void;
  onSaved: (detail: AgentDetailResponse, receipt: AgentUpdateResult) => void;
}) {
  const [options, setOptions] = useState<AgentOnboardingOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toolSearch, setToolSearch] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const [form, setForm] = useState<AgentUpdateInput>({
    name: agent.displayName,
    role: agent.role.value || "",
    personality: agent.hr?.personality || "",
    emoji: agent.identity.emoji || agent.identity.effectiveAvatarLabel || "◇",
    model: agent.model.primary || "",
    scheduleMode: agent.hr?.scheduleMode || "manual",
    timezone: agent.hr?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    workspaceIds: agent.workspace.julieAssignments.map((workspace) => workspace.id),
    requestedTools: agent.hr?.requestedTools || [],
    requestedSkills: agent.hr?.requestedSkills || [],
    updateSoul: true,
    confirmed: false,
  });

  useEffect(() => {
    api.agentOnboardingOptions().then(setOptions).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  const update = <K extends keyof AgentUpdateInput>(key: K, value: AgentUpdateInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const toggle = (key: "requestedTools" | "requestedSkills", id: string) => setForm((current) => {
    const rows = current[key];
    return { ...current, [key]: rows.includes(id) ? rows.filter((value) => value !== id) : rows.length < 30 ? [...rows, id] : rows };
  });
  const save = async () => {
    if (!form.name.trim() || !form.role.trim() || !form.model || !form.confirmed || saving) {
      setError(!form.confirmed ? "Review confirmation is required." : "Name, Julie role, and model are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const receipt = await api.updateAgent(agent.id, form);
      const detail = await api.agentDetail(agent.id, true);
      onSaved(detail, receipt);
    } catch (requestError: any) {
      setError(requestError?.message ?? "Agent update failed.");
    } finally {
      setSaving(false);
    }
  };

  const toolNeedle = toolSearch.trim().toLowerCase();
  const skillNeedle = skillSearch.trim().toLowerCase();
  const tools = (options?.tools ?? []).filter((tool) => !toolNeedle || [tool.id, tool.name, tool.group].some((value) => value?.toLowerCase().includes(toolNeedle)));
  const skills = (options?.skills ?? []).filter((skill) => !skillNeedle || [skill.id, skill.name].some((value) => value?.toLowerCase().includes(skillNeedle)));

  return (
    <div className="dialog-backdrop agent-edit-backdrop" onMouseDown={() => !saving && onClose()}>
      <section className="agent-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="agent-edit-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="agent-edit-head">
          <div><div className="chat-eyebrow">Owner edit</div><h2 id="agent-edit-title">Update {agent.displayName}</h2><p>Gateway-supported fields and Julie-owned HR context are saved to their real sources.</p></div>
          <button className="dialog-close" onClick={onClose} disabled={saving} aria-label="Close">×</button>
        </header>
        {loading ? <PageState kind="loading" title="Loading editable options" detail="Reading live models, tools, skills, and workspaces." /> : (
          <div className="agent-edit-body">
            <section className="agent-edit-section">
              <div className="agent-edit-section-title"><span>OpenClaw identity & model</span><small>Applied with agents.update</small></div>
              <div className="agent-edit-grid three">
                <label><span>Display name</span><input value={form.name} maxLength={100} onChange={(event) => update("name", event.target.value)} /></label>
                <label><span>Emoji</span><input value={form.emoji} maxLength={20} onChange={(event) => update("emoji", event.target.value)} /></label>
                <label><span>Primary model</span><select value={form.model} onChange={(event) => update("model", event.target.value)}>{options?.models.filter((model) => model.available).map((model) => <option value={model.id} key={model.id}>{model.name} · {model.provider}</option>)}</select></label>
              </div>
              <div className="agent-edit-id-note">Stable agent ID: <code>{agent.id}</code> · editing the display name does not rename the ID.</div>
            </section>

            <section className="agent-edit-section">
              <div className="agent-edit-section-title"><span>Julie HR profile</span><small>Stored locally and shown in workspace views</small></div>
              <div className="agent-edit-grid three">
                <label><span>Julie role</span><input value={form.role} maxLength={100} onChange={(event) => update("role", event.target.value)} placeholder="e.g. Research Lead" /></label>
                <label><span>Schedule</span><select value={form.scheduleMode} onChange={(event) => update("scheduleMode", event.target.value as AgentUpdateInput["scheduleMode"])}>{options?.schedules.map((schedule) => <option value={schedule.id} key={schedule.id}>{schedule.label}</option>)}</select></label>
                <label><span>Timezone</span><input value={form.timezone} onChange={(event) => update("timezone", event.target.value)} /></label>
              </div>
              <div className="agent-edit-workspaces"><span>Julie workspace assignments</span><div>{options?.workspaces.map((workspace) => <label key={workspace.id}><input type="checkbox" checked={form.workspaceIds.includes(workspace.id)} onChange={() => update("workspaceIds", form.workspaceIds.includes(workspace.id) ? form.workspaceIds.filter((id) => id !== workspace.id) : [...form.workspaceIds, workspace.id])} /><b>{workspace.name}</b></label>)}</div><small>Assigning more than one workspace explicitly marks this agent as shared.</small></div>
              <label><span>Personality & working style</span><textarea rows={4} maxLength={2000} value={form.personality} onChange={(event) => update("personality", event.target.value)} placeholder="Owner-authored working style. Never enter credentials." /></label>
              <label className="agent-edit-soul-toggle"><input type="checkbox" checked={form.updateSoul} onChange={(event) => update("updateSoul", event.target.checked)} /><span>Append or replace Julie's marked HR section in SOUL.md using a hash guard. Existing non-Julie content is preserved.</span></label>
            </section>

            <section className="agent-edit-section">
              <div className="agent-edit-section-title"><span>Capability requests</span><small>Requests only · Gateway policy unchanged</small></div>
              <div className="agent-edit-cap-grid">
                <div><input value={toolSearch} onChange={(event) => setToolSearch(event.target.value)} placeholder={`Filter tools · ${form.requestedTools.length} selected`} /><div className="onboarding-check-list">{tools.map((tool) => <label key={tool.id}><input type="checkbox" checked={form.requestedTools.includes(tool.id)} onChange={() => toggle("requestedTools", tool.id)} /><span><strong>{tool.name}</strong><small>{tool.group || tool.id}</small></span></label>)}</div></div>
                <div><input value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)} placeholder={`Filter skills · ${form.requestedSkills.length} selected`} /><div className="onboarding-check-list">{skills.map((skill) => <label key={skill.id} className={!skill.eligible ? "disabled" : ""}><input type="checkbox" disabled={!skill.eligible} checked={form.requestedSkills.includes(skill.id)} onChange={() => toggle("requestedSkills", skill.id)} /><span><strong>{skill.emoji} {skill.name}</strong><small>{skill.eligible ? "Eligible" : skill.reason}</small></span></label>)}</div></div>
              </div>
            </section>

            <label className="onboarding-confirm agent-edit-confirm"><input type="checkbox" checked={form.confirmed} onChange={(event) => update("confirmed", event.target.checked)} /><span>I reviewed these changes and authorize the real Gateway identity/model update plus Julie HR changes.</span></label>
            {error && <div className="chat-alert" role="alert">{error}</div>}
          </div>
        )}
        <footer className="agent-edit-actions"><span>Tool/skill policy is not changed by this form.</span><div><button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button className="btn" onClick={save} disabled={loading || saving || !form.confirmed}>{saving ? "Applying…" : "Apply changes"}</button></div></footer>
      </section>
    </div>
  );
}

function AgentDetailPage({ agentId, navigate }: { agentId: string; navigate: (to: string) => void }) {
  const [data, setData] = useState<AgentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<AgentDetailTab>(() => detailTabFromHash());
  const [toolQuery, setToolQuery] = useState("");
  const [skillQuery, setSkillQuery] = useState("");
  const [skillFilter, setSkillFilter] = useState<"all" | "eligible" | "unavailable">("all");
  const [editOpen, setEditOpen] = useState(false);
  const [avatarStudioOpen, setAvatarStudioOpen] = useState(false);
  const [updateNotice, setUpdateNotice] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null | undefined>(undefined);
  const [agentMessages, setAgentMessages] = useState<AgentChatMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyTruncated, setHistoryTruncated] = useState(false);
  const [agentChatInput, setAgentChatInput] = useState("");
  const [agentChatSending, setAgentChatSending] = useState(false);
  const [agentChatStatus, setAgentChatStatus] = useState("");
  const agentChatLogRef = useRef<HTMLDivElement>(null);
  const historyRequestRef = useRef(0);

  const load = useCallback(async (force = false, initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      setData(await api.agentDetail(agentId, force));
    } catch (requestError: any) {
      setError(requestError?.status === 404 ? "The Gateway does not report this agent." : requestError?.message ?? "Could not load this agent.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [agentId]);

  useEffect(() => { load(false, true); }, [load]);
  useEffect(() => {
    const onHash = () => setTab(detailTabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!data || selectedSessionId !== undefined) return;
    const first = data.agent.activity.sessions.find((session) => session.sessionId)?.sessionId ?? null;
    setSelectedSessionId(first);
  }, [data, selectedSessionId]);

  const fetchAgentHistory = useCallback(async (sessionId: string) => {
    const requestId = ++historyRequestRef.current;
    setHistoryLoading(true);
    setHistoryError("");
    setAgentChatStatus("");
    try {
      const history = await api.agentHistory(agentId, sessionId);
      if (historyRequestRef.current !== requestId) return;
      setAgentMessages(history.messages);
      setHistoryTruncated(history.truncated);
    } catch (requestError: any) {
      if (historyRequestRef.current === requestId) {
        setAgentMessages([]);
        setHistoryError(requestError?.message ?? "Could not load this session history.");
      }
    } finally {
      if (historyRequestRef.current === requestId) setHistoryLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    if (tab !== "chat" || selectedSessionId === undefined) return;
    if (selectedSessionId === null) {
      historyRequestRef.current += 1;
      setAgentMessages([]);
      setHistoryError("");
      setHistoryTruncated(false);
      setHistoryLoading(false);
      setAgentChatStatus("");
      return;
    }
    fetchAgentHistory(selectedSessionId);
  }, [fetchAgentHistory, selectedSessionId, tab]);

  useEffect(() => {
    agentChatLogRef.current?.scrollTo({ top: agentChatLogRef.current.scrollHeight, behavior: "smooth" });
  }, [agentMessages, agentChatSending]);

  const chooseTab = (next: AgentDetailTab) => {
    setTab(next);
    window.history.replaceState({}, "", `${window.location.pathname}#${next}`);
  };

  const sendToAgent = async () => {
    const text = agentChatInput.trim();
    if (!text || agentChatSending || selectedSessionId === undefined) return;
    setAgentChatSending(true);
    setHistoryError("");
    setAgentChatStatus(selectedSessionId ? "OpenClaw accepted the request; waiting for the final reply…" : "Creating an agent-qualified session; waiting for the final reply…");
    setAgentChatInput("");
    try {
      const result = await api.sendAgentMessage(agentId, text, selectedSessionId);
      setAgentMessages(result.messages);
      setHistoryTruncated(result.truncated);
      if (result.session.sessionId) setSelectedSessionId(result.session.sessionId);
      setAgentChatStatus("Completed by OpenClaw Gateway.");
      try {
        setData(await api.agentDetail(agentId, true));
      } catch {
        setAgentChatStatus("Completed by OpenClaw Gateway. Profile refresh is pending.");
      }
    } catch (requestError: any) {
      setAgentChatInput(text);
      setAgentChatStatus("");
      setHistoryError(requestError?.message ?? "The Gateway did not complete this message.");
    } finally {
      setAgentChatSending(false);
    }
  };

  if (loading && !data) return <PageState kind="loading" title="Loading agent profile" detail="Reading identity, sessions, SOUL metadata, tools, skills, commands, and usage from OpenClaw Gateway." />;
  if (error && !data) return <PageState kind="error" title="Agent profile unavailable" detail={error} onRetry={() => load(true, true)} />;
  if (!data) return null;

  const agent = data.agent;
  const state = agentStateCopy(agent.activity.state);
  const usage = agent.usage;
  const modelUsage = usage.models ?? [];
  const maxModelTokens = Math.max(...modelUsage.map((row) => row.totalTokens), 1);
  const toolNeedle = toolQuery.trim().toLowerCase();
  const tools = agent.tools.items.filter((tool) => !toolNeedle || [tool.id, tool.name, tool.group, tool.description].some((value) => value?.toLowerCase().includes(toolNeedle)));
  const skillNeedle = skillQuery.trim().toLowerCase();
  const skills = agent.skills.items
    .filter((skill) => skillFilter === "all" || (skillFilter === "eligible" ? skill.eligible : !skill.eligible))
    .filter((skill) => !skillNeedle || [skill.id, skill.name, skill.description, skill.source, skill.reason].some((value) => value?.toLowerCase().includes(skillNeedle)));
  const chatSessions = agent.activity.sessions.filter((session): session is typeof session & { sessionId: string } => Boolean(session.sessionId));
  const selectedChatSession = selectedSessionId ? chatSessions.find((session) => session.sessionId === selectedSessionId) ?? null : null;

  return (
    <section className="agent-detail-page">
      <button className="agent-back" onClick={() => navigate("/agents")}>← Agent archive</button>

      <header className="agent-detail-hero">
        <div className="agent-detail-aura" aria-hidden="true" />
        <AgentDetailAvatar agent={agent} />
        <div className="agent-detail-title">
          <div className="agent-detail-kicker">{agent.isDefault ? "Primary OpenClaw agent" : "OpenClaw agent"}</div>
          <div className="agent-detail-name-line"><h2>{agent.displayName}</h2><code>{agent.id}</code></div>
          <p>{agent.identity.theme || "No identity theme reported by the Gateway."}</p>
          <div className="agent-detail-badges">
            <span className={`agent-run-state ${agent.activity.state}`} title={state.detail}><i />{state.label}</span>
            <span>{agent.runtime.id || "Runtime not reported"}</span>
            <span>{agent.permissionMode || "Permission not reported"}</span>
          </div>
        </div>
        <div className="agent-detail-actions">
          <span>Gateway snapshot<br /><strong>{new Date(data.generatedAt).toLocaleString()}</strong></span>
          <div><button className="btn-secondary" onClick={() => load(true)} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button><button className="btn-secondary" onClick={() => setAvatarStudioOpen(true)}>Avatar studio</button><button className="btn" onClick={() => setEditOpen(true)}>Edit profile</button></div>
        </div>
      </header>

      {error && <div className="chat-alert" role="alert">Refresh failed; showing the previous snapshot. {error}</div>}
      {updateNotice && <div className="agent-update-notice" role="status">{updateNotice}</div>}
      {data.partialErrors.length > 0 && <div className="agent-partial-note">{data.partialErrors.length} profile source{data.partialErrors.length === 1 ? " is" : "s are"} unavailable. Missing fields remain explicitly unavailable.</div>}

      <nav className="agent-detail-tabs" aria-label="Agent profile sections">
        {(["overview", "activity", "chat", "capabilities"] as AgentDetailTab[]).map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => chooseTab(item)}>{item}</button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="agent-detail-grid overview">
          <section className="agent-detail-panel identity-panel">
            <div className="agent-panel-head"><div><span>Identity</span><h3>Configured profile</h3></div><b>{agent.identity.state}</b></div>
            <dl className="detail-definition-list">
              <div><dt>Effective name</dt><dd>{agent.identity.effectiveName || "Not reported"}</dd></div>
              <div><dt>Name source</dt><dd>{agent.identity.effectiveNameSource || "Not reported"}</dd></div>
              <div><dt>Configured name</dt><dd>{agent.configuredName || "Not configured"}</dd></div>
              <div><dt>Julie role</dt><dd className={agent.role.state === "configured" ? "" : "unavailable"}>{agent.role.value || "Not configured"}</dd></div>
              <div><dt>Schedule</dt><dd className={agent.hr ? "" : "unavailable"}>{agent.hr ? `${agent.hr.scheduleMode.replaceAll("_", " ")} · ${agent.hr.timezone}` : "Not configured"}</dd></div>
              <div><dt>Created via</dt><dd>{agent.provenance.createdVia || "Not reported"}</dd></div>
              <div><dt>Created</dt><dd>{agent.provenance.createdAt ? new Date(agent.provenance.createdAt).toLocaleString() : "Not reported"}</dd></div>
            </dl>
          </section>

          <section className="agent-detail-panel model-panel">
            <div className="agent-panel-head"><div><span>Model routing</span><h3>Runtime configuration</h3></div><b>{agent.model.fallbacks.length} fallback{agent.model.fallbacks.length === 1 ? "" : "s"}</b></div>
            <div className="detail-model-primary"><span>Primary</span><strong>{agent.model.primary || "Not reported"}</strong></div>
            <div className="detail-model-list">
              <span>Fallback chain</span>
              {agent.model.fallbacks.length ? agent.model.fallbacks.map((model, index) => <div key={`${model}-${index}`}><i>{index + 1}</i>{model}</div>) : <p>No fallback models reported.</p>}
            </div>
            <dl className="detail-definition-list compact">
              <div><dt>Utility model</dt><dd>{agent.model.utility || "Not reported"}</dd></div>
              <div><dt>Thinking default</dt><dd>{agent.thinkingDefault || "Not reported"}</dd></div>
              <div><dt>Runtime source</dt><dd>{agent.runtime.source || "Not reported"}</dd></div>
            </dl>
          </section>

          <section className="agent-detail-panel soul-panel">
            <div className="agent-panel-head"><div><span>Personality source</span><h3>{agent.soul.title || "SOUL.md"}</h3></div><b>{agent.soul.state}</b></div>
            {agent.soul.state === "ready" ? (
              <>
                <blockquote>{agent.soul.excerpt || "SOUL.md is readable but contains no safe prose excerpt."}</blockquote>
                <div className="soul-sections">{(agent.soul.sections || []).map((section) => <span key={section}>{section}</span>)}</div>
                <p className="detail-source-note">Safe summary from {agent.soul.source} · {formatCount(agent.soul.size)} bytes · raw file content is not sent to this page.</p>
              </>
            ) : <div className="detail-empty">{agent.soul.state === "missing" ? "No SOUL.md file is present." : "SOUL.md could not be read from the Gateway."}</div>}
          </section>

          <section className="agent-detail-panel workspace-panel">
            <div className="agent-panel-head"><div><span>Workspace</span><h3>Scope & bootstrap</h3></div><b>{agent.workspace.git ? "Git" : "No Git fact"}</b></div>
            <dl className="detail-definition-list compact">
              <div><dt>Gateway workspace</dt><dd>{agent.workspace.gatewayConfigured ? "Configured" : "Not reported"}</dd></div>
              <div><dt>Julie assignments</dt><dd className={agent.workspace.assignmentState === "configured" ? "" : "unavailable"}>{agent.workspace.julieAssignments.map((item) => item.name).join(", ") || "Not configured"}</dd></div>
              <div><dt>Capability requests</dt><dd>{agent.hr ? `${agent.hr.requestedTools.length} tools · ${agent.hr.requestedSkills.length} skills` : "None recorded"}</dd></div>
            </dl>
            <div className="bootstrap-files">
              <span>Bootstrap files</span>
              {agent.workspace.filesState === "unavailable" ? <p>File inventory unavailable.</p> : agent.workspace.bootstrapFiles.map((file) => (
                <div key={file.name}><strong>{file.name}</strong><small>{file.missing ? "Missing" : `${formatCount(file.size)} bytes`}</small></div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === "activity" && (
        <div className="agent-detail-stack">
          <div className="detail-usage-grid">
            <div><span>Input · 30d</span><strong>{usage.state === "pending" ? "…" : formatCount(usage.input)}</strong><small>{formatUsd(usage.inputCost)}</small></div>
            <div><span>Output · 30d</span><strong>{usage.state === "pending" ? "…" : formatCount(usage.output)}</strong><small>{formatUsd(usage.outputCost)}</small></div>
            <div><span>Cache read</span><strong>{usage.state === "pending" ? "…" : formatCount(usage.cacheRead)}</strong><small>{formatUsd(usage.cacheReadCost)}</small></div>
            <div><span>Total tokens</span><strong>{usage.state === "pending" ? "Preparing" : formatCount(usage.totalTokens)}</strong><small>{formatUsd(usage.totalCost)} · {usage.missingCostEntries ?? 0} missing-cost entries</small></div>
          </div>

          <section className="agent-detail-panel model-usage-panel">
            <div className="agent-panel-head"><div><span>Recorded model calls</span><h3>Model usage · 30 days</h3></div><b>{modelUsage.length} models</b></div>
            {usage.state === "pending" ? <div className="detail-empty">Gateway usage is still preparing. Refresh after the cache completes.</div> : modelUsage.length === 0 ? <div className="detail-empty">No model-level usage was reported for this agent and range.</div> : (
              <div className="model-usage-list">
                {modelUsage.map((row) => (
                  <article key={`${row.provider}-${row.model}`}>
                    <div className="model-usage-copy"><strong>{row.model}</strong><span>{row.provider || "Provider not reported"} · {row.calls} completed model call{row.calls === 1 ? "" : "s"}</span></div>
                    <div className="model-usage-bar"><i style={{ width: `${Math.max(1, (row.totalTokens / maxModelTokens) * 100)}%` }} /></div>
                    <div className="model-usage-values"><strong>{formatCount(row.totalTokens)}</strong><span>{formatUsd(row.totalCost)}{row.missingCostEntries > 0 ? ` · ${row.missingCostEntries} missing` : ""}</span></div>
                  </article>
                ))}
              </div>
            )}
            <p className="detail-source-note">Token and cost values are Gateway-reported. A zero cost is retained as reported; missing pricing is counted separately and never estimated by Julie.</p>
          </section>

          <section className="agent-detail-panel session-panel">
            <div className="agent-panel-head"><div><span>Gateway activity</span><h3>Visible sessions</h3></div><b>{agent.activity.visibleSessions} total · {agent.activity.activeSessions} active</b></div>
            {agent.activity.sessions.length === 0 ? <div className="detail-empty">No visible sessions are reported for this configured agent.</div> : (
              <div className="agent-session-list">
                {agent.activity.sessions.map((session, index) => (
                  <article key={session.sessionId || `${session.displayName}-${index}`} className={session.hasActiveRun ? "running" : ""}>
                    <div className="session-state-mark"><i /></div>
                    <div className="session-main"><strong>{session.displayName}</strong><span>{session.model || "Model not reported"} · {session.channel || session.chatType || "Channel not reported"}</span></div>
                    <div className="session-usage"><strong>{formatCount(session.totalTokens)}</strong><span>tokens</span></div>
                    <div className="session-time"><strong>{session.hasActiveRun ? "Active run" : session.status || "Unknown"}</strong><span>{relativeAgentTime(session.lastActivityAt)}</span></div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="agent-detail-panel task-history-panel">
            <div className="agent-panel-head"><div><span>Julie task evidence</span><h3>Assigned task history</h3></div><b>{agent.taskHistory.items.length} linked</b></div>
            {agent.taskHistory.items.length === 0 ? <div className="detail-empty">No Julie task is assigned to this agent. Session activity is not presented as task completion.</div> : (
              <div className="agent-task-history-list">
                {agent.taskHistory.items.map((task) => <article key={task.id}>
                  <div><small>#{task.id} · {STATUS_LABEL[task.status]}</small><strong>{task.title}</strong><span>Priority {TASK_PRIORITY[task.priority].label} · updated {taskTimestamp(task.updated_at)}</span></div>
                  {task.last_run_output && <p>{task.last_run_output.slice(0, 240)}{task.last_run_output.length > 240 ? "…" : ""}</p>}
                </article>)}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "chat" && (
        <div className="agent-chat-layout">
          <aside className="agent-detail-panel agent-chat-sidebar">
            <div className="agent-panel-head"><div><span>Target</span><h3>Agent session</h3></div><b>{chatSessions.length} visible</b></div>
            <label className="agent-chat-session-select">
              <span>Conversation</span>
              <select value={selectedSessionId ?? ""} onChange={(event) => {
                setSelectedSessionId(event.target.value || null);
                setAgentMessages([]);
                setHistoryError("");
                setAgentChatStatus("");
              }} disabled={agentChatSending || selectedSessionId === undefined}>
                <option value="">＋ New agent conversation</option>
                {chatSessions.map((session) => <option value={session.sessionId} key={session.sessionId}>{session.hasActiveRun ? "● " : ""}{session.displayName}</option>)}
              </select>
            </label>
            <div className="agent-chat-target-card">
              <AgentDetailAvatar agent={agent} />
              <strong>{agent.displayName}</strong>
              <code>{agent.id}</code>
              <p>{selectedChatSession
                ? `${selectedChatSession.hasActiveRun ? "Active run" : selectedChatSession.status || "Status unknown"} · ${selectedChatSession.model || "Model not reported"}`
                : "A new agent-qualified OpenClaw session will be created on send."}</p>
            </div>
            <div className="agent-chat-safety">
              <strong>Scoped delivery</strong>
              <p>Julie verifies that the selected session belongs to this agent. Session keys remain server-side.</p>
            </div>
          </aside>

          <section className="agent-detail-panel agent-chat-panel">
            <div className="agent-panel-head">
              <div><span>OpenClaw history</span><h3>{selectedChatSession?.displayName || "New conversation"}</h3></div>
              {selectedSessionId && <button className="agent-history-refresh" onClick={() => fetchAgentHistory(selectedSessionId)} disabled={historyLoading || agentChatSending}>Refresh history</button>}
            </div>

            {historyError && <div className="chat-alert" role="alert">{historyError}</div>}
            {historyTruncated && <div className="agent-history-note">Showing the latest 120 sanitized user/assistant messages.</div>}
            <div className="agent-chat-log" ref={agentChatLogRef} aria-live="polite">
              {historyLoading && <div className="agent-chat-empty">Loading sanitized Gateway history…</div>}
              {!historyLoading && selectedSessionId === null && agentMessages.length === 0 && <div className="agent-chat-empty"><strong>Start a new conversation</strong><span>Your first message creates an agent-qualified Gateway session.</span></div>}
              {!historyLoading && selectedSessionId && !historyError && agentMessages.length === 0 && <div className="agent-chat-empty"><strong>No visible messages</strong><span>This session has no sanitized user/assistant text history.</span></div>}
              {agentMessages.map((message) => (
                <article className={`agent-chat-message ${message.role}`} key={`${message.id}-${message.timestamp ?? "none"}`}>
                  <div className="agent-chat-message-head"><span>{message.role === "assistant" ? agent.displayName : "You"}</span><time>{message.timestamp ? new Date(message.timestamp).toLocaleString() : "Time not reported"}</time></div>
                  {message.role === "assistant" ? <Markdown text={message.text} /> : <div className="msg-plain">{message.text}</div>}
                </article>
              ))}
              {agentChatSending && <div className="agent-chat-waiting"><span className="page-state-spinner" /> Waiting for OpenClaw's final reply…</div>}
            </div>

            <div className="agent-chat-composer">
              <textarea value={agentChatInput} onChange={(event) => setAgentChatInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendToAgent(); } }}
                placeholder={`Message ${agent.displayName}…`} disabled={agentChatSending || selectedSessionId === undefined} rows={2} />
              <button className="send-btn" onClick={sendToAgent} disabled={agentChatSending || selectedSessionId === undefined || !agentChatInput.trim()}>{agentChatSending ? "Working…" : "Send"}</button>
            </div>
            <div className="agent-chat-delivery" role="status">
              <span>{agentChatStatus || "Messages are owner-authenticated and delivered through the documented Gateway chat RPC."}</span>
              <small>Shift + Enter for a new line</small>
            </div>
          </section>
        </div>
      )}

      {tab === "capabilities" && (
        <div className="agent-capability-layout">
          <section className="agent-detail-panel capability-panel">
            <div className="agent-panel-head"><div><span>Gateway catalog</span><h3>Tools</h3></div><b>{agent.tools.total} tools · {agent.tools.groups} groups</b></div>
            <input className="capability-search" value={toolQuery} onChange={(event) => setToolQuery(event.target.value)} placeholder="Filter tools" aria-label="Filter agent tools" />
            {agent.tools.state === "unavailable" ? <div className="detail-empty">Tool catalog unavailable.</div> : (
              <div className="capability-list tools">
                {tools.map((tool) => <article key={tool.id}><div><strong>{tool.name}</strong><code>{tool.id}</code></div><span>{tool.group || "Ungrouped"}</span><p>{tool.description || "No description reported."}</p></article>)}
                {tools.length === 0 && <div className="detail-empty">No tools match this filter.</div>}
              </div>
            )}
          </section>

          <section className="agent-detail-panel capability-panel">
            <div className="agent-panel-head"><div><span>Gateway eligibility</span><h3>Skills</h3></div><b>{agent.skills.eligible}/{agent.skills.total} eligible</b></div>
            <div className="capability-filters">
              <input className="capability-search" value={skillQuery} onChange={(event) => setSkillQuery(event.target.value)} placeholder="Filter skills" aria-label="Filter agent skills" />
              <select value={skillFilter} onChange={(event) => setSkillFilter(event.target.value as typeof skillFilter)}>
                <option value="all">All</option><option value="eligible">Eligible</option><option value="unavailable">Unavailable</option>
              </select>
            </div>
            {agent.skills.state === "unavailable" ? <div className="detail-empty">Skill inventory unavailable.</div> : (
              <div className="capability-list skills">
                {skills.map((skill) => <article className={skill.eligible ? "eligible" : "unavailable"} key={skill.id}>
                  <div className="skill-title"><span>{skill.emoji || "◇"}</span><strong>{skill.name}</strong><i>{skill.eligible ? "Eligible" : "Unavailable"}</i></div>
                  <p>{skill.description || "No description reported."}</p>
                  {!skill.eligible && <small>{skill.reason}</small>}
                </article>)}
                {skills.length === 0 && <div className="detail-empty">No skills match this filter.</div>}
              </div>
            )}
          </section>

          <section className="agent-detail-panel capability-panel commands-panel">
            <div className="agent-panel-head"><div><span>Runtime inventory</span><h3>Commands</h3></div><b>{agent.commands.total} commands</b></div>
            {agent.commands.state === "unavailable" ? <div className="detail-empty">Command inventory unavailable.</div> : (
              <div className="command-list">{agent.commands.items.map((command, index) => <div key={`${command.name}-${index}`}><code>/{command.name}</code><span>{command.description || "No description reported."}</span><small>{command.category || command.source || "Uncategorized"}</small></div>)}</div>
            )}
          </section>
        </div>
      )}
      {editOpen && <EditAgentDialog agent={agent} onClose={() => setEditOpen(false)} onSaved={(detail, receipt) => {
        setData(detail);
        setEditOpen(false);
        setUpdateNotice(receipt.warnings.length
          ? `Update applied with warning: ${receipt.warnings.join(" ")}`
          : receipt.applied.gatewayUpdated
            ? "Gateway identity/model and Julie HR changes were applied successfully."
            : "Julie HR and guarded SOUL changes were applied; Gateway identity/model already matched.");
      }} />}
      {avatarStudioOpen && <AgentAvatarStudioDialog agent={agent} onClose={() => setAvatarStudioOpen(false)} onApplied={(detail, notice) => {
        setData(detail);
        setAvatarStudioOpen(false);
        setUpdateNotice(notice);
      }} />}
    </section>
  );
}

// --- Apps Page (connection truth comes from the real gateway tool list) ---
type AppDefinition = {
  id: "gmail" | "x" | "facebook" | "browser" | "files" | "github";
  name: string;
  icon: string;
  description: string;
  matches: (tool: Tool) => boolean;
};

function toolText(tool: Tool): string {
  return [tool.id, tool.name, tool.description, tool.group].map((value) => String(value ?? "").toLowerCase()).join(" ");
}

const APP_CATALOG: AppDefinition[] = [
  { id: "gmail", name: "Gmail", icon: "✉", description: "Read, draft, and organize email", matches: (t) => /\bgmail\b|google mail/.test(toolText(t)) },
  { id: "x", name: "X / Twitter", icon: "𝕏", description: "Search and work with public posts", matches: (t) => t.id === "x_search" || /\btwitter\b/.test(toolText(t)) },
  { id: "facebook", name: "Facebook", icon: "f", description: "Pages, posts, and messages", matches: (t) => /\bfacebook\b|\bmeta[_ -]/.test(toolText(t)) },
  { id: "browser", name: "Browser", icon: "◎", description: "Browse and interact with the web", matches: (t) => t.id === "browser" || t.id === "screen" },
  { id: "files", name: "Files", icon: "▣", description: "Read and manage local or paired-node files", matches: (t) => /^(ls|read|write|edit|apply_patch|file_|dir_)/.test(t.id) || /\bfiles?\b|file-transfer/.test(toolText(t)) },
  { id: "github", name: "GitHub", icon: "⌘", description: "Identity, repositories, and publishing", matches: (t) => t.id.startsWith("github_") },
];

function ToolsPage() {
  const [tools, setTools] = useState<Tool[] | null>(null);
  const [preferences, setPreferences] = useState<Record<string, boolean> | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadApps = useCallback(() => {
    setTools(null);
    setPreferences(null);
    setError("");
    Promise.all([api.tools(), api.appPreferences()])
      .then(([toolData, preferenceData]) => {
        setTools(toolData.tools);
        setPreferences(preferenceData.preferences);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(loadApps, [loadApps]);

  const setEnabled = async (id: AppDefinition["id"], enabled: boolean) => {
    setSaving(id);
    try {
      const data = await api.setAppEnabled(id, enabled);
      setPreferences(data.preferences);
    } catch (e: any) {
      setError(e?.message ?? "Could not update app preference");
    } finally {
      setSaving(null);
    }
  };

  if (error && tools == null) return <PageState kind="error" title="Apps unavailable" detail={error} onRetry={loadApps} />;
  if (tools == null || preferences == null) return <PageState kind="loading" title="Checking app connections" detail="Verifying capabilities against the live gateway tool inventory." />;

  return (
    <div className="apps-page">
      <div className="apps-head">
        <div>
          <h2>Apps</h2>
          <p>External apps and capabilities reported by the live OpenClaw Gateway.</p>
        </div>
        <span className="apps-source"><span className="hv-dot on" /> Gateway live · {tools.length} tools</span>
      </div>
      {error && <div className="apps-error">{error}</div>}
      <div className="apps-grid">
        {APP_CATALOG.map((app) => {
          const matches = tools.filter(app.matches);
          const connected = matches.length > 0;
          const enabled = connected && preferences[app.id] !== false;
          const state = !connected ? "Not connected" : enabled ? "Available via gateway" : "Paused locally";
          return (
            <section className={`app-card${connected ? " connected" : ""}`} key={app.id}>
              <div className="app-icon" aria-hidden="true">{app.icon}</div>
              <div className="app-copy">
                <h3>{app.name}</h3>
                <p>{app.description}</p>
                <div className={`app-status ${connected ? enabled ? "on" : "paused" : "off"}`}>
                  <span className="hv-dot" /> {state}
                </div>
                {connected && <div className="app-tools">{matches.slice(0, 3).map((t) => t.name || t.id).join(" · ")}{matches.length > 3 ? ` +${matches.length - 3}` : ""}</div>}
              </div>
              <label className={`app-toggle${!connected ? " disabled" : ""}`} title={connected ? `${enabled ? "Pause" : "Enable"} ${app.name}` : `${app.name} has no gateway integration`}>
                <input type="checkbox" checked={enabled} disabled={!connected || saving === app.id}
                  onChange={(e) => setEnabled(app.id, e.target.checked)} />
                <span aria-hidden="true" />
              </label>
            </section>
          );
        })}
      </div>
      <div className="apps-note">
        A toggle controls Julie's local use of a capability that the gateway actually reports. It does not simulate a connection. OAuth setup for disconnected accounts remains out of scope.
      </div>
    </div>
  );
}

// --- Analytics Page ---
function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(() => {
    setData(null);
    setError("");
    api.analytics().then(d => setData(d.analytics)).catch(e => setError(e.message));
  }, []);

  useEffect(loadAnalytics, [loadAnalytics]);

  if (error) return <PageState kind="error" title="Analytics unavailable" detail={error} onRetry={loadAnalytics} />;
  if (!data) return <PageState kind="loading" title="Preparing analytics" detail="Aggregating real task, run, conversation, and message records." />;

  const maxDay = Math.max(...data.messagesPerDay.map(d => d.count), 1);

  return (
    <div className="dashboard-grid">
      <div className="card">
        <div className="card-title">Messages per Day (30d)</div>
        <div className="chart-container">
          {data.messagesPerDay.length === 0 && <div className="text-dim">No messages yet.</div>}
          {data.messagesPerDay.map(d => (
            <div key={d.day} className="chart-bar" style={{ height: `${(d.count / maxDay) * 100}%`, width: 20 }} title={`${d.day}: ${d.count}`} />
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-title">Task Runs (30d)</div>
        <div className="chart-container">
          {data.taskRunsPerDay.length === 0 && <div className="text-dim">No task runs yet.</div>}
          {data.taskRunsPerDay.map(d => (
            <div key={d.day} className="chart-bar" style={{ height: `${(d.count / maxDay) * 100}%`, width: 20, background: "var(--accent-cyan)" }} title={`${d.day}: ${d.count}`} />
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-title">Tasks by Status</div>
        <div className="card-content">
          {data.tasksByStatus.length === 0 && <div>No tasks created yet.</div>}
          {data.tasksByStatus.map(s => (
            <div key={s.status} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span>{STATUS_LABEL[s.status] || s.status}</span>
              <span>{s.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Profile Page ---
// D2-7 helper: read an image file, downscale to `size`px (max side), return
// jpeg dataURL — keeps avatars small enough for the settings API without
// any canvas complexity on the server.
async function downscaleImage(file: File, size = 256): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = () => rej(new Error("Not a readable image file"));
      el.src = url;
    });
    const scale = Math.min(1, size / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ProfilePage() {
  const [session, setSession] = useState<{authenticated: boolean; gateway?: any} | null>(null);
  const [workspaces, setWorkspaces] = useState<{id: number; name: string; description: string}[]>([]);
  const [newWsName, setNewWsName] = useState("");
  const [newWsDesc, setNewWsDesc] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarMsg, setAvatarMsg] = useState("");

  useEffect(() => {
    api.session().then(setSession).catch(() => {});
    api.workspaces().then(d => setWorkspaces(d.workspaces)).catch(() => {});
    api.avatar().then(d => setAvatar(d.avatar)).catch(() => {});
  }, []);

  // D2-7: owner avatar — pick a file, downscale to a 256px JPEG dataURL client
  // side (keeps the payload well under the ~1MB API cap), PUT to the server.
  const onAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarMsg("Processing…");
    try {
      const dataUrl = await downscaleImage(file, 256);
      const d = await api.setAvatar(dataUrl);
      setAvatar(d.avatar);
      setAvatarMsg("Avatar saved.");
    } catch (err: any) {
      setAvatarMsg(err?.message ?? "Could not save avatar.");
    }
  };

  const clearAvatar = async () => {
    try {
      const d = await api.setAvatar(null);
      setAvatar(d.avatar);
      setAvatarMsg("Avatar removed.");
    } catch (err: any) {
      setAvatarMsg(err?.message ?? "Could not remove avatar.");
    }
  };

  const createWorkspace = async () => {
    if (!newWsName.trim()) return;
    const d = await api.createWorkspace(newWsName, newWsDesc);
    setWorkspaces(prev => [...prev, d.workspace]);
    setNewWsName("");
    setNewWsDesc("");
  };

  const activateWorkspace = async (id: number) => {
    await api.activateWorkspace(id);
    window.location.reload();
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Profile</div>
        <div className="card-content" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><span className="text-dim">Session:</span> {session?.authenticated ? "Authenticated" : "Anonymous"}</div>
          <div><span className="text-dim">Gateway:</span> {session?.gateway?.connected ? "Connected" : "Disconnected"}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Owner Avatar</div>
        <div className="card-content" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {avatar
              ? <img src={avatar} alt="Owner avatar" style={{ width: 56, height: 56, borderRadius: "50%", border: "1px solid var(--accent-border)", objectFit: "cover" }} />
              : <div style={{ width: 56, height: 56, borderRadius: "50%", border: "1px dashed var(--border-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontSize: "0.7rem" }}>none</div>}
            <label className="btn" style={{ padding: "8px 14px", fontSize: "0.8rem", cursor: "pointer" }}>
              Choose photo
              <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={onAvatarFile} />
            </label>
            {avatar && <button className="icon-btn" onClick={clearAvatar} title="Remove avatar">✕</button>}
          </div>
          {avatarMsg && <div className="text-dim" style={{ fontSize: "0.75rem" }}>{avatarMsg}</div>}
          <div className="text-dim" style={{ fontSize: "0.7rem" }}>Stored locally on this machine (settings store). Shown beside the AI Assistant panel.</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Workspaces</div>
        <div className="card-content" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {workspaces.map(ws => (
            <div key={ws.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{ws.name}</div>
                <div className="text-dim" style={{ fontSize: "0.8rem" }}>{ws.description || "No description"}</div>
              </div>
              <button className="btn" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={() => activateWorkspace(ws.id)}>Use</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input 
              placeholder="Workspace name" 
              value={newWsName} 
              onChange={e => setNewWsName(e.target.value)}
              style={{ flex: 1 }}
            />
            <input 
              placeholder="Description" 
              value={newWsDesc} 
              onChange={e => setNewWsDesc(e.target.value)}
              style={{ flex: 2 }}
            />
            <button className="btn" onClick={createWorkspace}>+</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Projects Page (dev project registry; real OpenCode service records) ---
function ProjectsPage({ navigate }: { navigate: (to: string) => void }) {
  const [data, setData] = useState<OpencodeProjectsResponse | null>(null);
  const load = useCallback(async () => {
    setData(null);
    try {
      setData(await api.opencodeProjects());
    } catch (e: any) {
      setData({ ok: false, projects: [], coverage: { projects: 0, sessionsScanned: 0 }, error: e.message || "projects unavailable", source: "opencode" });
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const up = data?.ok ?? false;
  return (
    <div className="projects-page">
      <div className="card projects-header">
        <div className="opencode-header">
          <div>
            <div className="card-title">Projects<span className="opencode-card-subtitle">Development registry · live from the OpenCode service</span></div>
            {data == null ? (
              <p className="muted" style={{ margin: 0 }}>loading registry…</p>
            ) : up ? (
              <p className="muted" style={{ margin: 0 }}>{data.projects.length} project{data.projects.length === 1 ? "" : "s"} · session counts from the latest {data.coverage.sessionsScanned} sessions</p>
            ) : (
              <p className="opencode-unavailable" style={{ margin: 0 }}>unavailable — {data.error}</p>
            )}
          </div>
          <div className="projects-actions">
            <button className="btn" onClick={load}>Refresh</button>
            <button className="btn" onClick={() => navigate("/opencode")}>Activity ↗</button>
          </div>
        </div>
      </div>

      {data == null ? (
        <div className="card"><PageState kind="loading" title="Loading projects…" /></div>
      ) : !up ? (
        <div className="card"><PageState kind="error" title="Projects unavailable" detail={`${data.error ?? "unknown error"} — the registry reads the real OpenCode service; nothing is simulated.`} onRetry={load} /></div>
      ) : data.projects.length === 0 ? (
        <div className="card"><PageState kind="empty" title="No projects yet" detail="Projects appear here once OpenCode records activity for a directory." /></div>
      ) : (
        <div className="projects-grid">
          {data.projects.map((project) => (
            <div className="project-card" key={project.id ?? project.name}>
              <div className="project-card-head">
                <span className="project-icon" aria-hidden="true">▤</span>
                <strong>{project.name}</strong>
                {project.vcs && <span className="status-pill wait opencode-outcome">{project.vcs}</span>}
                {project.sandboxes > 0 && <span className="muted project-sub-detail">{project.sandboxes} sandbox{project.sandboxes === 1 ? "" : "es"}</span>}
              </div>
              <div className="project-card-stats">
                <span>{project.sessions} session{project.sessions === 1 ? "" : "s"}</span>
                <span className="muted">· {project.lastActive ? `active ${relativeTime(project.lastActive)}` : "no recent activity"}</span>
              </div>
              <div className="muted project-created">registered {project.created ? relativeTime(project.created) : "unknown"}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card projects-note-card">
        <p className="muted items-note">
          This registry mirrors the real OpenCode service records. Host paths stay
          server-side; files and ports that are not visible through the bridge
          remain invisible here. Read-only file browsing is planned as the next
          registry slice.
        </p>
      </div>
    </div>
  );
}

// --- OpenCode Page (real service stats + link to the default OpenCode web UI) ---
function formatTokens(t: { input: number | null; output: number | null; reasoning: number | null; cacheRead: number | null; cacheWrite: number | null }): string {
  const n = (t.input ?? 0) + (t.output ?? 0) + (t.reasoning ?? 0);
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function relativeTime(ts: number | null): string {
  if (!ts) return "unknown";
  const delta = Date.now() - ts;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

function OpencodeStatusCard({ status, onStatus, onRecover }: { status: OpencodeStatus | null; onStatus: () => void; onRecover: () => void }) {
  return (
    <div className="card opencode-status">
      <div className="opencode-header">
        <div>
          <div className="card-title">OpenCode</div>
          {status == null ? (
            <p className="muted" style={{ margin: 0 }}>checking service…</p>
          ) : status.ok ? (
            <p className="muted" style={{ margin: 0 }}>v{status.version ?? "?"} · pid {status.pid ?? "?"} · checked {relativeTime(Date.parse(status.checkedAt))}</p>
          ) : (
            <p className="opencode-unavailable" style={{ margin: 0 }}>unavailable — {status.error}</p>
          )}
        </div>
        {status?.ok ? (
          <a className="btn opencode-webui-link" href={status.webUiUrl ?? "#"} target="_blank" rel="noreferrer" onClick={(e) => { if (!status.webUiUrl) e.preventDefault(); }}>
            Open code session ↗
          </a>
        ) : (
          <button className="btn" onClick={onStatus}>Re-check</button>
        )}
      </div>
      {status?.ok && status.webUiUrl == null && <p className="opencode-note">No browser-reachable URL was advertised by the service.</p>}
      {!status?.ok && status != null && <button className="btn" style={{ marginTop: 10 }} onClick={onRecover}>Try again</button>}
    </div>
  );
}

function OpencodeStatTile({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  return (
    <div className="opencode-stat">
      <span className="opencode-stat-value">{value}</span>
      <span className="opencode-stat-label">{label}</span>
      {detail && <span className="muted opencode-stat-detail">{detail}</span>}
    </div>
  );
}

function OpencodePage() {
  const [status, setStatus] = useState<OpencodeStatus | null>(null);
  const [stats, setStats] = useState<OpencodeStatsResponse | null>(null);
  const [active, setActive] = useState<OpencodeActiveResponse | null>(null);
  const [sessions, setSessions] = useState<OpencodeSessionsResponse | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.opencodeStatus());
    } catch (e: any) {
      setStatus({ ok: false, available: false, version: null, pid: null, webUiUrl: null, checkedAt: new Date().toISOString(), error: e.message || "status unavailable" });
    }
  }, []);

  const loadLive = useCallback(async () => {
    setStats(null); setActive(null); setSessions(null);
    const [s, a, sess] = await Promise.allSettled([api.opencodeStats(), api.opencodeActive(), api.opencodeSessions()]);
    setStats(s.status === "fulfilled" ? s.value : { ok: false, stats: null, error: s.reason?.message ?? "unavailable", source: "opencode" });
    setActive(a.status === "fulfilled" ? a.value : { ok: false, active: [], error: a.reason?.message ?? "unavailable", source: "opencode" });
    setSessions(sess.status === "fulfilled" ? sess.value : { ok: false, sessions: [], error: sess.reason?.message ?? "unavailable", source: "opencode" });
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { if (status?.ok) loadLive(); }, [status?.ok, loadLive]);
  useEffect(() => {
    const t = setInterval(loadStatus, 30_000);
    return () => clearInterval(t);
  }, [loadStatus]);

  const up = status?.ok ?? false;
  const st = stats?.stats ?? null;
  const maxSteps = st ? Math.max(1, ...st.activity.map((row) => row.steps)) : 1;

  return (
    <div className="opencode-page">
      <OpencodeStatusCard status={status} onStatus={loadStatus} onRecover={loadStatus} />

      {!up ? (
        <div className="card">
          <PageState kind="empty" title="Service unavailable" detail="Stats appear once the OpenCode background service answers. Nothing on this page is simulated." />
        </div>
      ) : st == null ? (
        <div className="card">
          {stats && !stats.ok ? (
            <PageState kind="error" title="Stats unavailable" detail={stats.error ?? "unknown error"} onRetry={loadLive} />
          ) : (
            <PageState kind="loading" title="Loading stats…" />
          )}
        </div>
      ) : (
        <>
          <div className="card">
            <div className="card-title">Activity
              <button className="btn" onClick={loadLive}>Refresh</button>
            </div>
            <div className="opencode-stats">
              <OpencodeStatTile label="Prompts" value={String(st.prompts)} />
              <OpencodeStatTile label="Steps" value={String(st.steps)} />
              <OpencodeStatTile label="Tokens" value={formatTokens(st.tokens)} />
              <OpencodeStatTile label="Active days" value={String(st.activeDays)} detail={st.streak ? `${st.streak}-day streak` : null} />
              <OpencodeStatTile label="Tool calls" value={String(st.tools.calls)} detail={`${st.tools.succeeded} ok · ${st.tools.failed} failed`} />
              <OpencodeStatTile label="Cost" value={typeof st.cost === "number" ? `$${st.cost.toFixed(4)}` : "not reported"} />
            </div>
            {st.activity.length > 0 && (
              <div className="opencode-bars" aria-hidden="true">
                {st.activity.slice(-14).map((row) => (
                  <div key={row.date} className="opencode-bar-wrap" title={`${row.date}: ${row.steps} steps`}>
                    <div className="opencode-bar" style={{ height: `${Math.max(4, Math.round((row.steps / maxSteps) * 60))}px` }} />
                    <span className="opencode-bar-date">{row.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
            {st.models.length > 0 && (
              <div className="opencode-models">
                {st.models.map((row, i) => (
                  <div key={i} className="muted">
                    {row.model.providerID}/{row.model.id ?? "?"} · {row.steps} steps · {formatTokens(row.tokens)} tokens
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">In progress
              {active && active.ok && <span className="muted" style={{ marginLeft: "auto" }}>{active.active.length === 0 ? "nothing running" : `${active.active.length} running`}</span>}
            </div>
            {active == null ? (
              <p className="muted">checking…</p>
            ) : !active.ok ? (
              <PageState kind="error" title="Active check failed" detail={active.error ?? "unknown error"} onRetry={loadLive} />
            ) : active.active.length === 0 ? (
              <PageState kind="empty" title="No running sessions" detail="Sessions actively executing right now appear here." />
            ) : (
              active.active.map((row) => (
                <div key={row.id} className="opencode-active-row">
                  <span className="status-pill ok opencode-outcome"><span className="status-dot" /> <span>running</span></span>
                  <span className="muted">session {row.id.slice(0, 12)}…</span>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <div className="card-title">History</div>
            {sessions == null ? (
              <p className="muted">checking…</p>
            ) : !sessions.ok ? (
              <PageState kind="error" title="History unavailable" detail={sessions.error ?? "unknown error"} onRetry={loadLive} />
            ) : sessions.sessions.length === 0 ? (
              <PageState kind="empty" title="No sessions yet" detail="Open a session in the OpenCode web UI and it will appear here." />
            ) : (
              <div className="opencode-sessions">
                {sessions.sessions.map((s: OpencodeSessionRow) => (
                  <div className="opencode-session" key={s.id}>
                    <div className="opencode-session-head">
                      <strong>{s.title || `${s.agent ?? "session"} · ${s.id.slice(0, 10)}…`}</strong>
                      {s.outcome && <span className={`status-pill ${s.outcome === "success" ? "ok" : s.outcome === "failed" ? "err" : "wait"} opencode-outcome`}>{s.outcome}</span>}
                    </div>
                    <div className="muted">
                      {s.agent ?? "unknown agent"} · {s.model.providerID}/{s.model.id ?? "unknown model"} · {formatTokens(s.tokens || { input: null, output: null, reasoning: null, cacheRead: null, cacheWrite: null })} tokens
                      {typeof s.cost === "number" && s.cost > 0 ? ` · $${s.cost.toFixed(4)}` : ""}
                      {s.time.updated ? ` · ${relativeTime(s.time.updated)}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// --- Terminal Page ---
function TerminalPage() {
  const [lines, setLines] = useState<string[]>(["$ Julie AiOS Terminal ready."]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Protocol-aware WebSocket: wss:// for HTTPS, ws:// for HTTP
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProtocol}//${window.location.host}/terminal-ws`);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const d = JSON.parse(ev.data);
      if (d.type === "data") setLines(prev => [...prev, d.text.trim()]);
      else if (d.type === "exit") { setLines(prev => [...prev, `[exit code: ${d.code}]`]); setRunning(false); }
      else if (d.type === "error") { setLines(prev => [...prev, `ERROR: ${d.message}`]); setRunning(false); }
    };
    return () => ws.close();
  }, []);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [lines]);

  const send = () => {
    if (!input.trim() || running) return;
    setRunning(true);
    setLines(prev => [...prev, `$ ${input}`]);
    wsRef.current?.send(JSON.stringify({ type: "exec", command: input }));
    setInput("");
  };

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column" }}>
      <div className="card-title">Secure Terminal <button className="icon-btn" onClick={() => wsRef.current?.send(JSON.stringify({ type: "kill" }))} title="Kill process">⏹</button></div>
      <div className="terminal-card" ref={logRef}>
        {lines.map((l, i) => <div key={i} style={{ whiteSpace: "pre-wrap" }}>{l}</div>)}
      </div>
      <div className="terminal-input">
        <span className="prompt">$</span>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Type command (e.g., echo JULIE-AIOS-TERMINAL-OK)" disabled={running} autoFocus />
        <button className="btn" onClick={send} disabled={running || !input}>Run</button>
      </div>
    </div>
  );
}

// --- Chat View ---
const CHAT_ATTACHMENT_ACCEPT = [
  "image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf",
  "text/plain", "text/markdown", "text/csv", "application/json",
  ".txt", ".text", ".log", ".md", ".markdown", ".csv", ".json",
].join(",");

function AgentRoomsView({ workspaceId, members, tasks }: {
  workspaceId: number;
  members: AgentOrganizationResponse["members"];
  tasks: Task[];
}) {
  const [rooms, setRooms] = useState<AgentRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AgentRoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [composer, setComposer] = useState("");
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [activeRun, setActiveRun] = useState<AgentRoomActiveRun | null>(null);
  const [sending, setSending] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createTaskId, setCreateTaskId] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createAgentIds, setCreateAgentIds] = useState<string[]>([]);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const loadRooms = useCallback(async (preferredId?: number) => {
    setLoading(true);
    setError("");
    try {
      const data = await api.agentRooms(workspaceId);
      setRooms(data.rooms);
      setSelectedRoomId((current) => {
        const wanted = preferredId ?? current;
        return wanted && data.rooms.some((room) => room.id === wanted) ? wanted : data.rooms[0]?.id ?? null;
      });
    } catch (requestError: any) {
      setError(requestError?.message ?? "Could not load agent rooms.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const loadDetail = useCallback(async (roomId: number, quiet = false) => {
    if (!quiet) setDetailLoading(true);
    try {
      const data = await api.agentRoom(roomId);
      setDetail(data.room);
      setActiveRun(data.room.activeRun);
    } catch (requestError: any) {
      setError(requestError?.message ?? "Could not load this room.");
    } finally {
      if (!quiet) setDetailLoading(false);
    }
  }, []);

  useEffect(() => { void loadRooms(); }, [loadRooms]);
  useEffect(() => {
    if (!selectedRoomId) { setDetail(null); setActiveRun(null); return; }
    void loadDetail(selectedRoomId);
  }, [selectedRoomId, loadDetail]);

  useEffect(() => {
    if (!detail) return;
    setRecipientIds(detail.members.map((member) => member.agentId));
  }, [detail?.id]);

  useEffect(() => {
    if (!selectedRoomId) return;
    const source = new EventSource(`/api/agent-rooms/${selectedRoomId}/events`);
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type?: string; state?: string; activeRun?: AgentRoomActiveRun | null; message?: AgentRoomMessage; completed?: number; failed?: number };
        if (data.type === "hello") setActiveRun(data.activeRun ?? null);
        if (data.type === "message" && data.message) {
          const message = data.message;
          setDetail((current) => {
            if (!current || current.id !== selectedRoomId || current.messages.some((row) => row.id === message.id)) return current;
            return { ...current, messages: [...current.messages, message], messageCount: current.messageCount + 1, latestMessage: message };
          });
          setRooms((current) => current.map((room) => room.id === selectedRoomId ? { ...room, latestMessage: message, updatedAt: message.createdAt } : room));
        }
        if (data.type === "run") {
          if (data.state === "complete") {
            setActiveRun(null);
            void loadDetail(selectedRoomId, true);
            void loadRooms(selectedRoomId);
          } else if (data.activeRun) setActiveRun(data.activeRun);
        }
      } catch { /* malformed frame: EventSource will continue */ }
    };
    return () => source.close();
  }, [selectedRoomId, loadDetail, loadRooms]);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [detail?.messages.length, activeRun]);

  const memberMap = new Map((detail?.members ?? []).map((member) => [member.agentId, member]));
  const openTasks = tasks.filter((task) => task.status !== "done");

  const selectRoom = (id: number) => {
    setSelectedRoomId(id);
    setError("");
    setMobileChatOpen(true);
  };

  const toggleRecipient = (agentId: string) => {
    setRecipientIds((current) => current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId]);
  };

  const sendRoomMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!detail || !composer.trim() || recipientIds.length === 0 || sending || activeRun || detail.status !== "open") return;
    setSending(true);
    setError("");
    try {
      const result = await api.sendAgentRoomMessage(detail.id, composer.trim(), recipientIds);
      setComposer("");
      setActiveRun(result.activeRun);
      setDetail((current) => current && !current.messages.some((message) => message.id === result.ownerMessage.id)
        ? { ...current, messages: [...current.messages, result.ownerMessage], latestMessage: result.ownerMessage, messageCount: current.messageCount + 1 }
        : current);
    } catch (requestError: any) {
      setError(requestError?.message ?? "Could not dispatch this room message.");
    } finally {
      setSending(false);
    }
  };

  const openCreate = () => {
    const task = openTasks[0];
    setCreateTaskId(task ? String(task.id) : "");
    setCreateTitle("");
    setCreateAgentIds(task ? [...new Set(["main", task.assigned_agent_id].filter(Boolean))] : ["main"]);
    setCreateError("");
    setCreateOpen(true);
  };

  const changeCreateTask = (value: string) => {
    setCreateTaskId(value);
    const task = tasks.find((row) => row.id === Number(value));
    setCreateAgentIds(task ? [...new Set(["main", task.assigned_agent_id].filter(Boolean))] : ["main"]);
  };

  const toggleCreateAgent = (agentId: string) => {
    setCreateAgentIds((current) => current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId]);
  };

  const createRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    const taskId = Number(createTaskId);
    if (!Number.isInteger(taskId) || createBusy) return;
    setCreateBusy(true);
    setCreateError("");
    try {
      const result = await api.createAgentRoom({ workspaceId, taskId, title: createTitle.trim() || undefined, agentIds: createAgentIds });
      setCreateOpen(false);
      setDetail(result.room);
      setMobileChatOpen(true);
      await loadRooms(result.room.id);
    } catch (requestError: any) {
      setCreateError(requestError?.message ?? "Could not create the room.");
    } finally {
      setCreateBusy(false);
    }
  };

  const toggleArchive = async () => {
    if (!detail || activeRun || !window.confirm(`${detail.status === "open" ? "Archive" : "Reopen"} room #${detail.id}?`)) return;
    setError("");
    try {
      const result = await api.archiveAgentRoom(detail.id, detail.status === "open");
      setDetail(result.room);
      await loadRooms(detail.id);
    } catch (requestError: any) {
      setError(requestError?.message ?? "Could not update this room.");
    }
  };

  const senderName = (message: AgentRoomMessage) => {
    if (message.senderType === "owner") return "You · CEO";
    if (message.senderType === "system") return "Julie System";
    return memberMap.get(message.senderId)?.displayName ?? message.senderId;
  };

  return (
    <section className={`agent-rooms-view${mobileChatOpen ? " mobile-chat-open" : ""}`}>
      <aside className="room-list-pane">
        <div className="messenger-pane-head"><div><strong>Task rooms</strong><span>{rooms.length} persistent room{rooms.length === 1 ? "" : "s"}</span></div><button className="messenger-new-session" onClick={openCreate} disabled={openTasks.length === 0}>＋ Room</button></div>
        {loading && rooms.length === 0 ? <div className="messenger-empty">Loading task rooms…</div> : rooms.length === 0 ? <div className="room-list-empty"><strong>No task rooms yet</strong><span>Create one from an open task and choose the collaborating agents.</span><button className="btn" onClick={openCreate} disabled={openTasks.length === 0}>Create task room</button></div> : (
          <div className="room-list">
            {rooms.map((room) => <button key={room.id} className={selectedRoomId === room.id ? "active" : ""} onClick={() => selectRoom(room.id)}>
              <span className={`room-list-icon ${room.status}`}>{room.members.slice(0, 3).map((member) => member.emoji || agentInitials(member.displayName)).join(" ")}</span>
              <span className="room-list-copy"><strong>{room.title}</strong><small>{room.task ? `#${room.task.id} · ${room.task.status ? STATUS_LABEL[room.task.status] : "Task deleted"}` : "Task deleted"} · {room.members.length} agents</small><em>{room.latestMessage ? `${senderName(room.latestMessage)}: ${room.latestMessage.text}` : "No messages"}</em></span>
              {room.activeRun && <i className="room-live-dot" title="Active room dispatch" />}
            </button>)}
          </div>
        )}
      </aside>

      <main className="room-chat-pane">
        {!detail || detailLoading ? <div className="messenger-chat-empty"><span>{detailLoading ? <span className="page-state-spinner" /> : "#"}</span><strong>{detailLoading ? "Loading room…" : "Choose a task room"}</strong><p>Confirmed agent responses and local delivery failures appear here.</p></div> : <>
          <header className="room-chat-head">
            <button className="messenger-mobile-back" onClick={() => setMobileChatOpen(false)} aria-label="Back to rooms">←</button>
            <div><strong>{detail.title}</strong><span>{detail.task ? `Task #${detail.task.id} · ${detail.task.status ? STATUS_LABEL[detail.task.status] : "Deleted"}` : "Linked task deleted"} · {detail.messageCount} messages</span></div>
            <span className={`room-state ${detail.status}`}>{detail.status}</span>
            <button className="room-archive" onClick={toggleArchive} disabled={Boolean(activeRun)}>{detail.status === "open" ? "Archive" : "Reopen"}</button>
          </header>

          <div className="room-members-strip">
            {detail.members.map((member) => <span key={member.agentId} title={`${member.role || "Role not configured"} · ${member.department || "No department"}`}><i>{member.emoji || agentInitials(member.displayName)}</i>{member.displayName}</span>)}
          </div>

          <div className="room-transcript" ref={logRef}>
            {detail.messages.map((message) => message.senderType === "system" ? <div className={`room-system-message ${message.deliveryState}`} key={message.id}><span>{message.text}</span><time>{taskTimestamp(message.createdAt)}</time></div> : (
              <article className={`room-message ${message.senderType}`} key={message.id}>
                <span className="room-message-avatar">{message.senderType === "owner" ? "You" : memberMap.get(message.senderId)?.emoji || agentInitials(senderName(message))}</span>
                <div><header><strong>{senderName(message)}</strong><span className={message.deliveryState}>{message.deliveryState}</span><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></header><Markdown text={message.text} /></div>
              </article>
            ))}
            {activeRun && <div className="room-dispatch-status"><span className="page-state-spinner" /><div><strong>{activeRun.currentAgentId ? `Waiting for ${memberMap.get(activeRun.currentAgentId)?.displayName ?? activeRun.currentAgentId}…` : "Starting room dispatch…"}</strong><span>{activeRun.completed} confirmed · {activeRun.failed} failed · {activeRun.remaining} remaining</span></div></div>}
          </div>

          {error && <div className="messenger-error" role="alert">{error}</div>}
          <form className="room-composer" onSubmit={sendRoomMessage}>
            <div className="room-recipient-picker"><span>Send sequentially to</span><div>{detail.members.map((member) => <label key={member.agentId} className={recipientIds.includes(member.agentId) ? "selected" : ""}><input type="checkbox" checked={recipientIds.includes(member.agentId)} onChange={() => toggleRecipient(member.agentId)} disabled={Boolean(activeRun) || detail.status !== "open"} /><i>{member.emoji || agentInitials(member.displayName)}</i>{member.displayName}</label>)}</div></div>
            <div className="room-compose-row"><textarea value={composer} onChange={(event) => setComposer(event.target.value)} placeholder={detail.status === "open" ? "Message the room…" : "Archived rooms are read-only"} rows={2} maxLength={20_000} disabled={sending || Boolean(activeRun) || detail.status !== "open"} /><button className="btn" disabled={sending || Boolean(activeRun) || !composer.trim() || recipientIds.length === 0 || detail.status !== "open"}>{activeRun ? "Agents talking…" : sending ? "Queuing…" : "Send to room"}</button></div>
          </form>
          <div className="messenger-truth">Owner messages are local. Agent messages are shown only after that agent's Gateway turn completes; failed deliveries are labeled as system failures.</div>
        </>}
      </main>

      {createOpen && <div className="task-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !createBusy) setCreateOpen(false); }}>
        <form className="room-create-dialog" onSubmit={createRoom} role="dialog" aria-modal="true" aria-labelledby="room-create-title">
          <header><div><span className="tasks-eyebrow">Agent collaboration</span><h3 id="room-create-title">Create task room</h3></div><button type="button" onClick={() => setCreateOpen(false)} disabled={createBusy}>×</button></header>
          <label><span>Linked open task</span><select value={createTaskId} onChange={(event) => changeCreateTask(event.target.value)} required><option value="">Choose task…</option>{openTasks.map((task) => <option key={task.id} value={task.id}>#{task.id} · {task.title} · {task.assigned_agent_id || "unassigned"}</option>)}</select></label>
          <label><span>Room title <small>optional</small></span><input value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} maxLength={200} placeholder="Defaults to task number and title" /></label>
          <fieldset><legend>Room agents</legend><p>Julie/main and the task's assigned agent are always included by the server.</p><div>{members.map((member) => <label key={member.agentId} className={createAgentIds.includes(member.agentId) ? "selected" : ""}><input type="checkbox" checked={createAgentIds.includes(member.agentId)} onChange={() => toggleCreateAgent(member.agentId)} /><i>{member.emoji || agentInitials(member.displayName)}</i><span><strong>{member.displayName}</strong><small>{member.role || member.agentId}</small></span></label>)}</div></fieldset>
          {createError && <div className="task-form-error" role="alert">{createError}</div>}
          <footer><button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)} disabled={createBusy}>Cancel</button><button className="btn" disabled={createBusy || !createTaskId}>{createBusy ? "Creating…" : "Create confirmed room"}</button></footer>
        </form>
      </div>}
    </section>
  );
}

// --- Agent Messenger: real Gateway DMs with multiple sessions per agent ---
type MessengerPane = "agents" | "sessions" | "chat";

function AgentMessengerPage() {
  const [workspaceId, setWorkspaceId] = useState(0);
  const [mode, setMode] = useState<"direct" | "rooms">("direct");
  const [organization, setOrganization] = useState<AgentOrganizationResponse | null>(null);
  const [overview, setOverview] = useState<AgentOverviewResponse | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentDetail, setAgentDetail] = useState<AgentDetailResponse | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState("");
  const [mobilePane, setMobilePane] = useState<MessengerPane>("agents");
  const transcriptRef = useRef<HTMLDivElement>(null);

  const loadInbox = useCallback(async (refresh = false) => {
    setLoading(true);
    setLoadError("");
    try {
      const workspaceData = await api.workspaces();
      const activeId = workspaceData.activeWorkspaceId || workspaceData.workspaces[0]?.id;
      if (!activeId) throw new Error("Create a workspace before opening Agent Messenger.");
      setWorkspaceId(activeId);
      const [orgData, overviewData, taskData] = await Promise.all([
        api.agentOrganization(activeId),
        api.agentOverview(refresh),
        api.tasks(activeId),
      ]);
      setOrganization(orgData);
      setOverview(overviewData);
      setTasks(taskData.tasks);
      setSelectedAgentId((current) => current && orgData.members.some((member) => member.agentId === current)
        ? current
        : orgData.members.find((member) => member.agentId === "main")?.agentId ?? orgData.members[0]?.agentId ?? null);
    } catch (requestError: any) {
      setLoadError(requestError?.message ?? "Could not load Agent Messenger.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadInbox(); }, [loadInbox]);

  useEffect(() => {
    if (!selectedAgentId) {
      setAgentDetail(null);
      setSelectedSessionId(null);
      setMessages([]);
      return;
    }
    let cancelled = false;
    setSessionsLoading(true);
    setChatError("");
    setMessages([]);
    api.agentDetail(selectedAgentId, true).then((data) => {
      if (cancelled) return;
      setAgentDetail(data);
      const latest = data.agent.activity.sessions.find((session) => Boolean(session.sessionId));
      setSelectedSessionId(latest?.sessionId ?? null);
    }).catch((requestError: any) => {
      if (!cancelled) {
        setAgentDetail(null);
        setChatError(requestError?.message ?? "Could not load this agent's sessions.");
      }
    }).finally(() => { if (!cancelled) setSessionsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedAgentId]);

  useEffect(() => {
    if (!selectedAgentId || !selectedSessionId) {
      setMessages([]);
      setHistoryLoading(false);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    setChatError("");
    api.agentHistory(selectedAgentId, selectedSessionId).then((data) => {
      if (!cancelled) setMessages(data.messages);
    }).catch((requestError: any) => {
      if (!cancelled) {
        setMessages([]);
        setChatError(requestError?.message ?? "Could not load this session history.");
      }
    }).finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [selectedAgentId, selectedSessionId]);

  useEffect(() => {
    if (!transcriptRef.current) return;
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [historyLoading, messages, sending]);

  const members = organization?.members ?? [];
  const activityMap = new Map((overview?.agents ?? []).map((agent) => [agent.id, agent]));
  const taskCountMap = new Map<string, number>();
  for (const task of tasks) {
    if (!task.assigned_agent_id || task.status === "done") continue;
    taskCountMap.set(task.assigned_agent_id, (taskCountMap.get(task.assigned_agent_id) ?? 0) + 1);
  }
  const needle = query.trim().toLowerCase();
  const filteredMembers = members.filter((member) => !needle || [member.displayName, member.agentId, member.role, member.department].some((value) => value?.toLowerCase().includes(needle)));
  const selectedMember = members.find((member) => member.agentId === selectedAgentId) ?? null;
  const sessions = (agentDetail?.agent.activity.sessions ?? []).filter((session): session is typeof session & { sessionId: string } => Boolean(session.sessionId));
  const selectedSession = sessions.find((session) => session.sessionId === selectedSessionId) ?? null;

  const activityLabel = (agentId: string) => {
    const activity = activityMap.get(agentId)?.activity;
    if (!activity) return { label: "Status unavailable", className: "unknown" };
    if (activity.state === "working") return { label: "Active run", className: "working" };
    if (activity.state === "no_active_run") return { label: "No active run", className: "idle" };
    if (activity.state === "no_sessions") return { label: "No sessions", className: "empty" };
    return { label: "Status unavailable", className: "unknown" };
  };

  const chooseAgent = (agentId: string) => {
    if (agentId === selectedAgentId) { setMobilePane("sessions"); return; }
    setSelectedAgentId(agentId);
    setSelectedSessionId(null);
    setMessages([]);
    setComposer("");
    setSendStatus("");
    setChatError("");
    setMobilePane("sessions");
  };

  const chooseSession = (sessionId: string | null) => {
    setSelectedSessionId(sessionId);
    setMessages([]);
    setComposer("");
    setChatError("");
    setSendStatus("");
    setMobilePane("chat");
  };

  const sendDirectMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = composer.trim();
    if (!selectedAgentId || !text || sending) return;
    setSending(true);
    setChatError("");
    setSendStatus("Waiting for the real Gateway and agent reply…");
    try {
      const result = await api.sendAgentMessage(selectedAgentId, text, selectedSessionId);
      setMessages(result.messages);
      setSelectedSessionId(result.session.sessionId);
      setComposer("");
      setSendStatus("Gateway reply completed");
      const detail = await api.agentDetail(selectedAgentId, true).catch(() => null);
      if (detail) setAgentDetail(detail);
      const refreshedOverview = await api.agentOverview(true).catch(() => null);
      if (refreshedOverview) setOverview(refreshedOverview);
    } catch (requestError: any) {
      setSendStatus("");
      setChatError(requestError?.message ?? "The Gateway did not complete this message.");
    } finally {
      setSending(false);
    }
  };

  if (loading && !organization) return <PageState kind="loading" title="Opening Agent Messenger" detail="Reading the active workspace roster, real Gateway sessions, and Julie task ownership." />;
  if (loadError && !organization) return <PageState kind="error" title="Agent Messenger unavailable" detail={loadError} onRetry={() => loadInbox(true)} />;
  if (!organization) return null;

  return (
    <section className={`agent-messenger mobile-pane-${mobilePane}`}>
      <header className="messenger-head">
        <div><span className="tasks-eyebrow">Office communications</span><h2>Agent Messenger</h2><p>{mode === "direct" ? "Direct messages use real, agent-owned Gateway sessions. Opening or browsing never creates a session." : "Task rooms relay a shared confirmed transcript through each participating agent's own Gateway session."}</p></div>
        <div className="messenger-head-actions"><div className="messenger-mode-toggle"><button className={mode === "direct" ? "active" : ""} onClick={() => setMode("direct")}>Direct messages</button><button className={mode === "rooms" ? "active" : ""} onClick={() => setMode("rooms")}>Task rooms</button></div><span>{organization.workspace.name}</span><button className="btn-secondary" onClick={() => loadInbox(true)} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div>
      </header>

      {mode === "direct" && <div className="messenger-shell">
        <aside className="messenger-agents">
          <div className="messenger-pane-head"><div><strong>Direct messages</strong><span>{members.length} office agents</span></div></div>
          <label className="messenger-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search agents…" /></label>
          <div className="messenger-agent-list">
            {filteredMembers.map((member) => {
              const state = activityLabel(member.agentId);
              const overviewAgent = activityMap.get(member.agentId);
              return <button key={member.agentId} className={selectedAgentId === member.agentId ? "active" : ""} onClick={() => chooseAgent(member.agentId)}>
                <span className="messenger-avatar">{member.emoji || agentInitials(member.displayName)}<i className={state.className} title={state.label} /></span>
                <span className="messenger-agent-copy"><strong>{member.displayName}</strong><small>{member.role || "Role not configured"}</small><em>{state.label} · {overviewAgent?.activity.visibleSessions ?? 0} session{overviewAgent?.activity.visibleSessions === 1 ? "" : "s"}</em></span>
                {(taskCountMap.get(member.agentId) ?? 0) > 0 && <span className="messenger-task-count" title="Open assigned tasks">{taskCountMap.get(member.agentId)}</span>}
              </button>;
            })}
            {filteredMembers.length === 0 && <div className="messenger-empty">No agents match this search.</div>}
          </div>
        </aside>

        <aside className="messenger-sessions">
          <div className="messenger-pane-head">
            <button className="messenger-mobile-back" onClick={() => setMobilePane("agents")} aria-label="Back to agents">←</button>
            <div><strong>{selectedMember?.displayName || "Choose an agent"}</strong><span>{selectedMember?.department || "No department configured"}</span></div>
            {selectedMember && <button className="messenger-new-session" onClick={() => chooseSession(null)}>＋ New</button>}
          </div>
          {sessionsLoading ? <div className="messenger-empty">Loading real sessions…</div> : !selectedMember ? <div className="messenger-empty">Select an agent to view their conversations.</div> : (
            <div className="messenger-session-list">
              <button className={selectedSessionId === null ? "active draft" : "draft"} onClick={() => chooseSession(null)}><span>＋</span><div><strong>New session</strong><small>Created only after you send</small></div></button>
              {sessions.map((session) => <button key={session.sessionId} className={selectedSessionId === session.sessionId ? "active" : ""} onClick={() => chooseSession(session.sessionId)}>
                <span className={session.hasActiveRun ? "session-mark active" : "session-mark"}>◉</span>
                <div><strong>{session.displayName}</strong><small>{session.hasActiveRun ? "Active run" : session.status || "Status not reported"} · {relativeAgentTime(session.lastActivityAt)}</small><em>{session.model || "Model not reported"}</em></div>
              </button>)}
              {sessions.length === 0 && <div className="messenger-empty compact">No existing sessions. A new one starts only when you send a message.</div>}
            </div>
          )}
        </aside>

        <main className="messenger-chat">
          <div className="messenger-chat-head">
            <button className="messenger-mobile-back" onClick={() => setMobilePane("sessions")} aria-label="Back to sessions">←</button>
            <span className="messenger-avatar large">{selectedMember?.emoji || (selectedMember ? agentInitials(selectedMember.displayName) : "◇")}</span>
            <div><strong>{selectedMember?.displayName || "Agent conversation"}</strong><span>{selectedSession ? selectedSession.displayName : selectedMember ? "New session · not created yet" : "Choose an agent"}</span></div>
            {selectedSession?.hasActiveRun && <span className="messenger-live-badge">Active run</span>}
          </div>

          <div className="messenger-transcript" ref={transcriptRef}>
            {!selectedMember ? <div className="messenger-chat-empty"><span>✉</span><strong>Choose an office agent</strong><p>Each agent keeps its own real Gateway sessions and sanitized history.</p></div>
              : historyLoading ? <div className="messenger-chat-empty"><span className="page-state-spinner" /><strong>Loading conversation…</strong></div>
              : messages.length === 0 ? <div className="messenger-chat-empty"><span>{selectedMember.emoji || "◇"}</span><strong>{selectedSessionId ? "No text messages in this session" : `Start a new DM with ${selectedMember.displayName}`}</strong><p>{selectedSessionId ? "Tool and control rows are intentionally omitted." : "The session will be created only when this first message is sent."}</p></div>
              : messages.map((message) => <article key={`${message.id}-${message.timestamp ?? "none"}`} className={`messenger-message ${message.role}`}>
                  <div className="messenger-message-avatar">{message.role === "user" ? "You" : selectedMember.emoji || agentInitials(selectedMember.displayName)}</div>
                  <div><header><strong>{message.role === "user" ? "You" : selectedMember.displayName}</strong><time>{message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Time not reported"}</time></header><Markdown text={message.text} /></div>
                </article>)}
            {sending && <div className="messenger-waiting"><span className="page-state-spinner" /><span>{sendStatus}</span></div>}
          </div>

          {chatError && <div className="messenger-error" role="alert">{chatError}</div>}
          {selectedMember && <form className="messenger-composer" onSubmit={sendDirectMessage}>
            <textarea value={composer} onChange={(event) => setComposer(event.target.value)} placeholder={`Message ${selectedMember.displayName}…`} rows={1} maxLength={20_000} disabled={sending} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            <button className="btn" disabled={sending || !composer.trim()}>{sending ? "Working…" : "Send"}</button>
          </form>}
          <div className="messenger-truth">History and run state come from OpenClaw Gateway. Julie stores no duplicate DM transcript and exposes no session keys.</div>
        </main>
      </div>}
      {mode === "rooms" && <AgentRoomsView workspaceId={workspaceId} members={members} tasks={tasks} />}
    </section>
  );
}

type ChatLiveStatus = {
  state: "idle" | "sending" | "accepted" | "status" | "responding" | "finalizing" | "complete" | "error" | "aborted";
  phase?: string | null;
  retry?: { attempt?: number; maxAttempts?: number; reason?: string } | null;
  error?: string;
  reconnecting?: boolean;
};

function chatRunStatusState(state: ChatRunSnapshot["state"] | undefined | null): ChatLiveStatus["state"] {
  switch (state) {
    case "sending": return "sending";
    case "accepted": return "accepted";
    case "status": return "status";
    case "responding": return "responding";
    case "finalizing": return "finalizing";
    default: return "idle";
  }
}

function chatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function chatLiveStatusLabel(status: ChatLiveStatus): string {
  const phases: Record<string, string> = {
    waiting_for_state: "Waiting for the current session state…",
    preparing_workspace: "Preparing the workspace…",
    naming_worktree: "Naming the worktree…",
    creating_worktree: "Creating the worktree…",
    running_setup: "Running workspace setup…",
    provisioning_environment: "Provisioning the environment…",
    preparing_context: "Preparing conversation context…",
    memory_flushing: "Saving memory before the run…",
    starting_model: "Starting the model…",
  };
  let label = "";
  if (status.state === "sending") label = "Sending to the Gateway…";
  else if (status.state === "accepted") label = "Gateway received your message · Julie is working…";
  else if (status.state === "status") {
    label = status.phase ? phases[status.phase] ?? "Julie is preparing the run…" : "Julie is preparing the run…";
    if (status.retry?.reason === "rate_limit") {
      const attempt = status.retry.attempt ?? 1;
      const max = status.retry.maxAttempts;
      label = `Model rate-limited · retrying ${attempt}${max ? ` of ${max}` : ""}…`;
    }
  } else if (status.state === "responding") label = "Julie is responding live…";
  else if (status.state === "finalizing") label = "Gateway finished · saving the response…";
  else if (status.state === "complete") label = "Response complete";
  else if (status.state === "aborted") label = status.error || "Run stopped";
  else if (status.state === "error") label = status.error || "The run failed";
  if (status.reconnecting && status.state !== "complete" && status.state !== "error" && status.state !== "aborted") {
    label += " · reconnecting live updates…";
  }
  return label;
}

function ChatView() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [convId, setConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(null);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [conversationBusy, setConversationBusy] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<number | null>(null);
  const [conversationMenuOpen, setConversationMenuOpen] = useState(false);
  const [chatError, setChatError] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [streamedReply, setStreamedReply] = useState("");
  const [liveStatus, setLiveStatus] = useState<ChatLiveStatus>({ state: "idle" });
  const [createOpen, setCreateOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspaceDescription, setNewWorkspaceDescription] = useState("");
  const [createError, setCreateError] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const conversationPickerRef = useRef<HTMLDivElement>(null);

  const runActive = liveStatus.state === "sending" || liveStatus.state === "accepted" || liveStatus.state === "status"
    || liveStatus.state === "responding" || liveStatus.state === "finalizing";

  // The shell-mounted microphone must target the conversation the owner chose,
  // rather than creating a new one or guessing from Gateway history.
  useEffect(() => { setVoiceConversationId(convId); }, [convId]);

  const upsertMessage = useCallback((message: Message) => {
    setMessages((current) => {
      const existing = current.findIndex((row) => row.id === message.id);
      if (existing >= 0) return current.map((row, index) => index === existing ? message : row);
      return [...current, message].sort((left, right) => left.id - right.id);
    });
  }, []);

  const errorMessage = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback;

  // Load the real workspace inventory and honor the server-persisted active one.
  useEffect(() => {
    let stale = false;
    api.workspaces().then(d => {
      if (stale) return;
      setWorkspaces(d.workspaces);
      if (d.workspaces.length > 0) {
        const persisted = d.workspaces.some((workspace) => workspace.id === d.activeWorkspaceId)
          ? d.activeWorkspaceId
          : null;
        const activeId = persisted ?? d.workspaces[0].id;
        setActiveWorkspaceId(activeId);
      }
    }).catch((error) => {
      if (!stale) setChatError(errorMessage(error, "Could not load workspaces."));
    }).finally(() => {
      if (!stale) setLoadingWorkspaces(false);
    });
    return () => { stale = true; };
  }, []);

  // A workspace switch clears old scoped data immediately so conversations can
  // never be shown under the wrong workspace while the next request is pending.
  useEffect(() => {
    let stale = false;
    setConvs([]);
    setConvId(null);
    setMessages([]);
    if (!activeWorkspaceId) return () => { stale = true; };
    setLoadingConvs(true);
    setChatError("");
    api.conversations(activeWorkspaceId).then(d => {
      if (stale) return;
      setConvs(d.conversations);
      setConvId(d.conversations[0]?.id ?? null);
    }).catch((error) => {
      if (!stale) setChatError(errorMessage(error, "Could not load conversations."));
    }).finally(() => {
      if (!stale) setLoadingConvs(false);
    });
    return () => { stale = true; };
  }, [activeWorkspaceId]);

  useEffect(() => {
    let stale = false;
    setMessages([]);
    if (!convId) return () => { stale = true; };
    setLoadingMessages(true);
    setChatError("");
    api.messages(convId).then(d => {
      if (!stale) {
        setMessages(d.messages);
        // A server-monitored run may already be in flight for this conversation
        // (e.g. sent from another tab): restore its observable state.
        const run = d.activeRun;
        if (run) {
          if (run.state === "responding" || run.state === "finalizing") setStreamedReply(run.text);
          setLiveStatus({ state: chatRunStatusState(run.state), phase: run.phase, retry: run.retry });
        }
      }
    }).catch((error) => {
      if (!stale) setChatError(errorMessage(error, "Could not load messages."));
    }).finally(() => {
      if (!stale) setLoadingMessages(false);
    });
    return () => { stale = true; };
  }, [convId]);

  useEffect(() => {
    if (!createOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !workspaceBusy) setCreateOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen, workspaceBusy]);

  // Shared speaking store → "AI speaking" indicator with the one shared wave (Phase D-2 Chunk B).
  const speaking = useSpeaking();

  // Keep the log in sync when the global voice button posts into this conversation.
  useEffect(() => {
    const onVoice = () => {
      if (convId) api.messages(convId).then((d) => setMessages(d.messages)).catch(() => {});
    };
    window.addEventListener("julie:voice-message-sent", onVoice);
    return () => window.removeEventListener("julie:voice-message-sent", onVoice);
  }, [convId]);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [messages]);

  const switchWorkspace = async (nextId: number) => {
    if (!nextId || nextId === activeWorkspaceId || workspaceBusy) return;
    setWorkspaceBusy(true);
    setChatError("");
    try {
      await api.activateWorkspace(nextId);
      setActiveWorkspaceId(nextId);
    } catch (error) {
      setChatError(errorMessage(error, "Could not activate workspace."));
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const createWorkspace = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newWorkspaceName.trim();
    if (!name || workspaceBusy) return;
    setWorkspaceBusy(true);
    setCreateError("");
    try {
      const created = await api.createWorkspace(name, newWorkspaceDescription.trim());
      // Creation and activation are separate real mutations. Only switch the UI
      // after both calls succeed, then refresh from the server as source of truth.
      await api.activateWorkspace(created.workspace.id);
      const refreshed = await api.workspaces();
      setWorkspaces(refreshed.workspaces);
      setActiveWorkspaceId(created.workspace.id);
      setNewWorkspaceName("");
      setNewWorkspaceDescription("");
      setCreateOpen(false);
    } catch (error: any) {
      const duplicate = error?.status === 409;
      setCreateError(duplicate ? "A workspace with that name already exists." : errorMessage(error, "Could not create workspace."));
      // If creation succeeded but activation/refresh failed, keep the real list
      // synchronized instead of hiding the newly-created row.
      api.workspaces().then((data) => setWorkspaces(data.workspaces)).catch(() => {});
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const createConversation = async () => {
    if (!activeWorkspaceId || conversationBusy) return;
    setConversationBusy(true);
    setChatError("");
    try {
      const d = await api.createConversation(activeWorkspaceId, "New conversation");
      setConvs((current) => [d.conversation, ...current]);
      setConvId(d.conversation.id);
    } catch (error) {
      setChatError(errorMessage(error, "Could not create a conversation."));
    } finally {
      setConversationBusy(false);
    }
  };

  // ---- live conversation updates (SSE) ----
  // One persistent EventSource per conversation. The HTTP send returns as soon
  // as the real Gateway acknowledges chat.send; every later update (run phase,
  // streaming deltas, persisted reply) arrives on this channel.
  useEffect(() => {
    setStreamedReply("");
    setLiveStatus({ state: "idle" });
    setAttachment(null);
    if (!convId) return;
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const applyRunEvent = (run: Record<string, any>) => {
      switch (run.state) {
        case "sending":
          setStreamedReply("");
          setLiveStatus({ state: "sending" });
          break;
        case "accepted":
          setLiveStatus({ state: "accepted" });
          break;
        case "status":
          setLiveStatus({ state: "status", phase: run.phase ?? null, retry: run.retry ?? null });
          break;
        case "responding": {
          const delta = typeof run.deltaText === "string" ? run.deltaText : "";
          if (typeof run.snapshot === "string" && run.snapshot) setStreamedReply(run.snapshot);
          else if (run.replace === true) setStreamedReply(delta);
          else setStreamedReply((current) => current + delta);
          setLiveStatus({ state: "responding" });
          break;
        }
        case "finalizing":
          setLiveStatus({ state: "finalizing" });
          break;
        case "complete": {
          if (run.message) upsertMessage(run.message as Message);
          setStreamedReply("");
          setLiveStatus({ state: "idle" });
          break;
        }
        default: { // error / aborted
          setStreamedReply("");
          setLiveStatus({ state: "idle" });
          setChatError(String(run.error ?? (run.state === "aborted" ? "The run was stopped." : "The chat run failed.")));
        }
      }
    };

    const connect = () => {
      if (disposed) return;
      const source = new EventSource(`/api/conversations/${convId}/events`);
      source.onmessage = (event) => {
        if (disposed) return;
        try {
          const data = JSON.parse(event.data) as Record<string, any>;
          if (data?.type === "message" && data.message) {
            upsertMessage(data.message as Message);
          } else if (data?.type === "message-removed" && typeof data.id === "number") {
            // The Gateway rejected the turn: drop the optimistic user bubble.
            setMessages((current) => current.filter((row) => row.id !== data.id));
          } else if (data?.type === "hello" && data.activeRun) {
            // Reconnect / late join: restore the observable state of a run the
            // server is still monitoring instead of showing a frozen UI.
            const run = data.activeRun as ChatRunSnapshot;
            if (run.state === "responding" || run.state === "finalizing") setStreamedReply(String(run.text ?? ""));
            setLiveStatus({ state: chatRunStatusState(run.state), phase: run.phase, retry: run.retry });
          } else if (data?.type === "run") {
            applyRunEvent(data);
          }
        } catch { /* malformed frame: ignore */ }
      };
      source.onerror = () => {
        source.close();
        if (disposed) return;
        setLiveStatus((current) => current.state === "idle" ? current : { ...current, reconnecting: true });
        reconnectTimer = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [convId, upsertMessage]);

  // Close the conversation picker on outside click / Escape.
  useEffect(() => {
    if (!conversationMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!conversationPickerRef.current?.contains(event.target as Node)) setConversationMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConversationMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [conversationMenuOpen]);

  const send = async () => {
    if (!convId || busy || runActive) return;
    const text = input.trim();
    const file = attachment;
    if (!text && !file) return;
    setBusy(true);
    setChatError("");
    setInput("");
    setAttachment(null);
    setStreamedReply("");
    setLiveStatus({ state: "sending" });
    try {
      const result = file
        ? await api.uploadChatAttachment(convId, text, file)
        : await api.sendMessage(convId, text);
      if (result.userMessage) upsertMessage(result.userMessage);
      // 202 = the real Gateway acknowledged the send; streaming continues via SSE.
      setLiveStatus({ state: "accepted" });
    } catch (error: any) {
      setInput(text);
      if (file) setAttachment(file);
      setLiveStatus({ state: "idle" });
      setStreamedReply("");
      setChatError(error?.status === 409
        ? "Julie is still working in this conversation — wait for the current run to finish."
        : errorMessage(error, file ? "Attachment could not be sent." : "Message could not be sent."));
    } finally {
      setBusy(false);
    }
  };

  const removeConversation = async (id: number) => {
    if (conversationBusy) return;
    if (!window.confirm("Delete this conversation? This cannot be undone.")) return;
    setConversationBusy(true);
    setDeletingConversationId(id);
    setChatError("");
    try {
      await api.deleteConversation(id);
      const next = convs.filter((conversation) => conversation.id !== id);
      setConvs(next);
      if (convId === id) setConvId(next[0]?.id ?? null);
      setConversationMenuOpen(false);
    } catch (error: any) {
      setChatError(error?.status === 409
        ? "Julie is still working in this conversation — it can only be deleted between runs."
        : errorMessage(error, "Could not delete conversation."));
    } finally {
      setDeletingConversationId(null);
      setConversationBusy(false);
    }
  };

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (file) {
      if (file.size > 8 * 1024 * 1024) {
        setChatError("Files up to 8 MB are supported (images up to 6 MB).");
        return;
      }
      setChatError("");
      setAttachment(file);
    }
  };

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const activeConversation = convs.find((conversation) => conversation.id === convId);

  return (
    <section className="chat-page">
      <div className="chat-page-heading">
        <div>
          <div className="chat-eyebrow">Workspace conversation</div>
          <h2>{activeWorkspace?.name ?? (loadingWorkspaces ? "Loading…" : "Chat")}</h2>
          {activeWorkspace?.description && <p>{activeWorkspace.description}</p>}
        </div>
        {activeConversation && <span className="chat-context-pill">{activeConversation.title}</span>}
      </div>

      <div className="card chat-shell">
        <div className="chat-toolbar">
          <label className="chat-toolbar-field workspace-field">
            <span>Workspace</span>
            <select
              className="conv-select"
              value={activeWorkspaceId ?? ""}
              onChange={(event) => switchWorkspace(Number(event.target.value))}
              disabled={loadingWorkspaces || workspaceBusy || workspaces.length === 0}
            >
              {workspaces.length === 0 && <option value="">No workspaces</option>}
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          </label>
          <button className="chat-toolbar-button" onClick={() => { setCreateError(""); setCreateOpen(true); }}>
            <span aria-hidden="true">＋</span><span>Workspace</span>
          </button>

          <div className="chat-toolbar-field conversation-field">
            <span>Conversation</span>
            <div className="conv-picker" ref={conversationPickerRef}>
              <button
                type="button"
                className="conv-select conv-picker-trigger"
                onClick={() => setConversationMenuOpen((open) => !open)}
                aria-haspopup="listbox"
                aria-expanded={conversationMenuOpen}
                disabled={!activeWorkspaceId || loadingConvs}
              >
                <span className="conv-picker-label">
                  {loadingConvs
                    ? "Loading conversations…"
                    : !activeWorkspaceId
                      ? "Create a workspace first"
                      : convs.length === 0
                        ? "No conversations"
                        : activeConversation?.title ?? "Select conversation"}
                </span>
                <span aria-hidden="true" className="conv-picker-caret">▾</span>
              </button>
              {conversationMenuOpen && (
                <div className="conv-picker-menu" role="listbox" aria-label="Conversations">
                  {convs.length === 0 && <div className="conv-picker-empty">No conversations yet</div>}
                  {convs.map((conversation) => (
                    <div
                      key={conversation.id}
                      role="option"
                      aria-selected={conversation.id === convId}
                      tabIndex={0}
                      className={`conv-picker-row${conversation.id === convId ? " active" : ""}`}
                      onClick={() => { setConvId(conversation.id); setConversationMenuOpen(false); }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setConvId(conversation.id);
                          setConversationMenuOpen(false);
                        }
                      }}
                    >
                      <span className="conv-picker-title" title={conversation.title}>{conversation.title}</span>
                      <button
                        type="button"
                        className="conv-picker-delete"
                        onClick={(event) => { event.stopPropagation(); void removeConversation(conversation.id); }}
                        disabled={conversationBusy || deletingConversationId === conversation.id}
                        aria-label={`Delete conversation ${conversation.title}`}
                        title="Delete conversation"
                      >
                        {deletingConversationId === conversation.id ? "…" : "🗑"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button className="chat-toolbar-button icon-only" onClick={createConversation}
            disabled={!activeWorkspaceId || conversationBusy} aria-label="Create conversation" title="Create conversation">
            {conversationBusy ? "…" : "＋"}
          </button>
        </div>

        {chatError && <div className="chat-alert" role="alert">{chatError}</div>}
        {speaking && (
          <div className="chat-speaking-indicator">
            <Wave bars={14} className="chat-speaking-wave" />
            Julie is speaking…
          </div>
        )}
        <div className="chat-log" ref={logRef}>
          {(loadingConvs || loadingMessages) && <div className="chat-empty">Loading conversation…</div>}
          {!loadingConvs && !loadingMessages && activeWorkspaceId && !convId && (
            <div className="chat-empty">
              <strong>No conversation in this workspace</strong>
              <span>Create one to start talking with Julie.</span>
              <button className="btn" onClick={createConversation} disabled={conversationBusy}>New conversation</button>
            </div>
          )}
          {!loadingWorkspaces && workspaces.length === 0 && (
            <div className="chat-empty">
              <strong>No workspace yet</strong>
              <span>Create a workspace before starting a conversation.</span>
              <button className="btn" onClick={() => setCreateOpen(true)}>Create workspace</button>
            </div>
          )}
          {!loadingMessages && convId && messages.length === 0 && (
            <div className="chat-empty"><strong>Ready when you are</strong><span>Send the first message in this conversation.</span></div>
          )}
          {messages.map(m => (
            <div key={m.id} className={`msg ${m.role}`}>
              {m.role === "assistant" ? <Markdown text={m.text} /> : <span className="msg-plain">{m.text}</span>}
            </div>
          ))}
          {runActive && (
            <>
              {streamedReply && (
                <div className="msg assistant streaming"><Markdown text={streamedReply} /></div>
              )}
              <div className="chat-run-status" role="status" aria-live="polite">
                <span className="chat-run-spinner" aria-hidden="true" />
                <span>{chatLiveStatusLabel(liveStatus)}</span>
              </div>
            </>
          )}
        </div>
        {attachment && (
          <div className="chat-attachments">
            <span className="chat-attachment-chip" title={`${attachment.name} — ${attachment.type || "unknown type"}`}>
              <span className="chat-attachment-name">{attachment.name}</span>
              <span className="chat-attachment-size">{chatFileSize(attachment.size)}</span>
              <button type="button" className="chat-attachment-remove" onClick={() => setAttachment(null)}
                aria-label={`Remove attachment ${attachment.name}`}>×</button>
            </span>
          </div>
        )}
        <div className="chat-input">
          <input ref={fileInputRef} type="file" accept={CHAT_ATTACHMENT_ACCEPT} onChange={handleFileSelected} style={{ display: "none" }} />
          <button type="button" className="chat-attach-button" onClick={() => fileInputRef.current?.click()}
            disabled={!convId || busy || runActive} aria-label="Attach a file" title="Attach a file (image, PDF, or text)">
            📎
          </button>
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
          }} placeholder={convId ? `Message Julie in ${activeWorkspace?.name ?? "this workspace"}…` : "Create a conversation to begin"}
            disabled={!convId || busy} />
          <button className="send-btn" onClick={() => void send()}
            disabled={busy || runActive || !convId || (!input.trim() && !attachment)}>
            {busy ? "Sending…" : runActive ? "Working…" : "Send"}
          </button>
        </div>
      </div>

      {createOpen && (
        <div className="dialog-backdrop" onMouseDown={() => !workspaceBusy && setCreateOpen(false)}>
          <div className="workspace-dialog card" role="dialog" aria-modal="true" aria-labelledby="create-workspace-title"
            onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" onClick={() => setCreateOpen(false)} disabled={workspaceBusy} aria-label="Close">×</button>
            <div className="chat-eyebrow">New workspace</div>
            <h2 id="create-workspace-title">Create a focused space</h2>
            <p>Conversations and tasks stay scoped to this workspace.</p>
            <form onSubmit={createWorkspace} className="workspace-form">
              <label>
                <span>Name</span>
                <input autoFocus value={newWorkspaceName} onChange={(event) => setNewWorkspaceName(event.target.value)}
                  maxLength={120} placeholder="e.g. Product launch" required disabled={workspaceBusy} />
              </label>
              <label>
                <span>Description <small>optional</small></span>
                <textarea value={newWorkspaceDescription} onChange={(event) => setNewWorkspaceDescription(event.target.value)}
                  maxLength={2000} rows={4} placeholder="What is this workspace for?" disabled={workspaceBusy} />
              </label>
              {createError && <div className="chat-alert" role="alert">{createError}</div>}
              <div className="dialog-actions">
                <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)} disabled={workspaceBusy}>Cancel</button>
                <button type="submit" className="btn" disabled={workspaceBusy || !newWorkspaceName.trim()}>
                  {workspaceBusy ? "Creating…" : "Create & activate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

// --- Task Operations Board ---
type TaskEditorState = {
  title: string;
  description: string;
  status: Task["status"];
  priority: Task["priority"];
  assignedAgentId: string;
};

const EMPTY_TASK_EDITOR: TaskEditorState = {
  title: "",
  description: "",
  status: "backlog",
  priority: 2,
  assignedAgentId: "",
};

const TASK_PRIORITY: Record<Task["priority"], { label: string; className: string }> = {
  1: { label: "High", className: "high" },
  2: { label: "Medium", className: "medium" },
  3: { label: "Low", className: "low" },
};

function taskTimestamp(value?: string | null): string {
  if (!value) return "No date";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Unknown date";
  const delta = Date.now() - parsed;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.max(1, Math.floor(delta / 60_000))}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  if (delta < 604_800_000) return `${Math.floor(delta / 86_400_000)}d ago`;
  return new Date(parsed).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function agentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2)).toUpperCase();
}

function BoardView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [runningTaskIds, setRunningTaskIds] = useState<number[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(0);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [agents, setAgents] = useState<AgentAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [agentError, setAgentError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Task["status"]>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "1" | "2" | "3">("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [view, setView] = useState<"board" | "list">("board");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState<TaskEditorState>(EMPTY_TASK_EDITOR);
  const [activity, setActivity] = useState<TaskActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  const refreshTasks = useCallback(async (quiet = false) => {
    if (!activeWorkspaceId) return;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const data = await api.tasks(activeWorkspaceId);
      setTasks(data.tasks);
      setSummary(data.summary);
      setRunningTaskIds(data.runningTaskIds);
      if (editingTask) {
        const current = data.tasks.find((task) => task.id === editingTask.id);
        if (current) setEditingTask(current);
      }
    } catch (requestError: any) {
      setError(requestError?.message ?? "Could not load tasks.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [activeWorkspaceId, editingTask?.id]);

  useEffect(() => {
    let cancelled = false;
    api.workspaces().then((data) => {
      if (cancelled) return;
      setWorkspaces(data.workspaces);
      const initial = data.workspaces.some((workspace) => workspace.id === data.activeWorkspaceId)
        ? data.activeWorkspaceId
        : data.workspaces[0]?.id;
      setActiveWorkspaceId(initial ?? 0);
      if (!initial) setLoading(false);
    }).catch((requestError: any) => {
      if (!cancelled) {
        setError(requestError?.message ?? "Could not load workspaces.");
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    void refreshTasks();
    setAgentError("");
    api.agentAssignments(activeWorkspaceId)
      .then((data) => setAgents(data.agents.filter((agent) => agent.assigned)))
      .catch((requestError: any) => {
        setAgents([]);
        setAgentError(requestError?.message ?? "Agent roster unavailable.");
      });
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (runningTaskIds.length === 0) return;
    const timer = window.setInterval(() => { void refreshTasks(true); }, 4000);
    return () => window.clearInterval(timer);
  }, [runningTaskIds.length, refreshTasks]);

  const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
  const assignedAgents = [...agents].sort((left, right) => left.displayName.localeCompare(right.displayName));
  const normalizedQuery = query.trim().toLowerCase();
  const filteredTasks = tasks.filter((task) => {
    if (statusFilter !== "all" && task.status !== statusFilter) return false;
    if (priorityFilter !== "all" && task.priority !== Number(priorityFilter)) return false;
    if (assigneeFilter === "unassigned" && task.assigned_agent_id) return false;
    if (assigneeFilter !== "all" && assigneeFilter !== "unassigned" && task.assigned_agent_id !== assigneeFilter) return false;
    if (normalizedQuery && !`${task.id} ${task.title} ${task.description} ${task.assigned_agent_id}`.toLowerCase().includes(normalizedQuery)) return false;
    return true;
  });
  const visibleStatuses: readonly Task["status"][] = statusFilter === "all" ? TASK_STATUSES : [statusFilter];
  const filtersActive = Boolean(normalizedQuery || statusFilter !== "all" || priorityFilter !== "all" || assigneeFilter !== "all");

  const openCreate = () => {
    setEditingTask(null);
    setEditForm(EMPTY_TASK_EDITOR);
    setActivity([]);
    setActionError("");
    setEditorOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setEditForm({
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assignedAgentId: task.assigned_agent_id,
    });
    setActivity([]);
    setActionError("");
    setEditorOpen(true);
    setActivityLoading(true);
    api.taskActivity(task.id)
      .then((data) => setActivity(data.activity))
      .catch((requestError: any) => setActionError(requestError?.message ?? "Could not load task activity."))
      .finally(() => setActivityLoading(false));
  };

  const saveTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editForm.title.trim() || saving || !activeWorkspaceId) return;
    setSaving(true);
    setActionError("");
    try {
      const input = {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        status: editForm.status,
        priority: editForm.priority,
        assignedAgentId: editForm.assignedAgentId || null,
      };
      if (editingTask) await api.updateTask(editingTask.id, input);
      else await api.createTask({ workspaceId: activeWorkspaceId, ...input });
      setEditorOpen(false);
      setEditingTask(null);
      await refreshTasks();
    } catch (requestError: any) {
      setActionError(requestError?.message ?? "Could not save task.");
    } finally {
      setSaving(false);
    }
  };

  const removeTask = async () => {
    if (!editingTask || saving || !window.confirm(`Delete task #${editingTask.id}? This cannot be undone.`)) return;
    setSaving(true);
    setActionError("");
    try {
      await api.deleteTask(editingTask.id);
      setEditorOpen(false);
      setEditingTask(null);
      await refreshTasks();
    } catch (requestError: any) {
      setActionError(requestError?.message ?? "Could not delete task.");
    } finally {
      setSaving(false);
    }
  };

  const runTask = async () => {
    if (!editingTask || saving || !window.confirm(`Run task #${editingTask.id} with ${editingTask.assigned_agent_id || "Julie (main)"}?`)) return;
    setSaving(true);
    setActionError("");
    try {
      await api.runTask(editingTask.id);
      setEditorOpen(false);
      setEditingTask(null);
      await refreshTasks();
    } catch (requestError: any) {
      setActionError(requestError?.message ?? "Could not start task.");
    } finally {
      setSaving(false);
    }
  };

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setAssigneeFilter("all");
  };

  const statCards = [
    { label: "Open work", value: summary?.open ?? "—", detail: `${summary?.total ?? 0} total tasks`, tone: "orange" },
    { label: "In progress", value: summary?.active ?? "—", detail: runningTaskIds.length ? `${runningTaskIds.length} live agent run${runningTaskIds.length === 1 ? "" : "s"}` : "No live agent runs", tone: "blue" },
    { label: "High priority", value: summary?.highPriority ?? "—", detail: "Open priority-one work", tone: "red" },
    { label: "Completion", value: summary ? `${summary.completionRate}%` : "—", detail: `${summary?.done ?? 0} completed`, tone: "green" },
    { label: "Assigned", value: summary ? `${summary.assigned}/${summary.total}` : "—", detail: `${summary?.unassigned ?? 0} unassigned`, tone: "violet" },
  ];

  const renderAssignee = (task: Task) => {
    if (!task.assigned_agent_id) return <span className="task-assignee unassigned"><span className="task-agent-avatar">J</span><span>Julie · unassigned fallback</span></span>;
    const agent = agentMap.get(task.assigned_agent_id);
    const name = agent?.displayName ?? task.assigned_agent_id;
    return (
      <span className="task-assignee">
        <span className="task-agent-avatar">{agent?.emoji ?? agentInitials(name)}</span>
        <span>{name}</span>
      </span>
    );
  };

  return (
    <section className="tasks-page">
      <header className="tasks-hero">
        <div>
          <span className="tasks-eyebrow">Operations</span>
          <h2>Task command board</h2>
          <p>Priorities, ownership, execution, and review in one real workspace view.</p>
        </div>
        <div className="tasks-hero-actions">
          <label className="task-workspace-select">
            <span>Workspace</span>
            <select value={activeWorkspaceId} onChange={(event) => setActiveWorkspaceId(Number(event.target.value))} disabled={workspaces.length === 0}>
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          </label>
          <button className="btn task-new-button" onClick={openCreate} disabled={!activeWorkspaceId}>＋ New task</button>
        </div>
      </header>

      <div className="task-stats" aria-label="Task statistics">
        {statCards.map((stat) => (
          <article className={`task-stat ${stat.tone}`} key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.detail}</small>
          </article>
        ))}
      </div>

      <div className="task-toolbar">
        <label className="task-search">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks, descriptions, agents…" aria-label="Search tasks" />
        </label>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | Task["status"])} aria-label="Filter by status">
          <option value="all">All statuses</option>
          {TASK_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
        </select>
        <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as "all" | "1" | "2" | "3")} aria-label="Filter by priority">
          <option value="all">All priorities</option>
          <option value="1">High priority</option>
          <option value="2">Medium priority</option>
          <option value="3">Low priority</option>
        </select>
        <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} aria-label="Filter by assignee">
          <option value="all">All assignees</option>
          <option value="unassigned">Unassigned</option>
          {assignedAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.displayName}</option>)}
        </select>
        <div className="task-view-toggle" aria-label="Task layout">
          <button className={view === "board" ? "active" : ""} onClick={() => setView("board")} aria-pressed={view === "board"}>Board</button>
          <button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-pressed={view === "list"}>List</button>
        </div>
      </div>

      <div className="task-results-line">
        <span>Showing <strong>{filteredTasks.length}</strong> of {tasks.length}</span>
        {agentError && <span className="task-agent-warning" title={agentError}>Agent roster unavailable · IDs remain visible</span>}
        {filtersActive && <button onClick={clearFilters}>Clear filters</button>}
      </div>

      {loading && tasks.length === 0 ? (
        <PageState kind="loading" title="Loading task operations…" />
      ) : error ? (
        <PageState kind="error" title="Task board unavailable" detail={error} onRetry={() => void refreshTasks()} />
      ) : tasks.length === 0 ? (
        <PageState kind="empty" title="No tasks in this workspace" detail="Create the first task to establish ownership and workflow." action={<button className="btn" onClick={openCreate}>Create task</button>} />
      ) : view === "board" ? (
        <div className="task-board" aria-label="Task status board">
          {visibleStatuses.map((status) => {
            const rows = filteredTasks.filter((task) => task.status === status);
            return (
              <section className={`task-column status-${status}`} key={status}>
                <header>
                  <span className="task-status-dot" />
                  <h3>{STATUS_LABEL[status]}</h3>
                  <span className="task-column-count">{rows.length}</span>
                </header>
                <div className="task-column-body">
                  {rows.length === 0 && <div className="task-column-empty">No matching work</div>}
                  {rows.map((task) => {
                    const priority = TASK_PRIORITY[task.priority];
                    const running = runningTaskIds.includes(task.id);
                    return (
                      <article className={`task-operation-card${running ? " running" : ""}`} key={task.id}>
                        <div className="task-card-meta">
                          <span className={`task-priority ${priority.className}`}>{priority.label}</span>
                          <span>#{task.id}</span>
                          {running && <span className="task-running">Live</span>}
                        </div>
                        <button className="task-card-open" onClick={() => openEdit(task)} aria-label={`Open task ${task.id}: ${task.title}`}>
                          <strong>{task.title}</strong>
                          {task.description && <span>{task.description}</span>}
                        </button>
                        {renderAssignee(task)}
                        <footer>
                          <span>{task.session_linked ? "Agent context linked" : "No run yet"}</span>
                          <time dateTime={task.updated_at}>{taskTimestamp(task.updated_at)}</time>
                        </footer>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="task-list" role="table" aria-label="Task list">
          <div className="task-list-head" role="row">
            <span>Task</span><span>Status</span><span>Priority</span><span>Owner</span><span>Updated</span><span />
          </div>
          {filteredTasks.map((task) => {
            const priority = TASK_PRIORITY[task.priority];
            return (
              <div className="task-list-row" role="row" key={task.id}>
                <div className="task-list-title"><small>#{task.id}</small><strong>{task.title}</strong>{task.description && <span>{task.description}</span>}</div>
                <span className={`task-status-chip status-${task.status}`}><i />{STATUS_LABEL[task.status]}</span>
                <span className={`task-priority ${priority.className}`}>{priority.label}</span>
                {renderAssignee(task)}
                <time dateTime={task.updated_at}>{taskTimestamp(task.updated_at)}</time>
                <button className="task-row-open" onClick={() => openEdit(task)} aria-label={`Open task ${task.id}`}>→</button>
              </div>
            );
          })}
          {filteredTasks.length === 0 && <div className="task-list-empty">No tasks match these filters.</div>}
        </div>
      )}

      {editorOpen && (
        <div className="task-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditorOpen(false); }}>
          <section className="task-dialog" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title">
            <header>
              <div>
                <span className="tasks-eyebrow">{editingTask ? `Task #${editingTask.id}` : "New work"}</span>
                <h3 id="task-dialog-title">{editingTask ? "Task details" : "Create task"}</h3>
              </div>
              <button className="task-dialog-close" onClick={() => setEditorOpen(false)} disabled={saving} aria-label="Close task dialog">×</button>
            </header>
            <div className="task-dialog-grid">
              <form className="task-editor" onSubmit={saveTask}>
                <label>
                  <span>Title</span>
                  <input value={editForm.title} onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))} maxLength={500} required autoFocus={!editingTask} />
                </label>
                <label>
                  <span>Description <small>optional</small></span>
                  <textarea value={editForm.description} onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))} maxLength={5000} rows={6} placeholder="Outcome, constraints, and acceptance criteria…" />
                </label>
                <div className="task-editor-fields">
                  <label>
                    <span>Status</span>
                    <select value={editForm.status} onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value as Task["status"] }))} disabled={Boolean(editingTask && runningTaskIds.includes(editingTask.id))}>
                      {TASK_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Priority</span>
                    <select value={editForm.priority} onChange={(event) => setEditForm((current) => ({ ...current, priority: Number(event.target.value) as Task["priority"] }))}>
                      <option value={1}>High</option><option value={2}>Medium</option><option value={3}>Low</option>
                    </select>
                  </label>
                  <label>
                    <span>Assigned agent</span>
                    <select value={editForm.assignedAgentId} onChange={(event) => setEditForm((current) => ({ ...current, assignedAgentId: event.target.value }))} disabled={Boolean(editingTask && runningTaskIds.includes(editingTask.id)) || Boolean(agentError)}>
                      <option value="">Unassigned · Julie fallback</option>
                      {assignedAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.emoji ? `${agent.emoji} ` : ""}{agent.displayName}{agent.role ? ` · ${agent.role}` : ""}</option>)}
                    </select>
                  </label>
                </div>
                {editingTask?.last_run_output && (
                  <div className="task-run-output">
                    <span>Latest agent result</span>
                    <pre>{editingTask.last_run_output}</pre>
                  </div>
                )}
                {actionError && <div className="task-form-error" role="alert">{actionError}</div>}
                <div className="task-dialog-actions">
                  {editingTask && <button type="button" className="task-delete-button" onClick={removeTask} disabled={saving || runningTaskIds.includes(editingTask.id)}>Delete</button>}
                  <span />
                  <button type="button" className="btn-secondary" onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</button>
                  {editingTask?.status === "ready" && <button type="button" className="btn-secondary task-run-button" onClick={runTask} disabled={saving}>▶ Run with {editingTask.assigned_agent_id || "Julie"}</button>}
                  <button type="submit" className="btn" disabled={saving || !editForm.title.trim()}>{saving ? "Saving…" : editingTask ? "Save changes" : "Create task"}</button>
                </div>
              </form>

              {editingTask && (
                <aside className="task-activity-panel">
                  <div className="task-activity-heading"><span>Activity</span><small>{activity.length} events</small></div>
                  {activityLoading ? <div className="task-activity-empty">Loading timeline…</div> : activity.length === 0 ? <div className="task-activity-empty">No activity recorded.</div> : (
                    <ol>
                      {activity.map((event) => (
                        <li key={event.id}>
                          <span className={`task-event-icon ${event.actor_type}`}>{event.actor_type === "owner" ? "Y" : event.actor_type === "agent" ? "A" : "S"}</span>
                          <div>
                            <strong>{event.event_type.replaceAll("_", " ")}</strong>
                            <p>{event.details || "Recorded by Julie"}</p>
                            <small>{event.actor_id ? `${event.actor_id} · ` : ""}{taskTimestamp(event.created_at)}</small>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </aside>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
