import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { api, type Conversation, type GatewayStatus, type Message, type Task, type Workspace, type Agent, type Tool, type Analytics, TASK_STATUSES } from "./api";

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
function Shell({ route, navigate, onLogout }: { route: string; navigate: (to: string) => void; onLogout: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [gw, setGw] = useState<GatewayStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = () => api.gatewayStatus().then((s) => alive && setGw(s)).catch(() => alive && setGw({ connected: false }));
    tick();
    const t = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const NAV = [
    { path: "/", label: "Home", icon: "◈" },
    { path: "/chat", label: "Chat", icon: "◉" },
    { path: "/voice", label: "Voice", icon: "🎤" },
    { path: "/agents", label: "Agents", icon: "✦" },
    { path: "/tools", label: "Tools", icon: "⚙" },
    { path: "/analytics", label: "Insights", icon: "▲" },
    { path: "/terminal", label: "Terminal", icon: "▮" },
    { path: "/tasks", label: "Tasks", icon: "▦" },
  ];

  const renderView = () => {
    if (route === "/") return <HomePage navigate={navigate} gw={gw} />;
    if (route === "/chat") return <ChatView />;
    if (route === "/voice") return <VoicePage />;
    if (route === "/agents") return <AgentsPage />;
    if (route === "/tools") return <ToolsPage />;
    if (route === "/analytics") return <AnalyticsPage />;
    if (route === "/terminal") return <TerminalPage />;
    if (route === "/tasks") return <BoardView />;
    return <HomePage navigate={navigate} gw={gw} />;
  };

  return (
    <div className={`app${menuOpen ? " mobile-menu-open" : ""}`}>
      <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />
      <aside className={`sidebar${menuOpen ? " open" : ""}`}>
        <div className="brand">
          <div className="brand-orb" />
          <div><h1>Julie</h1><span>AiOS</span></div>
        </div>
        <div className="section-label">Command Center</div>
        {NAV.map(item => (
          <button key={item.path} className={`nav-item${route === item.path ? " active" : ""}`}
            onClick={() => { navigate(item.path); setMenuOpen(false); }}>
            <span>{item.icon}</span> {item.label}
          </button>
        ))}
        <div className="sidebar-footer" style={{ marginTop: "auto" }}>
          <button className="icon-btn" onClick={onLogout}>Sign out</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar" style={{ marginBottom: 20 }}>
          <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label="menu">☰</button>
          <GatewayPill status={gw} />
        </header>
        {renderView()}
      </main>

      <nav className="bottom-nav">
        {NAV.map(item => (
          <button key={item.path} className={route === item.path ? "active" : ""}
            onClick={() => navigate(item.path)}>
            <span className="icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function GatewayPill({ status }: { status: GatewayStatus | null }) {
  if (!status) return <span className="status-pill wait"><span className="status-dot" /> checking…</span>;
  if (status.connected) return <span className="status-pill ok"><span className="status-dot" /> System Online</span>;
  return <span className="status-pill err"><span className="status-dot" /> System Offline</span>;
}

// --- Home Page: Dashboard ---
function HomePage({ navigate, gw }: { navigate: (to: string) => void; gw: GatewayStatus | null }) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
    api.analytics().then(d => setAnalytics(d.analytics)).catch(() => {});
    api.agents().then(d => setAgents(d.agents)).catch(() => setAgents([]));
  }, []);

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: "1.8rem", marginBottom: 8 }}>{greeting}, Operator</h2>
        <p style={{ color: "var(--text-dim)" }}>Julie AiOS is {gw?.connected ? "online and ready" : "offline"}. Active agents: {agents.length || "0"}</p>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button className="btn" onClick={() => navigate("/chat")}>New Mission</button>
          <button className="btn" style={{ background: "rgba(255,255,255,0.1)" }} onClick={() => navigate("/agents")}>View Agents</button>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-title">System Pulse</div>
          <div className="orb-stage">
            <div className={`orb ${gw?.connected ? "idle" : "error"}`} style={{ width: 80, height: 80 }} />
            <div className="text-dim mt-4">{gw?.connected ? "All systems nominal" : "Gateway disconnected"}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Active Agents</div>
          <div className="card-content">
            {agents.length === 0 ? <div>No agents online.</div> :
              agents.slice(0, 4).map(a => (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span>{a.name || a.id}</span>
                  <span className="text-dim" style={{ fontSize: "0.8rem" }}>{a.status || "idle"}</span>
                </div>
              ))}
            <button className="icon-btn mt-4" onClick={() => navigate("/agents")}>View All →</button>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Quick Stats</div>
          <div className="card-content" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><div className="text-primary" style={{ fontSize: 24, fontWeight: 700 }}>{analytics?.taskCount || 0}</div><div className="text-dim" style={{ fontSize: 12 }}>Total Tasks</div></div>
            <div><div className="text-cyan" style={{ fontSize: 24, fontWeight: 700 }}>{analytics?.conversationCount || 0}</div><div className="text-dim" style={{ fontSize: 12 }}>Conversations</div></div>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Shortcuts</div>
          <div className="card-content">
            <button className="nav-item" onClick={() => navigate("/terminal")}>▮ Open Terminal</button>
            <button className="nav-item" onClick={() => navigate("/tasks")}>▦ Task Board</button>
            <button className="nav-item" onClick={() => navigate("/analytics")}>▲ Insights</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Voice Chat Page ---
function VoicePage() {
  const [status, setStatus] = useState<"idle" | "listening" | "processing" | "speaking" | "error">("idle");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [supported, setSupported] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [convId, setConvId] = useState<number | null>(null);
  const recRef = useRef<any>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(Boolean(SR));
  }, []);

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setStatus("error"); return; }
    try {
      const rec = new SR();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";
      rec.onstart = () => setStatus("listening");
      rec.onresult = (e: any) => {
        const text = e.results[0][0].transcript;
        setTranscript(text);
        submitVoice(text);
      };
      rec.onerror = (e: any) => { setStatus("error"); console.error(e); };
      rec.onend = () => setStatus((s) => (s === "listening" ? "idle" : s));
      recRef.current = rec;
      rec.start();
    } catch (e) { setStatus("error"); }
  };

  const stopListening = () => { recRef.current?.stop(); };

  const speak = (text: string) => {
    if (!ttsEnabled || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.onstart = () => setStatus("speaking");
    u.onend = () => setStatus("idle");
    window.speechSynthesis.speak(u);
  };

  const submitVoice = async (text: string) => {
    setStatus("processing");
    try {
      if (!convId) {
        const d = await api.createConversation(1, "Voice conversation");
        setConvId(d.conversation.id);
        await api.sendMessage(d.conversation.id, text);
      } else {
        await api.sendMessage(convId, text);
      }
      // Since sendMessage waits for the reply, we fetch it.
      const msgs = await api.messages(convId ?? 0);
      const last = msgs.messages[msgs.messages.length - 1];
      if (last) { setResponse(last.text); speak(last.text); }
      else setStatus("idle");
    } catch (e) { setStatus("error"); }
  };

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 40 }}>
      <div className={`orb ${status}`} style={{ width: 150, height: 150 }} />
      <div className="mt-4 text-dim" style={{ fontSize: "1.2rem", textTransform: "capitalize" }}>{status}</div>
      {!supported && <div className="error-text mt-4">SpeechRecognition not supported in this browser. Please use text input below.</div>}
      <div className="mt-4" style={{ display: "flex", gap: 10, width: "100%", maxWidth: 400 }}>
        <input placeholder="Text fallback input…" value={transcript} onChange={e => setTranscript(e.target.value)}
          onKeyDown={e => e.key === "Enter" && transcript.trim() && submitVoice(transcript)} />
        <button className="btn" onClick={() => transcript.trim() && submitVoice(transcript)} disabled={!transcript.trim()}>Send</button>
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
      {response && <div className="mt-4 p-4 card" style={{ width: "100%" }}><strong>Julie:</strong> {response}</div>}
    </div>
  );
}

