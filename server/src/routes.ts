// REST API routes.
import crypto from "node:crypto";
import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { db, getSetting, setSetting, TASK_STATUSES, type TaskStatus } from "./db.js";
import { gateway } from "./gateway.js";
import { getWeather } from "./weather.js";
import { getTrending } from "./trending.js";
import { loginHandler, logoutHandler, requireAuth, parseCookies, SESSION_COOKIE, safeEqual } from "./auth.js";
import { config } from "./config.js";

export const api = Router();

// ---- prompt usage learning (Phase D-2 Chunk C, card 9) ----
// Every real user message is normalized (trim, collapse whitespace, lowercase),
// hashed (sha1), and upserted into prompt_usage. The table stays bounded: once
// distinct prompts exceed 200, everything outside the top-100 by uses is pruned.
function normalizePrompt(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function recordPromptUsage(raw: string): void {
  const norm = normalizePrompt(raw);
  if (!norm) return;
  const hash = createHash("sha1").update(norm).digest("hex");
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO prompt_usage (prompt_hash, prompt, uses, last_used) VALUES (?, ?, 1, ?)
     ON CONFLICT(prompt_hash) DO UPDATE SET uses = uses + 1, last_used = excluded.last_used`
  ).run(hash, norm, now);
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM prompt_usage").get() as { n: number };
  if (n > 200) {
    db.prepare(
      `DELETE FROM prompt_usage
       WHERE prompt_hash NOT IN (
         SELECT prompt_hash FROM prompt_usage
         ORDER BY uses DESC, last_used DESC LIMIT 100
       )`
    ).run();
  }
}

// ---- public (non-mutating) ----
api.get("/health", (_req, res) => {
  const g = gateway.getStatus();
  res.json({
    ok: true,
    service: "julie-ai-os",
    version: "0.1.0",
    gateway: { connected: g.connected, serverVersion: g.serverVersion ?? null },
  });
});

api.post("/login", loginHandler);
api.post("/logout", logoutHandler);

api.get("/session", (req, res) => {
  const cookie = parseCookies(req)[SESSION_COOKIE];
  const authenticated = Boolean(cookie && safeEqual(cookie, config.adminToken));
  res.json({ authenticated, gateway: gateway.getStatus() });
});

// ---- everything below requires the owner session ----
api.use(requireAuth);

// ---- gateway status (live check) ----
api.get("/gateway/status", async (_req, res) => {
  res.json(await gateway.checkConnection());
});

// ---- agents (real gateway data; honest error states) ----
api.get("/agents", async (_req, res) => {
  try {
    const agents = await gateway.listAgents();
    res.json({ ok: true, agents, source: "gateway" });
  } catch (e: any) {
    res.status(503).json({ ok: false, agents: [], error: e.message, source: "gateway" });
  }
});

// ---- tools (real gateway data; honest error states) ----
api.get("/tools", async (_req, res) => {
  try {
    const tools = await gateway.listTools();
    res.json({ ok: true, tools, source: "gateway" });
  } catch (e: any) {
    res.status(503).json({ ok: false, tools: [], error: e.message, source: "gateway" });
  }
});

// ---- local app enable/disable preferences ----
// Connection/availability is always derived from the real gateway tool list in
// the frontend. These settings only let the owner pause an available app; they
// never claim to connect an external account or perform OAuth.
const APP_IDS = new Set(["gmail", "x", "facebook", "browser", "files", "github"]);
function appPreferences(): Record<string, boolean> {
  try {
    const parsed = JSON.parse(getSetting("app_preferences") ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([id, enabled]) => APP_IDS.has(id) && typeof enabled === "boolean")
    ) as Record<string, boolean>;
  } catch {
    return {};
  }
}

api.get("/apps/preferences", (_req, res) => {
  res.json({ ok: true, preferences: appPreferences() });
});

api.patch("/apps/:id", (req, res) => {
  const id = String(req.params.id ?? "");
  if (!APP_IDS.has(id)) {
    res.status(404).json({ ok: false, error: "unknown app" });
    return;
  }
  if (typeof req.body?.enabled !== "boolean") {
    res.status(400).json({ ok: false, error: "enabled must be boolean" });
    return;
  }
  const preferences = appPreferences();
  preferences[id] = req.body.enabled;
  setSetting("app_preferences", JSON.stringify(preferences));
  res.json({ ok: true, id, enabled: preferences[id], preferences });
});

// ---- analytics (aggregated from local SQLite only) ----
api.get("/analytics", (_req, res) => {
  const q = (sql: string) => db.prepare(sql).all() as any[];
  const one = (sql: string) => db.prepare(sql).get() as any;
  const tasksByStatus = q(`SELECT status, COUNT(*) as count FROM tasks GROUP BY status`);
  const taskRunsPerDay = q(`SELECT date(updated_at) as day, COUNT(*) as count FROM tasks WHERE updated_at >= date('now', '-30 days') GROUP BY day ORDER BY day`);
  const messagesPerDay = q(`SELECT date(created_at) as day, COUNT(*) as count FROM messages WHERE created_at >= date('now', '-30 days') GROUP BY day ORDER BY day`);
  const conversationCount = (one(`SELECT COUNT(*) as count FROM conversations`) as any).count;
  const gatewaySessions = (one(`SELECT COUNT(DISTINCT gateway_session_key) as count FROM conversations WHERE gateway_session_key != ''`) as any).count;
  const taskCount = (one(`SELECT COUNT(*) as count FROM tasks`) as any).count;
  res.json({
    ok: true,
    analytics: {
      tasksByStatus,
      taskRunsPerDay,
      messagesPerDay,
      conversationCount,
      gatewaySessions,
      taskCount,
    },
  });
});

// ---- weather (Port Harcourt via wttr.in, 30-min in-memory cache; honest error on failure) ----
api.get("/weather", async (_req, res) => {
  try {
    res.json(await getWeather());
  } catch (e: any) {
    res.status(502).json({ ok: false, error: e.message ?? "weather fetch failed", source: "wttr.in" });
  }
});

// ---- trending AI reads (live DEV API, real thumbnails, 30-min cache) ----
api.get("/trending", async (_req, res) => {
  try {
    res.json(await getTrending());
  } catch (e: any) {
    res.status(502).json({
      ok: false,
      items: [],
      error: e.message ?? "trending fetch failed",
      source: "DEV Community",
    });
  }
});

// ---- connected devices (real gateway data: node.list / system-presence) ----
// Fallback is a single honest row ("This device") — never invented nodes or percentages.
api.get("/devices", async (_req, res) => {
  try {
    const nodes = await gateway.listNodes();
    // Real paired nodes when the gateway reports any; otherwise a single honest row
    // for this host ("This device"). Never invented nodes or percentages.
    const devices = nodes.length > 0
      ? nodes.map((n) => ({
          id: n.id || n.name,
          name: n.name,
          connected: n.connected,
          detail: n.connected ? "Online" : "Offline",
          lastSeenAtMs: n.lastSeenAtMs ?? null,
        }))
      : [{ id: "this-device", name: "This device", connected: true, detail: "This device", lastSeenAtMs: null }];
    res.json({ ok: true, source: "gateway", devices });
  } catch (e: any) {
    res.json({
      ok: true,
      source: "fallback",
      error: e.message ?? "gateway node listing unavailable",
      devices: [{ id: "this-device", name: "This device", connected: true, detail: "This device", lastSeenAtMs: null }],
    });
  }
});

// ---- insights for the Home dashboard (all computed from real task evidence) ----
api.get("/insights", (_req, res) => {
  const one = (sql: string) => (db.prepare(sql).get() as any)?.count ?? 0;
  // A work event is a distinct task that was either completed or has real run
  // output on that UTC day. UNION de-duplicates a task completed after its run,
  // so one task cannot inflate the chart twice on the same day.
  const rows = db
    .prepare(`
      SELECT day, COUNT(*) AS count
      FROM (
        SELECT id, date(updated_at) AS day
        FROM tasks
        WHERE status = 'done' AND updated_at >= date('now', '-13 days')
        UNION
        SELECT id, date(COALESCE(run_started_at, updated_at)) AS day
        FROM tasks
        WHERE trim(COALESCE(last_run_output, '')) <> ''
          AND COALESCE(run_started_at, updated_at) >= date('now', '-13 days')
      )
      GROUP BY day
    `)
    .all() as Array<{ day: string; count: number }>;
  const byDay = new Map(rows.map((r) => [r.day, r.count]));
  // Full 14-day task-work series (UTC day buckets, zero-filled).
  const spark: Array<{ day: string; count: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    spark.push({ day, count: byDay.get(day) ?? 0 });
  }

  const today = byDay.get(new Date().toISOString().slice(0, 10)) ?? 0;
  const yesterdayKey = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const yesterday = byDay.get(yesterdayKey) ?? 0;
  const pct = yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : null;
  const completedToday = one("SELECT COUNT(*) AS count FROM tasks WHERE status = 'done' AND date(updated_at) = date('now')");
  const evidencedRunsToday = one("SELECT COUNT(*) AS count FROM tasks WHERE trim(COALESCE(last_run_output, '')) <> '' AND date(COALESCE(run_started_at, updated_at)) = date('now')");

  // Score ring is the real task completion rate. In-progress work is not
  // counted as complete, and no task data is represented as null.
  const totalTasks = one("SELECT COUNT(*) AS count FROM tasks");
  const doneTasks = one("SELECT COUNT(*) AS count FROM tasks WHERE status = 'done'");
  const inProgressTasks = one("SELECT COUNT(*) AS count FROM tasks WHERE status = 'in_progress'");
  const score = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : null;
  res.json({
    ok: true,
    insights: {
      spark,
      productivity: { today, yesterday, pct, completedToday, evidencedRunsToday },
      score,
      totals: { totalTasks, doneTasks, inProgressTasks },
    },
  });
});

// ---- workspaces ----
api.get("/workspaces", (_req, res) => {
  const rows = db.prepare("SELECT * FROM workspaces ORDER BY id").all();
  const activeId = getSetting("active_workspace_id");
  res.json({ ok: true, workspaces: rows, activeWorkspaceId: activeId ? Number(activeId) : null });
});

api.post("/workspaces", (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 120) : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim().slice(0, 2000) : "";
  if (!name) { res.status(400).json({ ok: false, error: "name required" }); return; }
  try {
    const info = db.prepare("INSERT INTO workspaces (name, description) VALUES (?, ?)").run(name, description);
    const ws = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(info.lastInsertRowid);
    if (!getSetting("active_workspace_id")) setSetting("active_workspace_id", String(info.lastInsertRowid));
    res.json({ ok: true, workspace: ws });
  } catch (e: any) {
    res.status(e.message?.includes("UNIQUE") ? 409 : 500).json({ ok: false, error: e.message });
  }
});

api.post("/workspaces/:id/activate", (req, res) => {
  const ws = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(req.params.id);
  if (!ws) { res.status(404).json({ ok: false, error: "workspace not found" }); return; }
  setSetting("active_workspace_id", String(req.params.id));
  res.json({ ok: true, activeWorkspaceId: Number(req.params.id) });
});

api.patch("/workspaces/:id", (req, res) => {
  const ws = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(req.params.id) as any;
  if (!ws) { res.status(404).json({ ok: false, error: "workspace not found" }); return; }
  const name = typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim().slice(0, 120) : ws.name;
  const description = typeof req.body?.description === "string" ? req.body.description.trim().slice(0, 2000) : ws.description;
  db.prepare("UPDATE workspaces SET name = ?, description = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(name, description, req.params.id);
  res.json({ ok: true, workspace: db.prepare("SELECT * FROM workspaces WHERE id = ?").get(req.params.id) });
});

api.delete("/workspaces/:id", (req, res) => {
  const info = db.prepare("DELETE FROM workspaces WHERE id = ?").run(req.params.id);
  if (info.changes === 0) { res.status(404).json({ ok: false, error: "workspace not found" }); return; }
  if (getSetting("active_workspace_id") === String(req.params.id)) {
    const next = db.prepare("SELECT id FROM workspaces ORDER BY id LIMIT 1").get() as any;
    setSetting("active_workspace_id", next ? String(next.id) : "");
  }
  res.json({ ok: true });
});

// ---- tasks ----
api.get("/tasks", (req, res) => {
  const wsId = Number(req.query.workspaceId ?? getSetting("active_workspace_id") ?? 0);
  if (!wsId) { res.json({ ok: true, tasks: [] }); return; }
  const rows = db.prepare(
    "SELECT * FROM tasks WHERE workspace_id = ? ORDER BY priority, updated_at DESC"
  ).all(wsId);
  res.json({ ok: true, tasks: rows, runningTaskIds: [...activeTaskRuns.keys()] });
});

api.post("/tasks", (req, res) => {
  const wsId = Number(req.body?.workspaceId ?? getSetting("active_workspace_id") ?? 0);
  const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 500) : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim().slice(0, 5000) : "";
  const status = TASK_STATUSES.includes(req.body?.status) ? (req.body.status as TaskStatus) : "backlog";
  const priority = Number.isInteger(req.body?.priority) ? Math.min(3, Math.max(1, req.body.priority)) : 2;
  if (!title) { res.status(400).json({ ok: false, error: "title required" }); return; }
  if (!wsId || !db.prepare("SELECT id FROM workspaces WHERE id = ?").get(wsId)) {
    res.status(400).json({ ok: false, error: "valid workspaceId required" }); return;
  }
  const info = db.prepare("INSERT INTO tasks (workspace_id, title, description, status, priority) VALUES (?, ?, ?, ?, ?)")
    .run(wsId, title, description, status, priority);
  res.json({ ok: true, task: db.prepare("SELECT * FROM tasks WHERE id = ?").get(info.lastInsertRowid) });
});

api.patch("/tasks/:id", (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id) as any;
  if (!task) { res.status(404).json({ ok: false, error: "task not found" }); return; }
  const title = typeof req.body?.title === "string" && req.body.title.trim() ? req.body.title.trim().slice(0, 500) : task.title;
  const description = typeof req.body?.description === "string" ? req.body.description.trim().slice(0, 5000) : task.description;
  const status = TASK_STATUSES.includes(req.body?.status) ? (req.body.status as TaskStatus) : task.status;
  const priority = Number.isInteger(req.body?.priority) ? Math.min(3, Math.max(1, req.body.priority)) : task.priority;
  // Optional run-evidence fields (backward compatible): last_run_output is a string,
  // run_started_at is nullable (an explicit null clears it, an empty string is ignored).
  const lastRunOutput = typeof req.body?.last_run_output === "string" ? req.body.last_run_output.slice(0, 20000) : task.last_run_output;
  const runStartedAt = req.body?.run_started_at === null
    ? null
    : (typeof req.body?.run_started_at === "string" && req.body.run_started_at ? req.body.run_started_at : task.run_started_at);
  db.prepare("UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, last_run_output = ?, run_started_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
    .run(title, description, status, priority, lastRunOutput, runStartedAt, req.params.id);
  res.json({ ok: true, task: db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id) });
});

api.delete("/tasks/:id", (req, res) => {
  const info = db.prepare("DELETE FROM tasks WHERE id = ?").run(req.params.id);
  if (info.changes === 0) { res.status(404).json({ ok: false, error: "task not found" }); return; }
  res.json({ ok: true });
});

// ---- conversations + chat through the real gateway ----
api.get("/conversations", (req, res) => {
  const wsId = Number(req.query.workspaceId ?? getSetting("active_workspace_id") ?? 0);
  if (!wsId) { res.json({ ok: true, conversations: [] }); return; }
  const rows = db.prepare(
    "SELECT id, workspace_id, title, gateway_session_key, created_at, updated_at FROM conversations WHERE workspace_id = ? ORDER BY updated_at DESC"
  ).all(wsId);
  res.json({ ok: true, conversations: rows });
});

api.post("/conversations", (req, res) => {
  const wsId = Number(req.body?.workspaceId ?? getSetting("active_workspace_id") ?? 0);
  if (!wsId || !db.prepare("SELECT id FROM workspaces WHERE id = ?").get(wsId)) {
    res.status(400).json({ ok: false, error: "valid workspaceId required" }); return;
  }
  const title = typeof req.body?.title === "string" && req.body.title.trim() ? req.body.title.trim().slice(0, 200) : "New conversation";
  const sessionKey = `agent:main:julie-conv-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
  const info = db.prepare("INSERT INTO conversations (workspace_id, title, gateway_session_key) VALUES (?, ?, ?)").run(wsId, title, sessionKey);
  res.json({ ok: true, conversation: db.prepare("SELECT * FROM conversations WHERE id = ?").get(info.lastInsertRowid) });
});

