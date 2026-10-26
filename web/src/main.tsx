import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { api, type Conversation, type GatewayStatus, type Message, type Task, type Workspace, TASK_STATUSES } from "./api";

// --- minimal SPA router (History API, no dependency) ---
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

export default function App() {
  const [route, navigate] = useRoute();
  const [authState, setAuthState] = useState<"loading" | "anon" | "authed">("loading");

  useEffect(() => {
    api.session()
      .then((s) => setAuthState(s.authenticated ? "authed" : "anon"))
      .catch(() => setAuthState("anon"));
  }, []);

  if (authState === "loading") return <div className="login-wrap"><div style={{ color: "var(--text-dim)" }}>Connecting…</div></div>;
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
    <form className="login-wrap" onSubmit={submit}>
      <div className="login-card">
        <h1>JULIE</h1>
        <p>AI OS · owner access</p>
        <input type="password" placeholder="Owner password" value={password} autoFocus
          onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="error-text">{error}</div>}
        <button className="btn" disabled={busy || !password}>{busy ? "Signing in…" : "Enter"}</button>
      </div>
    </form>
  );
}

function Shell({ route, navigate, onLogout }: { route: string; navigate: (to: string) => void; onLogout: () => void }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWs, setActiveWs] = useState<number | null>(null);
  const [gw, setGw] = useState<GatewayStatus | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const loadWorkspaces = useCallback(async () => {
    const data = await api.workspaces();
    setWorkspaces(data.workspaces);
    setActiveWs(data.activeWorkspaceId ?? data.workspaces[0]?.id ?? null);
  }, []);
  useEffect(() => { loadWorkspaces().catch(() => {}); }, [loadWorkspaces]);

  // gateway status: refresh on mount, then every 30s
  useEffect(() => {
    let alive = true;
    const tick = () => api.gatewayStatus().then((s) => alive && setGw(s)).catch(() => alive && setGw({ connected: false, error: "unreachable" }));
    tick();
    const t = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const view = route.startsWith("/tasks") ? "tasks" : "chat";
  const activeName = workspaces.find((w) => w.id === activeWs)?.name ?? "No workspace";

  return (
    <div className={`app${menuOpen ? " mobile-menu-open" : ""}`}>
      <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />
      <aside className={`sidebar${menuOpen ? " open" : ""}`}>
        <div className="brand">
          <div className="brand-orb" />
          <div>
            <h1>JULIE</h1>
            <span>AI OS</span>
          </div>
        </div>
        <div className="section-label">Views</div>
        <button className={`nav-item${view === "chat" ? " active" : ""}`} onClick={() => { navigate("/chat"); setMenuOpen(false); }}>◈ Chat</button>
        <button className={`nav-item${view === "tasks" ? " active" : ""}`} onClick={() => { navigate("/tasks"); setMenuOpen(false); }}>▦ Task Board</button>
        <div className="section-label">Workspaces</div>
        {workspaces.map((w) => (
          <button key={w.id} className={`ws-item${w.id === activeWs ? " active" : ""}`}
            onClick={async () => { setActiveWs(w.id); await api.activateWorkspace(w.id).catch(() => {}); setMenuOpen(false); }}>
            <span className="ws-dot" />{w.name}
          </button>
        ))}
        <NewWorkspace onCreate={async (name) => {
          const d = await api.createWorkspace(name);
          await loadWorkspaces();
          setActiveWs(d.workspace.id);
        }} />
        <div className="sidebar-footer">
          <button className="icon-btn" onClick={onLogout}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label="menu">☰</button>
          <h2>{activeName} — {view === "chat" ? "Chat" : "Task Board"}</h2>
          <GatewayPill status={gw} />
        </header>
        <div className="content">
          <OrbStage speaking={speaking} />
          {view === "chat"
            ? <ChatView workspaceId={activeWs} onSpeaking={setSpeaking} />
            : <BoardView workspaceId={activeWs} onSpeaking={setSpeaking} />}
        </div>
      </main>
    </div>
  );
}

function GatewayPill({ status }: { status: GatewayStatus | null }) {
  if (!status) return <span className="status-pill wait"><span className="status-dot" /> checking…</span>;
  if (status.connected) {
    return <span className="status-pill ok" title={`OpenClaw ${status.serverVersion ?? "?"}${status.latencyMs != null ? ` · ${status.latencyMs}ms` : ""}`}>
      <span className="status-dot" /> gateway online
    </span>;
  }
  return <span className="status-pill err" title={status.error ?? "gateway unreachable"}>
    <span className="status-dot" /> gateway offline
  </span>;
}

function NewWorkspace({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  if (!adding) return <button className="nav-item" onClick={() => setAdding(true)}>+ New workspace</button>;
  return (
    <div style={{ padding: "6px 8px", display: "flex", gap: 6 }}>
      <input className="conv-select" style={{ flex: 1, maxWidth: "none" }} autoFocus value={name}
        placeholder="Workspace name" onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { onCreate(name.trim()).finally(() => { setAdding(false); setName(""); }); } }} />
      <button className="icon-btn" onClick={() => { if (name.trim()) onCreate(name.trim()).finally(() => { setAdding(false); setName(""); }); }}>✓</button>
    </div>
  );
}