// --- Agents Page ---
function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api.agents().then(d => { setAgents(d.agents); setLoading(false); }).catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <div className="empty-state">Scanning agent registry…</div>;
  if (error) return <div className="empty-state"><div>Agents unavailable: {error}</div><p className="text-dim">Could not reach the gateway agent registry.</p></div>;
  if (agents.length === 0) return <div className="empty-state">No agents found on the gateway.</div>;

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

// --- Tools Page ---
function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.tools().then(d => { setTools(d.tools); setLoading(false); }).catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <div className="empty-state">Enumerating tools…</div>;
  if (error) return <div className="empty-state"><div>Tools unavailable: {error}</div></div>;

  return (
    <div className="dashboard-grid">
      {tools.length === 0 && <div className="empty-state">No tools reported.</div>}
      {tools.map(t => (
        <div className="card" key={t.id}>
          <div className="card-title">{t.name || t.id}</div>
          <div className="card-content">{t.description || "No description provided."}</div>
          <div className="mt-4 text-dim" style={{ fontSize: "0.8rem" }}>Status: {t.status || "Unknown"}</div>
        </div>
      ))}
    </div>
  );
}

// --- Analytics Page ---
function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.analytics().then(d => setData(d.analytics)).catch(e => setError(e.message));
  }, []);

  if (error) return <div className="empty-state"><div>Analytics error: {error}</div></div>;
  if (!data) return <div className="empty-state">Crunching data…</div>;

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
            <div key={d.day} className="chart-bar" style={{ height: `${(d.count / maxDay) * 100}%`, width: 20, background: "var(--accent-violet)" }} title={`${d.day}: ${d.count}`} />
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