api.get("/conversations/:id/messages", (req, res) => {
  const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(req.params.id) as any;
  if (!conv) { res.status(404).json({ ok: false, error: "conversation not found" }); return; }
  const rows = db.prepare("SELECT id, role, text, created_at FROM messages WHERE conversation_id = ? ORDER BY id").all(conv.id);
  res.json({ ok: true, messages: rows, gatewaySessionKey: conv.gateway_session_key });
});

api.post("/conversations/:id/messages", async (req, res) => {
  const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(req.params.id) as any;
  if (!conv) { res.status(404).json({ ok: false, error: "conversation not found" }); return; }
  const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 20000) : "";
  if (!text) { res.status(400).json({ ok: false, error: "text required" }); return; }

  db.prepare("INSERT INTO messages (conversation_id, role, text) VALUES (?, 'user', ?)").run(conv.id, text);
  db.prepare("UPDATE conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(conv.id);
  recordPromptUsage(text);

  try {
    const reply = await gateway.chat(conv.gateway_session_key, text);
    if (!reply.text) {
      res.status(502).json({ ok: false, error: "gateway returned no assistant text", runId: reply.runId ?? null });
      return;
    }
    const minfo = db.prepare("INSERT INTO messages (conversation_id, role, text) VALUES (?, 'assistant', ?)").run(conv.id, reply.text);
    db.prepare("UPDATE conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(conv.id);
    res.json({
      ok: true,
      runId: reply.runId ?? null,
      message: db.prepare("SELECT id, role, text, created_at FROM messages WHERE id = ?").get(minfo.lastInsertRowid),
    });
  } catch (e: any) {
    res.status(502).json({ ok: false, error: `gateway chat failed: ${e.message}` });
  }
});

// ---- streaming: SSE forward of gateway chat deltas per conversation ----
api.get("/conversations/:id/events", (req, res) => {
  const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(req.params.id) as any;
  if (!conv) { res.status(404).json({ ok: false, error: "conversation not found" }); return; }
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write("retry: 3000\n\n");
  const send = (obj: unknown) => {
    try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* client gone */ }
  };
  send({ type: "hello", conversationId: conv.id });
  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { /* client gone */ }
  }, 15000);
  const unsubscribe = gateway.subscribeChat((e) => {
    if (e.sessionKey !== conv.gateway_session_key) return;
    send({
      type: e.state,
      runId: e.runId ?? null,
      deltaText: e.deltaText ?? null,
      replace: e.replace,
      snapshot: e.snapshot,
      text: e.text,
    });
  });
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