function OrbStage({ speaking }: { speaking: boolean }) {
  return (
    <div className="orb-stage" aria-hidden="true">
      <div className={`orb${speaking ? " speaking" : ""}`} />
      <div className="orb-caption">{speaking ? "JULIE is responding" : "JULIE standing by"}</div>
    </div>
  );
}

function ChatView({ workspaceId, onSpeaking }: { workspaceId: number | null; onSpeaking: (v: boolean) => void }) {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [convId, setConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef("");

  useEffect(() => {
    if (!workspaceId) { setConvs([]); setConvId(null); setMessages([]); return; }
    api.conversations(workspaceId).then((d) => {
      setConvs(d.conversations);
      setConvId((prev) => (prev && d.conversations.some((c: Conversation) => c.id === prev) ? prev : d.conversations[0]?.id ?? null));
    }).catch(() => setConvs([]));
  }, [workspaceId]);

  useEffect(() => {
    if (!convId) { setMessages([]); return; }
    api.messages(convId).then((d) => setMessages(d.messages)).catch(() => setMessages([]));
  }, [convId]);

  // SSE subscription: forward gateway chat deltas so replies render progressively.
  useEffect(() => {
    if (!convId) return;
    const es = new EventSource(`/api/conversations/${convId}/events`);
    es.onmessage = (ev) => {
      let d: { type?: string; deltaText?: string | null; replace?: boolean; snapshot?: string | null };
      try { d = JSON.parse(ev.data); } catch { return; }
      if (d.type === "delta") {
        if (d.snapshot != null) streamRef.current = d.snapshot;         // authoritative snapshot (already includes deltaText)
        else if (d.replace) streamRef.current = d.deltaText ?? "";      // full replacement
        else streamRef.current += d.deltaText ?? "";                    // append
        setStreamText(streamRef.current);
        onSpeaking(true);
      } else if (d.type === "final" || d.type === "error") {
        onSpeaking(false);
      }
    };
    return () => { es.close(); onSpeaking(false); };
  }, [convId, onSpeaking]);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [messages, busy, streamText]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !convId) return;
    setBusy(true); setError("");
    streamRef.current = ""; setStreamText("");
    const optimistic: Message = { id: -Date.now(), role: "user", text, created_at: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    setInput("");
    try {
      const res = await api.sendMessage(convId, text);
      setMessages((m) => [...m.filter((x) => x.id !== optimistic.id), { id: res.message.id, role: "assistant", text: res.message.text, created_at: res.message.created_at }]);
    } catch (e: any) {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setInput(text);
      setError(e.message);
    } finally {
      setBusy(false);
      streamRef.current = ""; setStreamText("");
      onSpeaking(false);
    }
  };

  const newConv = async () => {
    if (!workspaceId) return;
    const d = await api.createConversation(workspaceId, "New conversation");
    setConvs((c) => [d.conversation, ...c]);
    setConvId(d.conversation.id);
  };

  return (
    <section className="chat">
      <div className="topbar" style={{ background: "transparent", backdropFilter: "none", borderBottom: "1px solid var(--border)" }}>
        <div className="conv-picker">
          <select className="conv-select" value={convId ?? ""} onChange={(e) => setConvId(Number(e.target.value))}>
            {convs.length === 0 && <option value="">No conversations</option>}
            {convs.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <button className="icon-btn" onClick={newConv} title="New conversation">+ new</button>
        </div>
        {error && <span className="error-text" style={{ marginLeft: "auto" }}>{error}</span>}
      </div>
      <div className="chat-log" ref={logRef}>
        {messages.length === 0 && !busy &&
          <div className="empty-state">
            <div style={{ fontSize: 30 }}>◈</div>
            <div>Nothing here yet. Say something to JULIE — messages run through the real OpenClaw gateway.</div>
          </div>}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.text}
            <span className="msg-time">{new Date(m.created_at).toLocaleString()}</span>
          </div>
        ))}
        {busy && <div className="msg assistant">{streamText || "…thinking"}</div>}
      </div>
      <div className="chat-input">
        <textarea
          value={input}
          placeholder={convId ? "Message JULIE…" : "Create a conversation first"}
          disabled={!convId || busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
        />
        <button className="send-btn" onClick={send} disabled={busy || !convId || !input.trim()}>{busy ? "…" : "Send"}</button>
      </div>
    </section>
  );
}