// --- Terminal Page ---
function TerminalPage() {
  const [lines, setLines] = useState<string[]>(["$ Julie AiOS Terminal ready."]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.host}/terminal-ws`);
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
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [convId, setConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.conversations(1).then(d => { setConvs(d.conversations); setConvId(d.conversations[0]?.id ?? null); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (convId) api.messages(convId).then(d => setMessages(d.messages)).catch(() => {});
    else setMessages([]);
  }, [convId]);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [messages]);

  const send = async () => {
    if (!input.trim() || !convId) return;
    setBusy(true);
    const text = input;
    setInput("");
    try {
      await api.sendMessage(convId, text);
      const d = await api.messages(convId);
      setMessages(d.messages);
    } catch (e) { console.error(e); }
    finally { setBusy(false); }
  };

  return (
    <section className="chat" style={{ flex: 1, display: "flex", flexDirection: "column", height: "80vh" }}>
      <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <select className="conv-select" value={convId ?? ""} onChange={e => setConvId(Number(e.target.value))}>
            {convs.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <button className="btn" onClick={async () => {
            const d = await api.createConversation(1, "New conversation");
            setConvs(c => [d.conversation, ...c]);
            setConvId(d.conversation.id);
          }}>+</button>
        </div>
        <div className="chat-log" ref={logRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {messages.map(m => <div key={m.id} className={`msg ${m.role}`}>{m.text}</div>)}
        </div>
        <div className="chat-input" style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Message Julie…" />
          <button className="send-btn" onClick={send} disabled={busy}>Send</button>
        </div>
      </div>
    </section>
  );
}

// --- Task Board View (Simplified/Reused) ---
function BoardView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  useEffect(() => { api.tasks(1).then(d => setTasks(d.tasks)).catch(() => {}); }, []);

  const add = async () => {
    if (!newTitle.trim()) return;
    await api.createTask(1, newTitle);
    setNewTitle("");
    api.tasks(1).then(d => setTasks(d.tasks));
  };

  return (
    <section style={{ flex: 1 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input className="conv-select" style={{ flex: 1, maxWidth: 400 }} value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="New task…" />
        <button className="btn" onClick={add}>Add Task</button>
      </div>
      <div className="dashboard-grid">
        {TASK_STATUSES.map(status => (
          <div key={status} className="card" style={{ minHeight: 200 }}>
            <div className="card-title">{STATUS_LABEL[status]}</div>
            <div className="card-content">
              {tasks.filter(t => t.status === status).map(t => <div key={t.id} className="task-card mb-4 p-4" style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>{t.title}</div>)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