api.delete("/conversations/:id", (req, res) => {
  const info = db.prepare("DELETE FROM conversations WHERE id = ?").run(req.params.id);
  if (info.changes === 0) { res.status(404).json({ ok: false, error: "conversation not found" }); return; }
  res.json({ ok: true });
});

// ---- task automation bridge (B-3): run a ready task through the gateway ----
// Lifecycle: ready -> in_progress -> pending_review (or blocked on failure).
// Execution goes through the real OpenClaw agent registry: chat.send to the
// orchestrator agent (agent:main) on a stable per-task session key.
const activeTaskRuns = new Map<number, { startedAt: string }>();

function taskRunPrompt(task: { title: string; description: string }): string {
  const desc = task.description.trim();
  return [
    `Execute this JULIE task from the task board.`,
    `Task: ${task.title}`,
    desc ? `\nDescription:\n${desc}` : "",
    `\nWork on it now using your available tools. When finished, reply with a short result summary as the final answer.`,
  ].join("");
}

api.post("/tasks/:id/run", (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id) as any;
  if (!task) { res.status(404).json({ ok: false, error: "task not found" }); return; }
  if (activeTaskRuns.has(task.id)) { res.status(409).json({ ok: false, error: "task is already running" }); return; }
  if (task.status !== "ready") {
    res.status(409).json({ ok: false, error: `task must be in 'ready' to run (current: ${task.status})` });
    return;
  }
  const sessionKey = task.gateway_session_key || `agent:main:julie-task-${task.id}`;
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE tasks SET status = 'in_progress', run_started_at = ?, gateway_session_key = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
  ).run(now, sessionKey, task.id);
  activeTaskRuns.set(task.id, { startedAt: now });

  // Background execution; never blocks the HTTP response.
  gateway.chat(sessionKey, taskRunPrompt(task), 600000)
    .then((reply) => {
      const output = (reply.text || "(gateway returned no output)").slice(0, 20000);
      db.prepare(
        "UPDATE tasks SET status = 'pending_review', last_run_output = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
      ).run(output, task.id);
    })
    .catch((e: any) => {
      db.prepare(
        "UPDATE tasks SET status = 'blocked', last_run_output = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
      ).run(`Run failed: ${e?.message ?? "unknown error"}`.slice(0, 20000), task.id);
    })
    .finally(() => activeTaskRuns.delete(task.id));

  res.json({ ok: true, task: db.prepare("SELECT * FROM tasks WHERE id = ?").get(task.id) });
});

