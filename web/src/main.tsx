import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { Markdown } from "./markdown";
import { VoiceFab, VOICE_STATE_EVENT, requestVoiceCapture } from "./voice-fab";
import { useSpeaking, speakWithTracking } from "./speaking";
import { Wave } from "./wave";
import { speechSupported, startSpeechRecognition, submitVoiceText, type VoiceState } from "./voice";
import { api, type Conversation, type GatewayStatus, type Message, type Task, type Workspace, type Agent, type Tool, type Analytics, type Weather, type Device, type Insights, type TrendingItem, TASK_STATUSES } from "./api";

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
    { path: "/terminal", label: "Terminal", icon: ">_" },
    { path: "/settings", label: "Settings", icon: "⚙" },
    { path: "/profile", label: "Profile", icon: "◎" },
    { path: "/future", label: "Future Lab", icon: "✦" },
  ] },
];

const BOTTOM_NAV: ShellNavItem[] = [
  { path: "/", label: "Home", icon: "⌂" },
  { path: "/chat", label: "Chat", icon: "◉" },
  { path: "/voice", label: "AI", icon: "◉", action: "voice" },
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

  // Center "AI" starts inline voice capture from any page; /voice remains
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
    if (route === "/voice") return <VoicePage />;
    if (route === "/tools") return <ToolsPage />;
    if (route === "/agents") return <AgentsPage />;
    if (route === "/analytics") return <AnalyticsPage />;
    if (route === "/terminal") return <TerminalPage />;
    if (route === "/tasks") return <BoardView />;
    if (route === "/profile") return <ProfilePage />;
    if (route === "/projects") return <ComingSoonPage title="Projects" icon="▤"
      description="A workspace-aware registry and read-only project browser is planned here."
      dependency="Requires the authenticated OpenCode bridge and owner-approved project roots." navigate={navigate} />;
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

      <main className="main">
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

      {/* Headless global voice controller. The footer-center AI item is the
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

function PageState({ kind, title, detail, onRetry }: {
  kind: "loading" | "empty" | "error";
  title: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <section className={`page-state ${kind}`} role={kind === "error" ? "alert" : "status"} aria-live="polite">
      <div className="page-state-symbol" aria-hidden="true">
        {kind === "loading" ? <span className="page-state-spinner" /> : kind === "error" ? "!" : "—"}
      </div>
      <strong>{title}</strong>
      {detail && <p>{detail}</p>}
      {onRetry && <button className="btn-secondary" onClick={onRetry}>Try again</button>}
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

// --- Agents Page ---
function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const loadAgents = useCallback(() => {
    setLoading(true);
    setError("");
    api.agents()
      .then((data) => setAgents(data.agents))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(loadAgents, [loadAgents]);

  if (loading) return <PageState kind="loading" title="Scanning agent registry" detail="Requesting the live agent list from OpenClaw Gateway." />;
  if (error) return <PageState kind="error" title="Agents unavailable" detail={error} onRetry={loadAgents} />;
  if (agents.length === 0) return <PageState kind="empty" title="No agents reported" detail="The gateway returned an empty agent registry." onRetry={loadAgents} />;

  const detail = agents.find(a => a.id === selected);
  return (
    <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 2fr" : "1fr", gap: 20 }}>
      <div className="card">
        <div className="card-title">Agent Directory</div>
        {agents.map(a => (
          <div key={a.id} className="nav-item" onClick={() => setSelected(a.id)} style={{ cursor: "pointer" }}>
            <div style={{ flex: 1 }}>
              <div>{a.name || a.id}</div>
              <div className="text-dim" style={{ fontSize: "0.8rem" }}>{a.model || "unknown model"}</div>
            </div>
            <span className="status-dot" style={{ background: a.status === "active" ? "var(--accent-primary)" : "var(--text-dim)" }} />
          </div>
        ))}
      </div>
      {detail && (
        <div className="card">
          <div className="card-title">Agent Profile: {detail.name || detail.id}</div>
          <div className="card-content">
            <div className="mb-4"><span className="text-dim">Identity:</span> {detail.id}</div>
            <div className="mb-4"><span className="text-dim">Model:</span> {detail.model || "N/A"}</div>
            <div className="mb-4"><span className="text-dim">Status:</span> {detail.status || "unknown"}</div>
            <div className="text-dim">Recent tasks and linked projects appear here when synced from the gateway.</div>
          </div>
        </div>
      )}
    </div>
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

// --- Chat View (Reused from existing) ---
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
  const [chatError, setChatError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspaceDescription, setNewWorkspaceDescription] = useState("");
  const [createError, setCreateError] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

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
      if (!stale) setMessages(d.messages);
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

  const send = async () => {
    if (!input.trim() || !convId) return;
    setBusy(true);
    const text = input;
    setInput("");
    try {
      await api.sendMessage(convId, text);
      const d = await api.messages(convId);
      setMessages(d.messages);
    } catch (error) {
      setInput(text);
      setChatError(errorMessage(error, "Message could not be sent."));
    }
    finally { setBusy(false); }
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

          <label className="chat-toolbar-field conversation-field">
            <span>Conversation</span>
            <select
              className="conv-select"
              value={convId ?? ""}
              onChange={(event) => setConvId(Number(event.target.value))}
              disabled={!activeWorkspaceId || loadingConvs || convs.length === 0}
            >
              {loadingConvs && <option value="">Loading conversations…</option>}
              {!loadingConvs && convs.length === 0 && <option value="">No conversations</option>}
              {convs.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}
            </select>
          </label>
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
        </div>
        <div className="chat-input">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }} placeholder={convId ? `Message Julie in ${activeWorkspace?.name ?? "this workspace"}…` : "Create a conversation to begin"}
            disabled={!convId || busy} />
          <button className="send-btn" onClick={send} disabled={busy || !convId || !input.trim()}>{busy ? "Sending…" : "Send"}</button>
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

// --- Task Board View (Enhanced) ---
function BoardView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number>(1);
  const [workspaces, setWorkspaces] = useState<{id: number; name: string}[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState<{title: string; description: string; status: string; priority: number}>({
    title: "",
    description: "",
    status: "backlog",
    priority: 2
  });

  // Load workspaces and tasks
  useEffect(() => {
    api.workspaces().then(d => {
      if (d.workspaces.length > 0) {
        const activeId = d.activeWorkspaceId || d.workspaces[0].id;
        setActiveWorkspaceId(activeId);
        setWorkspaces(d.workspaces.map(w => ({ id: w.id, name: w.name })));
      }
    });
  }, []);

  useEffect(() => {
    api.tasks(activeWorkspaceId).then(d => setTasks(d.tasks)).catch(() => {});
  }, [activeWorkspaceId]);

  const add = async () => {
    if (!newTitle.trim()) return;
    await api.createTask(activeWorkspaceId, newTitle, "backlog");
    setNewTitle("");
    api.tasks(activeWorkspaceId).then(d => setTasks(d.tasks));
  };

  const updateTask = async (id: number, patch: any) => {
    await api.updateTask(id, patch);
    api.tasks(activeWorkspaceId).then(d => setTasks(d.tasks));
  };

  const deleteTask = async (id: number) => {
    if (!confirm("Delete this task?")) return;
    await api.deleteTask(id);
    api.tasks(activeWorkspaceId).then(d => setTasks(d.tasks));
  };

  const runTask = async (id: number) => {
    if (!confirm("Run this task? This will execute it via the agent.")) return;
    await api.runTask(id);
    api.tasks(activeWorkspaceId).then(d => setTasks(d.tasks));
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setEditForm({
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority
    });
  };

  const saveEdit = async () => {
    if (!editingTask) return;
    await updateTask(editingTask.id, editForm);
    setEditingTask(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'backlog': return 'var(--text-dim)';
      case 'ready': return 'var(--accent-bright)';
      case 'in_progress': return 'var(--accent)';
      case 'pending_review': return '#AAB8CC';
      case 'done': return '#4ade80';
      case 'blocked': return '#ff3b30';
      default: return 'var(--text-dim)';
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <section style={{ flex: 1 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center" }}>
        <select 
          className="conv-select" 
          style={{ maxWidth: 200 }}
          value={activeWorkspaceId}
          onChange={e => setActiveWorkspaceId(Number(e.target.value))}
        >
          {workspaces.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <input 
          className="conv-select" 
          style={{ flex: 1, maxWidth: 400 }} 
          value={newTitle} 
          onChange={e => setNewTitle(e.target.value)} 
          placeholder="New task…" 
        />
        <button className="btn" onClick={add}>Add Task</button>
      </div>
      
      <div className="dashboard-grid">
        {TASK_STATUSES.map(status => (
          <div key={status} className="card" style={{ minHeight: 280 }}>
            <div className="card-title">{STATUS_LABEL[status]}</div>
            <div className="card-content" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tasks.filter(t => t.status === status).map(t => (
                <div 
                  key={t.id} 
                  className="task-card mb-4 p-4" 
                  style={{ 
                    background: "rgba(0,0,0,0.2)", 
                    borderRadius: 8,
                    border: `1px solid ${getStatusColor(t.status)}`,
                    cursor: 'pointer'
                  }}
                  onClick={() => openEdit(t)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, flex: 1 }}>{t.title}</div>
                    <span 
                      className="status-dot" 
                      style={{ 
                        background: getStatusColor(t.status),
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        marginRight: 8
                      }} 
                    />
                  </div>
                  {t.description && (
                    <div className="text-dim" style={{ fontSize: "0.8rem", marginBottom: 6 }}>
                      {t.description.length > 120 ? t.description.slice(0, 120) + "..." : t.description}
                    </div>
                  )}
                  {t.last_run_output && (
                    <div className="text-dim" style={{ fontSize: "0.75rem", marginBottom: 4 }}>
                      Run: {t.last_run_output.slice(0, 60)}{t.last_run_output.length > 60 ? "..." : ""}
                    </div>
                  )}
                  <div className="text-dim" style={{ fontSize: "0.7rem", marginTop: 8 }}>
                    {t.run_started_at ? `Started: ${formatDate(t.run_started_at)}` : `Created: ${formatDate(t.created_at)}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editingTask && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div className="card" style={{ width: "100%", maxWidth: 500, maxHeight: "90vh", overflow: "auto" }}>
            <div className="card-title">
              Edit Task
              <button className="icon-btn" onClick={() => setEditingTask(null)}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label className="text-dim" style={{ fontSize: "0.8rem", display: "block", marginBottom: 4 }}>Title</label>
                <input 
                  value={editForm.title} 
                  onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-dim" style={{ fontSize: "0.8rem", display: "block", marginBottom: 4 }}>Description</label>
                <textarea 
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  rows={4}
                  style={{ resize: "vertical" }}
                />
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label className="text-dim" style={{ fontSize: "0.8rem", display: "block", marginBottom: 4 }}>Status</label>
                  <select 
                    value={editForm.status}
                    onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                  >
                    {TASK_STATUSES.map(s => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label className="text-dim" style={{ fontSize: "0.8rem", display: "block", marginBottom: 4 }}>Priority</label>
                  <select 
                    value={editForm.priority}
                    onChange={e => setEditForm(f => ({ ...f, priority: Number(e.target.value) }))}
                  >
                    <option value="1">High</option>
                    <option value="2">Medium</option>
                    <option value="3">Low</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn" onClick={saveEdit}>Save</button>
                <button className="icon-btn" onClick={() => setEditingTask(null)}>Cancel</button>
                <button 
                  className="icon-btn" 
                  style={{ color: "#ff3b30", marginLeft: "auto" }}
                  onClick={() => { deleteTask(editingTask.id); setEditingTask(null); }}
                >
                  🗑 Delete
                </button>
              </div>
              {editingTask.status === 'ready' && (
                <button className="btn" style={{ background: "var(--accent)", color: "var(--on-accent)" }} onClick={() => runTask(editingTask.id)}>
                  ▶ Run Task
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