function BoardView({ workspaceId, onSpeaking }: { workspaceId: number | null; onSpeaking: (v: boolean) => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!workspaceId) { setTasks([]); return; }
    api.tasks(workspaceId).then((d) => setTasks(d.tasks)).catch((e) => setError(e.message));
  }, [workspaceId]);
  useEffect(() => { load(); }, [load]);

  // Poll while any task is executing so board transitions (in_progress -> pending_review) appear live.
  const running = tasks.some((t) => t.status === "in_progress");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [running, load]);

  const runTask = async (t: Task) => {
    if (!window.confirm(`Run "${t.title}" with JULIE now?`)) return;
    try {
      await api.runTask(t.id);
      onSpeaking(true); // falls back to idle via poll when the run settles
      load();
    } catch (e: any) { setError(e.message); }
  };

  const addTask = async () => {
    if (!workspaceId || !newTitle.trim()) return;
    try {
      await api.createTask(workspaceId, newTitle.trim());
      setNewTitle(""); load();
    } catch (e: any) { setError(e.message); }
  };

  const move = async (t: Task, status: string) => {
    if (status === t.status) return;
    try {
      await api.updateTask(t.id, { status });
      setTasks((list) => list.map((x) => (x.id === t.id ? { ...x, status } : x)));
    } catch (e: any) { setError(e.message); }
  };

  if (!workspaceId) return <div className="empty-state"><div>Create or select a workspace first.</div></div>;

  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      {error && <div className="error-text" style={{ padding: "8px 20px" }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, padding: "14px 20px 0" }}>
        <input className="conv-select" style={{ flex: 1, maxWidth: 420 }} value={newTitle} placeholder="New task…"
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addTask(); }} />
        <button className="btn" onClick={addTask} disabled={!newTitle.trim()}>Add task</button>
      </div>
      <div className="board">
        {TASK_STATUSES.map((status) => (
          <div className="board-col" key={status}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = Number(e.dataTransfer.getData("text/task-id"));
              const t = tasks.find((x) => x.id === id);
              if (t) move(t, status);
            }}>
            <div className="col-head">{STATUS_LABEL[status]} <span className="count">{tasks.filter((t) => t.status === status).length}</span></div>
            <div className="col-body">
              {tasks.filter((t) => t.status === status).map((t) => (
                <div className="task-card" key={t.id} draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/task-id", String(t.id))}>
                  <div className="t-title">{t.title}{t.status === "in_progress" && <span className="t-running"> ◈ running</span>}</div>
                  {t.last_run_output && (t.status === "pending_review" || t.status === "blocked") &&
                    <div className="t-output" title={t.last_run_output}>{t.last_run_output}</div>}
                  <div className="t-meta">
                    <select className="t-badge" value={t.status} onChange={(e) => move(t, e.target.value)}
                      style={{ color: "var(--text)", background: "rgba(10,16,28,0.6)" }}>
                      {TASK_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                    {t.status === "ready" &&
                      <button className="t-badge t-run" title="Run with JULIE" onClick={() => runTask(t)}>▶ run</button>}
                    <button className="t-badge t-del" title="delete"
                      onClick={async () => { await api.deleteTask(t.id).catch(() => {}); load(); }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// --- mount (was missing: SPA rendered a blank page) ---
createRoot(document.getElementById("root")!).render(<App />);