// ---- settings ----

// ---- learned prompt usage (Phase D-2 Chunk C, card 9): top prompts by frequency ----
api.get("/prompt-usage", (req, res) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "12"), 10) || 12, 1), 50);
  const rows = db.prepare(
    "SELECT prompt_hash, prompt, uses, last_used FROM prompt_usage ORDER BY uses DESC, last_used DESC LIMIT ?"
  ).all(limit);
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM prompt_usage").get() as { n: number };
  res.json({ ok: true, prompts: rows, total: n });
});

// ---- owner avatar (Phase D-2 Chunk C, card 10) ----
// Stored as a base64 dataURL in settings (single-owner app; avoids file handling).
const AVATAR_MAX_CHARS = 1_500_000; // ~1MB binary image as base64 (≈1.37M chars) + headroom
const AVATAR_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

function avatarDataUrlError(v: unknown): string | null {
  if (typeof v !== "string") return "image must be a dataURL string";
  if (v.length > AVATAR_MAX_CHARS) return "image too large (max ~1MB)";
  if (!AVATAR_RE.test(v)) return "image must be a jpeg, png, or webp dataURL";
  const b64 = v.slice(v.indexOf(",") + 1);
  const buf = Buffer.from(b64, "base64");
  const isJpeg = buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isWebp = buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
  if (!isJpeg && !isPng && !isWebp) return "image bytes do not match the declared type";
  return null;
}

api.get("/settings/avatar", (_req, res) => {
  const avatar = getSetting("owner_avatar");
  res.json({ ok: true, avatar: avatar ?? null });
});

api.put("/settings/avatar", (req, res) => {
  const image = req.body?.image;
  if (image === null || image === "none" || image === "") {
    db.prepare("DELETE FROM settings WHERE key = 'owner_avatar'").run();
    res.json({ ok: true, avatar: null });
    return;
  }
  const err = avatarDataUrlError(image);
  if (err) { res.status(400).json({ ok: false, error: err }); return; }
  setSetting("owner_avatar", image as string);
  res.json({ ok: true, avatar: image });
});

api.get("/settings", (_req, res) => {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  res.json({ ok: true, settings: Object.fromEntries(rows.map((r: any) => [r.key, r.value])) });
});

api.put("/settings", (req, res) => {
  const entries = req.body?.settings;
  if (!entries || typeof entries !== "object") { res.status(400).json({ ok: false, error: "settings object required" }); return; }
  for (const [k, v] of Object.entries(entries)) {
    if (typeof k !== "string" || k.length > 100) continue;
    setSetting(k, String(v).slice(0, 5000));
  }
  res.json({ ok: true });
});
