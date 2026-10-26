// REST API routes.
import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { db, getSetting, setSetting, TASK_STATUSES, type TaskStatus } from "./db.js";
import { gateway } from "./gateway.js";
import { loginHandler, logoutHandler, requireAuth, parseCookies, SESSION_COOKIE, safeEqual } from "./auth.js";
import { config } from "./config.js";

export const api = Router();

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
  res.json({ ok: true, tasks: rows });
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
  db.prepare("UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
    .run(title, description, status, priority, req.params.id);
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

api.delete("/conversations/:id", (req, res) => {
  const info = db.prepare("DELETE FROM conversations WHERE id = ?").run(req.params.id);
  if (info.changes === 0) { res.status(404).json({ ok: false, error: "conversation not found" }); return; }
  res.json({ ok: true });
});

// ---- settings ----
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