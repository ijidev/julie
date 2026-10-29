// REST API routes.
import crypto from "node:crypto";
import { createHash } from "node:crypto";
import { Router, raw as rawBody, type Request, type Response } from "express";
import { db, getSetting, setSetting, TASK_STATUSES, type TaskStatus } from "./db.js";
import { gateway, type ChatStreamEvent, type GatewayChatAttachment } from "./gateway.js";
import { getWeather } from "./weather.js";
import { getTrending } from "./trending.js";
import { getAgentOverview, invalidateAgentOverview } from "./agent-overview.js";
import { AgentNotFoundError, getAgentDetail, invalidateAgentDetail } from "./agent-detail.js";
import { AgentChatTargetError, getAgentSessionHistory, sendAgentMessage } from "./agent-chat.js";
import { AgentOnboardingInputError, createOnboardedAgent, getAgentOnboardingOptions } from "./agent-onboarding.js";
import { AgentUpdateInputError, updateManagedAgent } from "./agent-update.js";
import { AgentAssignmentInputError, getWorkspaceAgentAssignments, replaceWorkspaceAgentAssignments } from "./agent-assignments.js";
import { isAgentAssignedToWorkspace } from "./agent-profiles.js";
import { AgentOrganizationError, configureAgentOrganization, getAgentOrganization } from "./agent-organization.js";
import { AgentRoomError, createAgentRoom, getAgentRoom, getAgentRoomActiveRun, hasAgentRoom, listAgentRooms, setAgentRoomArchived, startAgentRoomTurn, subscribeAgentRoom } from "./agent-rooms.js";
import { AgentAvatarError, addAgentAvatarModelUrl, applyAgentAvatar, applyAgentAvatarUrl, buildAgentFallbackSvg, generateAgentAvatar, getAgentAvatarStudio, importAgentAvatarImage, importAgentAvatarModel, previewAgentAvatar, readAgentAvatarAsset, readAgentAvatarModel } from "./agent-avatar.js";
import { loginHandler, logoutHandler, requireAuth, parseCookies, SESSION_COOKIE, safeEqual } from "./auth.js";
import { config } from "./config.js";
import {
  getOpencodeStatus,
  getOpencodeStats,
  listOpencodeActiveSessions,
  listOpencodeAgents,
  listOpencodeProjects,
  listOpencodeSessionMessages,
  listOpencodeSessions,
  OpencodeAvailableError,
  OpencodeForbiddenError,
  OpencodeUnavailableError,
} from "./opencode.js";

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

// ---- live conversation runs ----
// Julie acknowledges a message as soon as the real Gateway accepts chat.send,
// then persists the final reply in the background. Browser-visible events are a
// sanitized local projection: Gateway session keys and run IDs stay server-side.
type ActiveConversationRun = {
  conversationId: number;
  sessionKey: string;
  runId: string;
  prompt: string;
  startedAt: number;
  state: "sending" | "accepted" | "status" | "responding" | "finalizing";
  phase?: string;
  retry?: { attempt?: number; maxAttempts?: number; reason?: string };
  streamedText: string;
  finalizing: boolean;
  finished: boolean;
};

type ConversationSubscriber = (event: Record<string, unknown>) => void;

const CHAT_REPLY_MONITOR_TIMEOUT_MS = 30 * 60 * 1000;
const activeConversationRuns = new Map<number, ActiveConversationRun>();
const conversationSubscribers = new Map<number, Set<ConversationSubscriber>>();

function publishConversationEvent(conversationId: number, event: Record<string, unknown>): void {
  for (const subscriber of conversationSubscribers.get(conversationId) ?? []) {
    try { subscriber(event); } catch { /* a disconnected SSE client cannot affect a run */ }
  }
}

function publicRunSnapshot(run: ActiveConversationRun | undefined): Record<string, unknown> | null {
  if (!run) return null;
  return {
    state: run.state,
    phase: run.phase ?? null,
    retry: run.retry ?? null,
    text: run.streamedText,
    startedAt: run.startedAt,
  };
}

function matchingConversationRun(event: ChatStreamEvent): ActiveConversationRun | undefined {
  for (const run of activeConversationRuns.values()) {
    if (event.sessionKey !== run.sessionKey) continue;
    if (event.runId && event.runId !== run.runId) continue;
    return run;
  }
  return undefined;
}

function finishConversationRun(run: ActiveConversationRun, text: string): void {
  if (run.finished || run.finalizing) return;
  const reply = text.trim();
  if (!reply) return;
  run.finalizing = true;
  run.state = "finalizing";
  publishConversationEvent(run.conversationId, { type: "run", state: "finalizing" });
  try {
    const info = db.prepare("INSERT INTO messages (conversation_id, role, text) VALUES (?, 'assistant', ?)").run(run.conversationId, reply);
    db.prepare("UPDATE conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(run.conversationId);
    const message = db.prepare("SELECT id, role, text, created_at FROM messages WHERE id = ?").get(info.lastInsertRowid);
    run.finished = true;
    publishConversationEvent(run.conversationId, { type: "run", state: "complete", message });
  } catch (error: any) {
    publishConversationEvent(run.conversationId, {
      type: "run",
      state: "error",
      error: typeof error?.message === "string" ? error.message.slice(0, 500) : "could not save assistant response",
    });
  } finally {
    if (activeConversationRuns.get(run.conversationId) === run) activeConversationRuns.delete(run.conversationId);
  }
}

function failConversationRun(run: ActiveConversationRun, error: unknown, state: "error" | "aborted" = "error"): void {
  if (run.finished || run.finalizing) return;
  run.finished = true;
  const detail = error instanceof Error ? error.message : typeof error === "string" ? error : "chat run failed";
  publishConversationEvent(run.conversationId, {
    type: "run",
    state,
    error: detail.slice(0, 500),
  });
  if (activeConversationRuns.get(run.conversationId) === run) activeConversationRuns.delete(run.conversationId);
}

gateway.subscribeChat((event) => {
  const run = matchingConversationRun(event);
  if (!run) return;

  if (event.state === "status") {
    run.state = "status";
    run.phase = event.phase;
    run.retry = event.retry;
    publishConversationEvent(run.conversationId, {
      type: "run",
      state: "status",
      phase: event.phase ?? null,
      retry: event.retry ?? null,
    });
    return;
  }

  if (event.state === "delta") {
    run.state = "responding";
    if (event.snapshot != null) run.streamedText = event.snapshot;
    else if (event.replace) run.streamedText = event.deltaText ?? "";
    else run.streamedText += event.deltaText ?? "";
    publishConversationEvent(run.conversationId, {
      type: "run",
      state: "responding",
      deltaText: event.deltaText ?? "",
      replace: event.replace,
      snapshot: event.snapshot,
    });
    return;
  }

  if (event.state === "final") {
    const finalText = event.text || run.streamedText;
    if (finalText) finishConversationRun(run, finalText);
    return;
  }

  failConversationRun(
    run,
    event.errorMessage || event.stopReason || (event.state === "aborted" ? "chat run aborted" : "chat run failed"),
    event.state
  );
});

function requireActiveWorkspaceAgent(agentId: string, res: Response): boolean {
  const workspaceId = Number(getSetting("active_workspace_id") ?? 0);
  const workspace = workspaceId ? db.prepare("SELECT id FROM workspaces WHERE id = ?").get(workspaceId) : null;
  if (!workspace || !isAgentAssignedToWorkspace(agentId, workspaceId)) {
    res.status(404).json({ ok: false, error: "agent not found", source: "local" });
    return false;
  }
  return true;
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
    const agents = (await gateway.listAgents()).map((agent) => ({
      id: agent.id,
      name: agent.name,
      identity: agent.identity ? {
        name: agent.identity.name,
        theme: agent.identity.theme,
        emoji: agent.identity.emoji,
        avatar: typeof agent.identity.avatar === "string" && (/^https:\/\//i.test(agent.identity.avatar) || /^data:image\/(?:png|jpeg|webp);base64,/i.test(agent.identity.avatar))
          ? agent.identity.avatar
          : undefined,
      } : undefined,
      model: agent.model,
      utilityModel: agent.utilityModel,
      agentRuntime: agent.agentRuntime,
      thinkingDefault: agent.thinkingDefault,
      defaultPermissionMode: agent.defaultPermissionMode,
      workspaceGit: agent.workspaceGit,
      createdVia: agent.createdVia,
      creatorAgentId: agent.creatorAgentId,
      createdAt: agent.createdAt,
      kind: agent.kind,
    }));
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, agents, source: "gateway" });
  } catch (e: any) {
    res.status(503).json({ ok: false, agents: [], error: e.message, source: "gateway" });
  }
});

api.post("/agents", async (req, res) => {
  try {
    const result = await createOnboardedAgent(req.body);
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json(result);
  } catch (e: any) {
    if (e instanceof AgentOnboardingInputError) {
      res.status(e.status).json({ ok: false, error: e.message, source: "gateway+local" });
      return;
    }
    const message = typeof e?.message === "string" ? e.message : "agent creation failed";
    const status = /already exists|already-exists/i.test(message) ? 409 : 502;
    res.status(status).json({ ok: false, error: message, source: "gateway" });
  }
});

api.get("/agents/onboarding/options", async (req, res) => {
  try {
    const options = await getAgentOnboardingOptions(req.query.refresh === "1");
    res.setHeader("Cache-Control", "no-store");
    res.json(options);
  } catch (e: any) {
    res.status(503).json({ ok: false, error: e.message, source: "gateway+local" });
  }
});

api.get("/agents/overview", async (req, res) => {
  try {
    const workspaceId = Number(req.query.workspaceId ?? getSetting("active_workspace_id") ?? 0);
    const workspace = db.prepare("SELECT id, name FROM workspaces WHERE id = ?").get(workspaceId) as { id: number; name: string } | undefined;
    if (!workspace) {
      res.status(400).json({ ok: false, error: "valid active workspace required", source: "local" });
      return;
    }
    const force = req.query.refresh === "1";
    const overview = await getAgentOverview(workspace.id, workspace.name, force);
    res.setHeader("Cache-Control", "no-store");
    res.json(overview);
  } catch (e: any) {
    res.status(503).json({ ok: false, agents: [], error: e.message, source: "gateway" });
  }
});

api.get("/agents/assignments", async (req, res) => {
  const workspaceId = Number(req.query.workspaceId ?? getSetting("active_workspace_id") ?? 0);
  try {
    const result = await getWorkspaceAgentAssignments(workspaceId);
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (e: any) {
    if (e instanceof AgentAssignmentInputError) {
      res.status(e.status).json({ ok: false, error: e.message, source: "gateway+local" });
      return;
    }
    res.status(503).json({ ok: false, error: e.message, source: "gateway+local" });
  }
});

api.put("/agents/assignments", async (req, res) => {
  if (req.body?.confirmed !== true) {
    res.status(400).json({ ok: false, error: "assignment confirmation required", source: "local" });
    return;
  }
  const workspaceId = Number(req.body?.workspaceId ?? getSetting("active_workspace_id") ?? 0);
  try {
    const result = await replaceWorkspaceAgentAssignments(workspaceId, req.body?.agentIds);
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (e: any) {
    if (e instanceof AgentAssignmentInputError) {
      res.status(e.status).json({ ok: false, error: e.message, source: "gateway+local" });
      return;
    }
    res.status(503).json({ ok: false, error: e.message, source: "gateway+local" });
  }
});

api.get("/agents/organization", async (req, res) => {
  const workspaceId = Number(req.query.workspaceId ?? getSetting("active_workspace_id") ?? 0);
  try {
    const result = await getAgentOrganization(workspaceId);
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (error: any) {
    if (error instanceof AgentOrganizationError) {
      res.status(error.status).json({ ok: false, error: error.message, source: "gateway+local" });
      return;
    }
    res.status(503).json({ ok: false, error: error?.message ?? "organization unavailable", source: "gateway+local" });
  }
});

api.put("/agents/organization", async (req, res) => {
  const workspaceId = Number(req.body?.workspaceId ?? getSetting("active_workspace_id") ?? 0);
  try {
    const result = await configureAgentOrganization(workspaceId, req.body?.members, req.body?.confirmed === true);
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (error: any) {
    if (error instanceof AgentOrganizationError) {
      res.status(error.status).json({ ok: false, error: error.message, source: "gateway+local" });
      return;
    }
    res.status(503).json({ ok: false, error: error?.message ?? "organization update failed", source: "gateway+local" });
  }
});

// ---- agent rooms: task-linked, persistent local transcript + real Gateway turns ----
api.get("/agent-rooms", async (req, res) => {
  const workspaceId = Number(req.query.workspaceId ?? getSetting("active_workspace_id") ?? 0);
  try {
    const result = await listAgentRooms(workspaceId);
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (error: any) {
    if (error instanceof AgentRoomError) {
      res.status(error.status).json({ ok: false, error: error.message, source: "local+gateway" });
      return;
    }
    res.status(503).json({ ok: false, error: error?.message ?? "agent rooms unavailable", source: "local+gateway" });
  }
});

api.post("/agent-rooms", async (req, res) => {
  const workspaceId = Number(req.body?.workspaceId ?? getSetting("active_workspace_id") ?? 0);
  const taskId = Number(req.body?.taskId);
  if (!Number.isInteger(workspaceId) || workspaceId <= 0 || !Number.isInteger(taskId) || taskId <= 0) {
    res.status(400).json({ ok: false, error: "valid workspaceId and taskId required", source: "local+gateway" });
    return;
  }
  try {
    const result = await createAgentRoom({ workspaceId, taskId, title: req.body?.title, agentIds: req.body?.agentIds, confirmed: req.body?.confirmed === true });
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json(result);
  } catch (error: any) {
    if (error instanceof AgentRoomError) {
      res.status(error.status).json({ ok: false, error: error.message, source: "local+gateway" });
      return;
    }
    res.status(503).json({ ok: false, error: error?.message ?? "room creation failed", source: "local+gateway" });
  }
});

api.get("/agent-rooms/:id", async (req, res) => {
  const roomId = Number(req.params.id);
  if (!Number.isInteger(roomId) || roomId <= 0) { res.status(400).json({ ok: false, error: "valid room id required" }); return; }
  try {
    const result = await getAgentRoom(roomId);
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (error: any) {
    if (error instanceof AgentRoomError) { res.status(error.status).json({ ok: false, error: error.message, source: "local+gateway" }); return; }
    res.status(503).json({ ok: false, error: error?.message ?? "room unavailable", source: "local+gateway" });
  }
});

api.post("/agent-rooms/:id/messages", async (req, res) => {
  const roomId = Number(req.params.id);
  if (!Number.isInteger(roomId) || roomId <= 0) { res.status(400).json({ ok: false, error: "valid room id required" }); return; }
  try {
    const result = await startAgentRoomTurn(roomId, req.body?.text, req.body?.agentIds);
    res.setHeader("Cache-Control", "no-store");
    res.status(202).json(result);
  } catch (error: any) {
    if (error instanceof AgentRoomError) { res.status(error.status).json({ ok: false, error: error.message, source: "local+gateway" }); return; }
    res.status(503).json({ ok: false, error: error?.message ?? "room dispatch failed", source: "local+gateway" });
  }
});

api.patch("/agent-rooms/:id", async (req, res) => {
  const roomId = Number(req.params.id);
  if (!Number.isInteger(roomId) || roomId <= 0) { res.status(400).json({ ok: false, error: "valid room id required" }); return; }
  if (req.body?.confirmed !== true || typeof req.body?.archived !== "boolean") {
    res.status(400).json({ ok: false, error: "archive state and confirmation required", source: "local" });
    return;
  }
  try {
    const result = await setAgentRoomArchived(roomId, req.body.archived);
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (error: any) {
    if (error instanceof AgentRoomError) { res.status(error.status).json({ ok: false, error: error.message, source: "local+gateway" }); return; }
    res.status(503).json({ ok: false, error: error?.message ?? "room update failed", source: "local+gateway" });
  }
});

api.get("/agent-rooms/:id/events", (req, res) => {
  const roomId = Number(req.params.id);
  if (!Number.isInteger(roomId) || roomId <= 0 || !hasAgentRoom(roomId)) {
    res.status(404).json({ ok: false, error: "room not found" });
    return;
  }
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write("retry: 3000\n\n");
  const send = (event: Record<string, unknown>) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  send({ type: "hello", roomId, activeRun: getAgentRoomActiveRun(roomId) });
  const unsubscribe = subscribeAgentRoom(roomId, send as (event: any) => void);
  const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 15_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

api.get("/agents/:id/avatar", async (req, res) => {
  const agentId = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!agentId || agentId.length > 200) {
    res.status(400).json({ ok: false, error: "valid agent id required", source: "gateway+local" });
    return;
  }
  if (!requireActiveWorkspaceAgent(agentId, res)) return;
  try {
    const result = await getAgentAvatarStudio(agentId, req.query.refresh === "1");
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (e: any) {
    if (e instanceof AgentAvatarError) {
      res.status(e.status).json({ ok: false, error: e.message, source: "gateway+local" });
      return;
    }
    res.status(503).json({ ok: false, error: e.message, source: "gateway+local" });
  }
});

api.post("/agents/:id/avatar/preview", async (req, res) => {
  const agentId = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!agentId || agentId.length > 200) {
    res.status(400).json({ ok: false, error: "valid agent id required", source: "gateway+local" });
    return;
  }
  if (!requireActiveWorkspaceAgent(agentId, res)) return;
  try {
    const result = await previewAgentAvatar(agentId, req.body);
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (e: any) {
    if (e instanceof AgentAvatarError) {
      res.status(e.status).json({ ok: false, error: e.message, source: "gateway+local" });
      return;
    }
    res.status(503).json({ ok: false, error: e.message, source: "gateway+local" });
  }
});

api.post("/agents/:id/avatar/generate", async (req, res) => {
  const agentId = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!agentId || agentId.length > 200) {
    res.status(400).json({ ok: false, error: "valid agent id required", source: "gateway+local" });
    return;
  }
  if (!requireActiveWorkspaceAgent(agentId, res)) return;
  try {
    const result = await generateAgentAvatar(agentId, req.body);
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json(result);
  } catch (e: any) {
    if (e instanceof AgentAvatarError) {
      res.status(e.status).json({ ok: false, error: e.message, source: "gateway+local" });
      return;
    }
    res.status(502).json({ ok: false, error: e.message, source: "gateway+local" });
  }
});

api.post("/agents/:id/avatar/apply", async (req, res) => {
  const agentId = typeof req.params.id === "string" ? req.params.id.trim() : "";
  const assetId = Number(req.body?.assetId);
  if (!agentId || agentId.length > 200 || !Number.isInteger(assetId) || assetId <= 0) {
    res.status(400).json({ ok: false, error: "valid agent and avatar asset ids required", source: "gateway+local" });
    return;
  }
  if (!requireActiveWorkspaceAgent(agentId, res)) return;
  try {
    const result = await applyAgentAvatar(agentId, assetId, req.body?.confirmed === true);
    invalidateAgentDetail(agentId);
    invalidateAgentOverview();
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (e: any) {
    if (e instanceof AgentAvatarError) {
      res.status(e.status).json({ ok: false, error: e.message, source: "gateway+local" });
      return;
    }
    res.status(502).json({ ok: false, error: e.message, source: "gateway+local" });
  }
});

api.post("/agents/:id/avatar/import", async (req, res) => {
  const agentId = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!agentId || agentId.length > 200) {
    res.status(400).json({ ok: false, error: "valid agent id required", source: "local" });
    return;
  }
  if (!requireActiveWorkspaceAgent(agentId, res)) return;
  try {
    const result = await importAgentAvatarImage(agentId, req.body);
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json(result);
  } catch (e: any) {
    if (e instanceof AgentAvatarError) {
      res.status(e.status).json({ ok: false, error: e.message, source: "local" });
      return;
    }
    res.status(500).json({ ok: false, error: e.message, source: "local" });
  }
});

api.post("/agents/:id/avatar/apply-url", async (req, res) => {
  const agentId = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!agentId || agentId.length > 200) {
    res.status(400).json({ ok: false, error: "valid agent id required", source: "gateway+owner_input" });
    return;
  }
  if (!requireActiveWorkspaceAgent(agentId, res)) return;
  try {
    const result = await applyAgentAvatarUrl(agentId, req.body?.url, req.body?.confirmed === true);
    invalidateAgentDetail(agentId);
    invalidateAgentOverview();
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (e: any) {
    if (e instanceof AgentAvatarError) {
      res.status(e.status).json({ ok: false, error: e.message, source: "gateway+owner_input" });
      return;
    }
    res.status(502).json({ ok: false, error: e.message, source: "gateway+owner_input" });
  }
});

api.post("/agents/:id/avatar/model", rawBody({ type: ["model/gltf-binary", "application/octet-stream"], limit: "8mb" }), async (req, res) => {
  const agentId = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!agentId || agentId.length > 200) {
    res.status(400).json({ ok: false, error: "valid agent id required", source: "local" });
    return;
  }
  if (!requireActiveWorkspaceAgent(agentId, res)) return;
  try {
    const result = await importAgentAvatarModel(agentId, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), req.get("X-Julie-Confirm") === "true");
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json(result);
  } catch (e: any) {
    if (e instanceof AgentAvatarError) {
      res.status(e.status).json({ ok: false, error: e.message, source: "local" });
      return;
    }
    res.status(500).json({ ok: false, error: e.message, source: "local" });
  }
});

api.post("/agents/:id/avatar/model-url", async (req, res) => {
  const agentId = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!agentId || agentId.length > 200) {
    res.status(400).json({ ok: false, error: "valid agent id required", source: "owner_input" });
    return;
  }
  if (!requireActiveWorkspaceAgent(agentId, res)) return;
  try {
    const result = await addAgentAvatarModelUrl(agentId, req.body?.url, req.body?.confirmed === true);
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json(result);
  } catch (e: any) {
    if (e instanceof AgentAvatarError) {
      res.status(e.status).json({ ok: false, error: e.message, source: "owner_input" });
      return;
    }
    res.status(500).json({ ok: false, error: e.message, source: "owner_input" });
  }
});

api.get("/agents/:id/avatar/assets/:assetId", async (req, res) => {
  const agentId = typeof req.params.id === "string" ? req.params.id.trim() : "";
  const assetId = Number(req.params.assetId);
  if (!agentId || agentId.length > 200 || !Number.isInteger(assetId) || assetId <= 0) {
    res.status(400).json({ ok: false, error: "valid agent and avatar asset ids required", source: "local" });
    return;
  }
  if (!requireActiveWorkspaceAgent(agentId, res)) return;
  try {
    const asset = await readAgentAvatarAsset(agentId, assetId);
    res.setHeader("Content-Type", asset.mimeType);
    res.setHeader("Cache-Control", "private, max-age=3600, immutable");
    res.setHeader("ETag", `"${asset.sha256}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(asset.bytes);
  } catch (e: any) {
    if (e instanceof AgentAvatarError) {
      res.status(e.status).json({ ok: false, error: e.message, source: "local" });
      return;
    }
    res.status(500).json({ ok: false, error: e.message, source: "local" });
  }
});

api.get("/agents/:id/avatar/fallback.svg", async (req, res) => {
  const agentId = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!agentId || agentId.length > 200) {
    res.status(400).json({ ok: false, error: "valid agent id required", source: "local" });
    return;
  }
  if (!requireActiveWorkspaceAgent(agentId, res)) return;
  try {
    const fallback = await buildAgentFallbackSvg(agentId);
    const etag = `"${fallback.etag}"`;
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("ETag", etag);
    res.send(fallback.svg);
  } catch (e: any) {
    if (e instanceof AgentAvatarError) {
      res.status(e.status).json({ ok: false, error: e.message, source: "local" });
      return;
    }
    res.status(503).json({ ok: false, error: e.message, source: "gateway+local" });
  }
});

api.get("/agents/:id/avatar/models/:modelId", async (req, res) => {
  const agentId = typeof req.params.id === "string" ? req.params.id.trim() : "";
  const modelId = Number(req.params.modelId);
  if (!agentId || agentId.length > 200 || !Number.isInteger(modelId) || modelId <= 0) {
    res.status(400).json({ ok: false, error: "valid agent and 3D model ids required", source: "local" });
    return;
  }
  if (!requireActiveWorkspaceAgent(agentId, res)) return;
  try {
    const model = await readAgentAvatarModel(agentId, modelId);
    res.setHeader("Content-Type", model.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="julie-avatar-model-${modelId}.glb"`);
    res.setHeader("Cache-Control", "private, max-age=3600, immutable");
    res.setHeader("ETag", `"${model.sha256}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(model.bytes);
  } catch (e: any) {
    if (e instanceof AgentAvatarError) {
      res.status(e.status).json({ ok: false, error: e.message, source: "local" });
      return;
    }
    res.status(500).json({ ok: false, error: e.message, source: "local" });
  }
});

api.get("/agents/:id", async (req, res) => {
  const agentId = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!agentId || agentId.length > 200) {
    res.status(400).json({ ok: false, error: "valid agent id required", source: "gateway" });
    return;
  }
  if (!requireActiveWorkspaceAgent(agentId, res)) return;
  try {
    const force = req.query.refresh === "1";
    const detail = await getAgentDetail(agentId, force);
    res.setHeader("Cache-Control", "no-store");
    res.json(detail);
  } catch (e: any) {
    if (e instanceof AgentNotFoundError) {
      res.status(404).json({ ok: false, error: "agent not found", source: "gateway" });
      return;
    }
    res.status(503).json({ ok: false, error: e.message, source: "gateway" });
  }
});

api.patch("/agents/:id", async (req, res) => {
  const agentId = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!agentId || agentId.length > 200) {
    res.status(400).json({ ok: false, error: "valid agent id required", source: "gateway+local" });
    return;
  }
  if (!requireActiveWorkspaceAgent(agentId, res)) return;
  try {
    const result = await updateManagedAgent(agentId, req.body);
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (e: any) {
    if (e instanceof AgentUpdateInputError) {
      res.status(e.status).json({ ok: false, error: e.message, source: "gateway+local" });
      return;
    }
    res.status(502).json({ ok: false, error: e.message, source: "gateway" });
  }
});

api.get("/agents/:id/sessions/:sessionId/history", async (req, res) => {
  const agentId = typeof req.params.id === "string" ? req.params.id.trim() : "";
  const sessionId = typeof req.params.sessionId === "string" ? req.params.sessionId.trim() : "";
  if (!agentId || agentId.length > 200 || !sessionId || sessionId.length > 200) {
    res.status(400).json({ ok: false, error: "valid agent and session ids required", source: "gateway" });
    return;
  }
  if (!requireActiveWorkspaceAgent(agentId, res)) return;
  try {
    const history = await getAgentSessionHistory(agentId, sessionId);
    res.setHeader("Cache-Control", "no-store");
    res.json(history);
  } catch (e: any) {
    if (e instanceof AgentChatTargetError) {
      res.status(e.status).json({ ok: false, error: e.message, source: "gateway" });
      return;
    }
    res.status(503).json({ ok: false, error: e.message, source: "gateway" });
  }
});

api.post("/agents/:id/chat", async (req, res) => {
  const agentId = typeof req.params.id === "string" ? req.params.id.trim() : "";
  const sessionId = req.body?.sessionId == null ? null : (typeof req.body.sessionId === "string" ? req.body.sessionId.trim() : "");
  const message = typeof req.body?.text === "string" ? req.body.text : "";
  if (!agentId || agentId.length > 200 || sessionId === "" || (sessionId && sessionId.length > 200)) {
    res.status(400).json({ ok: false, error: "valid agent and optional session ids required", source: "gateway" });
    return;
  }
  if (!requireActiveWorkspaceAgent(agentId, res)) return;
  try {
    const result = await sendAgentMessage(agentId, sessionId, message);
    invalidateAgentDetail(agentId);
    invalidateAgentOverview();
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (e: any) {
    if (e instanceof AgentChatTargetError) {
      res.status(e.status).json({ ok: false, error: e.message, source: "gateway" });
      return;
    }
    res.status(502).json({ ok: false, error: e.message, source: "gateway" });
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
class TaskInputError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TaskInputError";
    this.status = status;
  }
}

function publicTask(row: any) {
  // Gateway session keys remain server-side. The UI only needs to know whether
  // a task has prior execution context, never the private routing identifier.
  const { gateway_session_key: gatewaySessionKey, ...task } = row;
  return { ...task, session_linked: Boolean(gatewaySessionKey) };
}

function taskSummary(rows: any[]) {
  const byStatus = Object.fromEntries(TASK_STATUSES.map((status) => [status, 0])) as Record<TaskStatus, number>;
  for (const row of rows) byStatus[row.status as TaskStatus] += 1;
  const total = rows.length;
  const done = byStatus.done;
  return {
    total,
    open: total - done,
    done,
    active: byStatus.in_progress,
    blocked: byStatus.blocked,
    highPriority: rows.filter((row) => row.priority === 1 && row.status !== "done").length,
    assigned: rows.filter((row) => Boolean(row.assigned_agent_id)).length,
    unassigned: rows.filter((row) => !row.assigned_agent_id).length,
    completionRate: total === 0 ? 0 : Math.round((done / total) * 100),
    byStatus,
  };
}

function recordTaskActivity(input: {
  taskId: number;
  actorType: "owner" | "agent" | "system";
  actorId?: string;
  eventType: string;
  details?: string;
  fromStatus?: string | null;
  toStatus?: string | null;
}): void {
  db.prepare(`
    INSERT INTO task_activity (task_id, actor_type, actor_id, event_type, details, from_status, to_status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.taskId,
    input.actorType,
    input.actorId ?? "",
    input.eventType.slice(0, 80),
    (input.details ?? "").slice(0, 2000),
    input.fromStatus ?? null,
    input.toStatus ?? null,
  );
}

async function resolveTaskAssignee(workspaceId: number, raw: unknown, current = ""): Promise<string> {
  if (raw === undefined) return current;
  if (raw === null || raw === "") return "";
  if (typeof raw !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(raw.trim())) {
    throw new TaskInputError("assignedAgentId must be a valid agent id or null");
  }
  const agentId = raw.trim();
  if (!isAgentAssignedToWorkspace(agentId, workspaceId)) {
    throw new TaskInputError("assigned agent is not assigned to this workspace", 409);
  }
  const roster = await gateway.getAgentRoster();
  if (!roster.agents.some((agent) => agent.id === agentId)) {
    throw new TaskInputError("assigned agent is not in the live Gateway roster", 409);
  }
  return agentId;
}

api.get("/tasks", (req, res) => {
  const wsId = Number(req.query.workspaceId ?? getSetting("active_workspace_id") ?? 0);
  if (!wsId) { res.json({ ok: true, tasks: [] }); return; }
  const rows = db.prepare(
    "SELECT * FROM tasks WHERE workspace_id = ? ORDER BY priority, updated_at DESC"
  ).all(wsId) as any[];
  const ids = new Set(rows.map((row) => row.id));
  res.json({
    ok: true,
    tasks: rows.map(publicTask),
    runningTaskIds: [...activeTaskRuns.keys()].filter((id) => ids.has(id)),
    summary: taskSummary(rows),
  });
});

api.post("/tasks", async (req, res) => {
  const wsId = Number(req.body?.workspaceId ?? getSetting("active_workspace_id") ?? 0);
  const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 500) : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim().slice(0, 5000) : "";
  const status = TASK_STATUSES.includes(req.body?.status) ? (req.body.status as TaskStatus) : "backlog";
  const priority = Number.isInteger(req.body?.priority) ? Math.min(3, Math.max(1, req.body.priority)) : 2;
  if (!title) { res.status(400).json({ ok: false, error: "title required" }); return; }
  if (!wsId || !db.prepare("SELECT id FROM workspaces WHERE id = ?").get(wsId)) {
    res.status(400).json({ ok: false, error: "valid workspaceId required" }); return;
  }
  try {
    const rawAssignee = Object.prototype.hasOwnProperty.call(req.body ?? {}, "assignedAgentId")
      ? req.body.assignedAgentId
      : req.body?.assigned_agent_id;
    const assignedAgentId = await resolveTaskAssignee(wsId, rawAssignee);
    const created = db.transaction(() => {
      const info = db.prepare("INSERT INTO tasks (workspace_id, title, description, status, priority, assigned_agent_id) VALUES (?, ?, ?, ?, ?, ?)")
        .run(wsId, title, description, status, priority, assignedAgentId);
      const taskId = Number(info.lastInsertRowid);
      recordTaskActivity({ taskId, actorType: "owner", eventType: "created", details: "Task created", toStatus: status });
      if (assignedAgentId) recordTaskActivity({ taskId, actorType: "owner", eventType: "assigned", details: `Assigned to ${assignedAgentId}` });
      return db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
    })();
    res.status(201).json({ ok: true, task: publicTask(created) });
  } catch (error: any) {
    if (error instanceof TaskInputError) {
      res.status(error.status).json({ ok: false, error: error.message, source: "gateway+local" });
      return;
    }
    res.status(503).json({ ok: false, error: error?.message ?? "task creation failed", source: "gateway+local" });
  }
});

api.patch("/tasks/:id", async (req, res) => {
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
  try {
    const hasCamelAssignee = Object.prototype.hasOwnProperty.call(req.body ?? {}, "assignedAgentId");
    const hasSnakeAssignee = Object.prototype.hasOwnProperty.call(req.body ?? {}, "assigned_agent_id");
    const rawAssignee = hasCamelAssignee ? req.body.assignedAgentId : hasSnakeAssignee ? req.body.assigned_agent_id : undefined;
    const assignedAgentId = await resolveTaskAssignee(task.workspace_id, rawAssignee, task.assigned_agent_id ?? "");
    const assigneeChanged = assignedAgentId !== (task.assigned_agent_id ?? "");
    if (status !== task.status && activeTaskRuns.has(task.id)) {
      res.status(409).json({ ok: false, error: "cannot change task status while it is running" });
      return;
    }
    if (assigneeChanged && activeTaskRuns.has(task.id)) {
      res.status(409).json({ ok: false, error: "cannot reassign a task while it is running" });
      return;
    }
    const updated = db.transaction(() => {
      db.prepare(`
        UPDATE tasks
        SET title = ?, description = ?, status = ?, priority = ?, assigned_agent_id = ?,
            gateway_session_key = ?, last_run_output = ?, run_started_at = ?,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?
      `).run(
        title,
        description,
        status,
        priority,
        assignedAgentId,
        assigneeChanged ? "" : task.gateway_session_key,
        lastRunOutput,
        runStartedAt,
        req.params.id,
      );
      if (task.status !== status) {
        recordTaskActivity({
          taskId: task.id,
          actorType: "owner",
          eventType: "status_changed",
          details: `${task.status} → ${status}`,
          fromStatus: task.status,
          toStatus: status,
        });
      }
      if (assigneeChanged) {
        recordTaskActivity({
          taskId: task.id,
          actorType: "owner",
          eventType: assignedAgentId ? "assigned" : "unassigned",
          details: assignedAgentId ? `Assigned to ${assignedAgentId}` : `Unassigned from ${task.assigned_agent_id}`,
        });
      }
      const otherChanged = title !== task.title || description !== task.description || priority !== task.priority;
      if (otherChanged) recordTaskActivity({ taskId: task.id, actorType: "owner", eventType: "updated", details: "Task details updated" });
      return db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
    })();
    res.json({ ok: true, task: publicTask(updated) });
  } catch (error: any) {
    if (error instanceof TaskInputError) {
      res.status(error.status).json({ ok: false, error: error.message, source: "gateway+local" });
      return;
    }
    res.status(503).json({ ok: false, error: error?.message ?? "task update failed", source: "gateway+local" });
  }
});

api.get("/tasks/:id/activity", (req, res) => {
  const task = db.prepare("SELECT id FROM tasks WHERE id = ?").get(req.params.id);
  if (!task) { res.status(404).json({ ok: false, error: "task not found" }); return; }
  const activity = db.prepare(`
    SELECT id, task_id, actor_type, actor_id, event_type, details, from_status, to_status, created_at
    FROM task_activity
    WHERE task_id = ?
    ORDER BY id DESC
    LIMIT 200
  `).all(req.params.id);
  res.json({ ok: true, activity, source: "local" });
});

api.delete("/tasks/:id", (req, res) => {
  const id = Number(req.params.id);
  if (activeTaskRuns.has(id)) { res.status(409).json({ ok: false, error: "cannot delete a task while it is running" }); return; }
  const info = db.prepare("DELETE FROM tasks WHERE id = ?").run(req.params.id);
  if (info.changes === 0) { res.status(404).json({ ok: false, error: "task not found" }); return; }
  res.json({ ok: true });
});

// ---- conversations + chat through the real gateway ----
type ConversationRow = {
  id: number;
  workspace_id: number;
  title: string;
  gateway_session_key: string;
};

function publicConversation(row: any) {
  const { gateway_session_key: _gatewaySessionKey, ...conversation } = row;
  return conversation;
}

type ConversationTurnInput = {
  conversation: ConversationRow;
  prompt: string;
  storedText: string;
  usageText?: string;
  attachments?: GatewayChatAttachment[];
  responseExtra?: Record<string, unknown>;
};

async function beginConversationTurn(input: ConversationTurnInput, res: Response): Promise<void> {
  const { conversation } = input;
  if (activeConversationRuns.has(conversation.id)) {
    res.status(409).json({ ok: false, error: "this conversation already has an active run" });
    return;
  }

  const requestRunId = `julie-${crypto.randomBytes(8).toString("hex")}`;
  const startedAt = Date.now();
  const run: ActiveConversationRun = {
    conversationId: conversation.id,
    sessionKey: conversation.gateway_session_key,
    runId: requestRunId,
    prompt: input.prompt,
    startedAt,
    state: "sending",
    streamedText: "",
    finalizing: false,
    finished: false,
  };

  const info = db.prepare("INSERT INTO messages (conversation_id, role, text) VALUES (?, 'user', ?)").run(conversation.id, input.storedText);
  db.prepare("UPDATE conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(conversation.id);
  const userMessage = db.prepare("SELECT id, role, text, created_at FROM messages WHERE id = ?").get(info.lastInsertRowid);
  if (input.usageText?.trim()) recordPromptUsage(input.usageText);

  activeConversationRuns.set(conversation.id, run);
  publishConversationEvent(conversation.id, { type: "message", message: userMessage });
  publishConversationEvent(conversation.id, { type: "run", state: "sending", startedAt });

  try {
    const accepted = await gateway.startChat(
      conversation.gateway_session_key,
      input.prompt,
      input.attachments ?? [],
      requestRunId
    );
    run.runId = accepted.runId;
    run.startedAt = accepted.startedAt;
    run.state = "accepted";
    publishConversationEvent(conversation.id, {
      type: "run",
      state: "accepted",
      gatewayStatus: accepted.status,
      startedAt: accepted.startedAt,
    });

    // Completion is detached from the HTTP response. Gateway chat events drive
    // the normal fast path; history polling remains a bounded fallback if a
    // terminal event is lost during a reconnect.
    void gateway.waitForChatReply(
      conversation.gateway_session_key,
      accepted.runId,
      CHAT_REPLY_MONITOR_TIMEOUT_MS,
      input.prompt,
      accepted.startedAt
    ).then((reply) => finishConversationRun(run, reply.text))
      .catch((error) => failConversationRun(run, error));

    res.setHeader("Cache-Control", "no-store");
    res.status(202).json({
      ok: true,
      status: "accepted",
      gatewayStatus: accepted.status,
      userMessage,
      ...(input.responseExtra ?? {}),
    });
  } catch (error: any) {
    // The Gateway never acknowledged this turn: roll back the stored user
    // message so a retry cannot look like a duplicate send.
    const storedId = (userMessage as { id: number }).id;
    try { db.prepare("DELETE FROM messages WHERE id = ?").run(storedId); } catch { /* already gone */ }
    publishConversationEvent(conversation.id, { type: "message-removed", id: storedId });
    failConversationRun(run, error);
    res.status(502).json({
      ok: false,
      error: `gateway did not acknowledge chat send: ${typeof error?.message === "string" ? error.message : "unknown error"}`,
    });
  }
}

api.get("/conversations", (req, res) => {
  const wsId = Number(req.query.workspaceId ?? getSetting("active_workspace_id") ?? 0);
  if (!wsId) { res.json({ ok: true, conversations: [] }); return; }
  const rows = db.prepare(
    "SELECT id, workspace_id, title, created_at, updated_at FROM conversations WHERE workspace_id = ? ORDER BY updated_at DESC"
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
  res.json({ ok: true, conversation: publicConversation(db.prepare("SELECT * FROM conversations WHERE id = ?").get(info.lastInsertRowid)) });
});

api.get("/conversations/:id/messages", (req, res) => {
  const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(req.params.id) as any;
  if (!conv) { res.status(404).json({ ok: false, error: "conversation not found" }); return; }
  const rows = db.prepare("SELECT id, role, text, created_at FROM messages WHERE conversation_id = ? ORDER BY id").all(conv.id);
  res.json({
    ok: true,
    messages: rows,
    activeRun: publicRunSnapshot(activeConversationRuns.get(conv.id)),
  });
});

api.post("/conversations/:id/messages", async (req, res) => {
  const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(req.params.id) as ConversationRow | undefined;
  if (!conv) { res.status(404).json({ ok: false, error: "conversation not found" }); return; }
  const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 20000) : "";
  if (!text) { res.status(400).json({ ok: false, error: "text required" }); return; }
  await beginConversationTurn({ conversation: conv, prompt: text, storedText: text, usageText: text }, res);
});

const CHAT_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const CHAT_UPLOAD_IMAGE_MAX_BYTES = 6 * 1024 * 1024;
const CHAT_UPLOAD_TEXT_EXTENSIONS = new Map<string, string>([
  ["txt", "text/plain"],
  ["text", "text/plain"],
  ["log", "text/plain"],
  ["md", "text/markdown"],
  ["markdown", "text/markdown"],
  ["csv", "text/csv"],
  ["json", "application/json"],
]);

class ChatUploadError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function cleanUploadName(raw: string): string {
  const leaf = raw.split(/[\\/]/).pop() ?? "";
  return leaf.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180);
}

function hasBytes(bytes: Buffer, signature: number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function detectChatUploadMime(bytes: Buffer, fileName: string): string | null {
  if (hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (hasBytes(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";

  const extension = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  const textMime = CHAT_UPLOAD_TEXT_EXTENSIONS.get(extension);
  if (!textMime || bytes.includes(0)) return null;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return textMime;
  } catch {
    return null;
  }
}

function extensionMatchesChatMime(fileName: string, mimeType: string): boolean {
  const extension = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  const allowed: Record<string, string[]> = {
    "image/png": ["png"],
    "image/jpeg": ["jpg", "jpeg", "jfif"],
    "image/gif": ["gif"],
    "image/webp": ["webp"],
    "application/pdf": ["pdf"],
    "text/plain": ["txt", "text", "log"],
    "text/markdown": ["md", "markdown"],
    "text/csv": ["csv"],
    "application/json": ["json"],
  };
  return Boolean(allowed[mimeType]?.includes(extension));
}

function declaredChatMimeMatches(declaredType: string, detectedType: string): boolean {
  const declared = declaredType.trim().toLowerCase().split(";", 1)[0];
  if (!declared || declared === "application/octet-stream") return true;
  if (declared === "image/jpg") return detectedType === "image/jpeg";
  if (detectedType.startsWith("text/") || detectedType === "application/json") {
    return declared.startsWith("text/") || declared === "application/json";
  }
  return declared === detectedType;
}

async function parseChatUpload(req: Request): Promise<{
  conversationId: number;
  message: string;
  attachment: GatewayChatAttachment;
}> {
  const contentType = req.get("Content-Type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType) || !Buffer.isBuffer(req.body)) {
    throw new ChatUploadError("multipart/form-data upload required", 415);
  }

  let form: FormData;
  try {
    // undici's Response.formData() is the dependency-free multipart parser.
    // The Node types for BodyInit do not fully cover typed-array views, so the
    // request body is passed through the same runtime API it came from.
    const bytes = new Uint8Array(req.body.buffer, req.body.byteOffset, req.body.byteLength);
    const ResponseCtor = globalThis.Response as unknown as new (body: unknown, init?: { headers?: Record<string, string> }) => { formData(): Promise<FormData> };
    form = await new ResponseCtor(bytes, { headers: { "Content-Type": contentType } }).formData();
  } catch {
    throw new ChatUploadError("invalid multipart upload");
  }

  const conversationId = Number(form.get("conversationId"));
  if (!Number.isInteger(conversationId) || conversationId <= 0) throw new ChatUploadError("valid conversationId required");
  const messageValue = form.get("message");
  const message = typeof messageValue === "string" ? messageValue.trim().slice(0, 20000) : "";
  const entry = form.get("file");
  if (!entry || typeof entry === "string" || typeof entry.arrayBuffer !== "function") throw new ChatUploadError("file required");

  const fileName = cleanUploadName(entry.name);
  if (!fileName) throw new ChatUploadError("valid file name required");
  if (entry.size <= 0) throw new ChatUploadError("file is empty");
  if (entry.size > CHAT_UPLOAD_MAX_BYTES) throw new ChatUploadError("file exceeds the 8 MB upload limit", 413);

  const bytes = Buffer.from(await entry.arrayBuffer());
  const mimeType = detectChatUploadMime(bytes, fileName);
  if (!mimeType || !extensionMatchesChatMime(fileName, mimeType)) {
    throw new ChatUploadError("unsupported file; use PNG, JPEG, WebP, GIF, PDF, or a UTF-8 text file");
  }
  if (!declaredChatMimeMatches(entry.type, mimeType)) throw new ChatUploadError("file content does not match its declared type");
  if (mimeType.startsWith("image/") && bytes.length > CHAT_UPLOAD_IMAGE_MAX_BYTES) {
    throw new ChatUploadError("image exceeds the 6 MB Gateway limit", 413);
  }

  return {
    conversationId,
    message,
    attachment: {
      type: mimeType.startsWith("image/") ? "image" : "file",
      mimeType,
      fileName,
      origin: "file",
      content: bytes.toString("base64"),
      sizeBytes: bytes.length,
    },
  };
}

api.post("/upload", rawBody({ type: "multipart/form-data", limit: "9mb" }), async (req, res) => {
  try {
    const upload = await parseChatUpload(req);
    const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(upload.conversationId) as ConversationRow | undefined;
    if (!conv) { res.status(404).json({ ok: false, error: "conversation not found" }); return; }

    const attachmentLabel = `📎 ${upload.attachment.fileName}`;
    const prompt = upload.message || `Please review the attached file "${upload.attachment.fileName}".`;
    const storedText = upload.message ? `${upload.message}\n\n${attachmentLabel}` : attachmentLabel;
    await beginConversationTurn({
      conversation: conv,
      prompt,
      storedText,
      usageText: upload.message,
      attachments: [upload.attachment],
      responseExtra: {
        attachment: {
          fileName: upload.attachment.fileName,
          mimeType: upload.attachment.mimeType,
          sizeBytes: upload.attachment.sizeBytes,
        },
      },
    }, res);
  } catch (error) {
    if (error instanceof ChatUploadError) {
      res.status(error.status).json({ ok: false, error: error.message });
      return;
    }
    res.status(500).json({ ok: false, error: "upload failed" });
  }
});

// ---- streaming: SSE forward of gateway chat deltas per conversation ----
api.get("/conversations/:id/events", (req, res) => {
  const conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(req.params.id) as ConversationRow | undefined;
  if (!conv) { res.status(404).json({ ok: false, error: "conversation not found" }); return; }
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");
  const send = (obj: unknown) => {
    try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* client gone */ }
  };
  send({ type: "hello", conversationId: conv.id, activeRun: publicRunSnapshot(activeConversationRuns.get(conv.id)) });
  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { /* client gone */ }
  }, 15000);
  const subscribers = conversationSubscribers.get(conv.id) ?? new Set<ConversationSubscriber>();
  subscribers.add(send);
  conversationSubscribers.set(conv.id, subscribers);
  req.on("close", () => {
    clearInterval(heartbeat);
    subscribers.delete(send);
    if (subscribers.size === 0) conversationSubscribers.delete(conv.id);
  });
});

api.delete("/conversations/:id", (req, res) => {
  const conversationId = Number(req.params.id);
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    res.status(400).json({ ok: false, error: "valid conversation id required" });
    return;
  }
  if (activeConversationRuns.has(conversationId)) {
    res.status(409).json({ ok: false, error: "cannot delete a conversation while Julie is working" });
    return;
  }
  const info = db.prepare("DELETE FROM conversations WHERE id = ?").run(conversationId);
  if (info.changes === 0) { res.status(404).json({ ok: false, error: "conversation not found" }); return; }
  res.json({ ok: true });
});

// ---- task automation bridge (B-3): run a ready task through the gateway ----
// Lifecycle: ready -> in_progress -> pending_review (or blocked on failure).
// Execution goes through the real OpenClaw agent registry: chat.send to the
// orchestrator agent (agent:main) on a stable per-task session key.
const activeTaskRuns = new Map<number, { startedAt: string; agentId: string }>();

function taskRunPrompt(task: { id: number; title: string; description: string }, agentId: string): string {
  const desc = task.description.trim();
  return [
    `Execute this JULIE task from the task board.`,
    `Task ID: ${task.id}`,
    `Assigned agent: ${agentId}`,
    `Task: ${task.title}`,
    desc ? `\nDescription:\n${desc}` : "",
    `\nWork on it now using your available tools. When finished, reply with a short result summary as the final answer.`,
  ].join("");
}

api.post("/tasks/:id/run", async (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id) as any;
  if (!task) { res.status(404).json({ ok: false, error: "task not found" }); return; }
  if (activeTaskRuns.has(task.id)) { res.status(409).json({ ok: false, error: "task is already running" }); return; }
  if (task.status !== "ready") {
    res.status(409).json({ ok: false, error: `task must be in 'ready' to run (current: ${task.status})` });
    return;
  }
  const agentId = task.assigned_agent_id || "main";
  try {
    if (task.assigned_agent_id && !isAgentAssignedToWorkspace(agentId, task.workspace_id)) {
      res.status(409).json({ ok: false, error: "assigned agent is no longer assigned to this workspace" });
      return;
    }
    const roster = await gateway.getAgentRoster();
    if (!roster.agents.some((agent) => agent.id === agentId)) {
      res.status(409).json({ ok: false, error: "task agent is not in the live Gateway roster" });
      return;
    }
  } catch (error: any) {
    res.status(503).json({ ok: false, error: error?.message ?? "could not validate task agent", source: "gateway" });
    return;
  }

  const expectedPrefix = `agent:${agentId}:`;
  const sessionKey = typeof task.gateway_session_key === "string" && task.gateway_session_key.startsWith(expectedPrefix)
    ? task.gateway_session_key
    : `${expectedPrefix}julie-task-${task.id}`;
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      "UPDATE tasks SET status = 'in_progress', run_started_at = ?, gateway_session_key = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
    ).run(now, sessionKey, task.id);
    recordTaskActivity({
      taskId: task.id,
      actorType: "system",
      actorId: agentId,
      eventType: "run_started",
      details: `Execution accepted for ${agentId}`,
      fromStatus: task.status,
      toStatus: "in_progress",
    });
  })();
  activeTaskRuns.set(task.id, { startedAt: now, agentId });

  // Background execution; never blocks the HTTP response.
  gateway.chat(sessionKey, taskRunPrompt(task, agentId), 600000)
    .then((reply) => {
      const output = (reply.text || "(gateway returned no output)").slice(0, 20000);
      db.transaction(() => {
        db.prepare(
          "UPDATE tasks SET status = 'pending_review', last_run_output = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
        ).run(output, task.id);
        recordTaskActivity({
          taskId: task.id,
          actorType: "agent",
          actorId: agentId,
          eventType: "run_completed",
          details: "Agent returned a result for owner review",
          fromStatus: "in_progress",
          toStatus: "pending_review",
        });
      })();
    })
    .catch((e: any) => {
      const message = `Run failed: ${e?.message ?? "unknown error"}`.slice(0, 20000);
      db.transaction(() => {
        db.prepare(
          "UPDATE tasks SET status = 'blocked', last_run_output = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
        ).run(message, task.id);
        recordTaskActivity({
          taskId: task.id,
          actorType: "system",
          actorId: agentId,
          eventType: "run_failed",
          details: message.slice(0, 1000),
          fromStatus: "in_progress",
          toStatus: "blocked",
        });
      })();
    })
    .finally(() => activeTaskRuns.delete(task.id));

  res.status(202).json({ ok: true, status: "accepted", task: publicTask(db.prepare("SELECT * FROM tasks WHERE id = ?").get(task.id)) });
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

// ---- OpenCode bridge (read-only; E3-07) ----
// Direct owner access to the real OpenCode v2 background service. Every route
// here is a GET that reads the live service never fabricates data. Writes go
// through E3-09 later, not through this bridge.
function opencodeErrorStatus(e: unknown): { status: number; error: string } {
  if (e instanceof OpencodeUnavailableError) return { status: 503, error: e.message };
  if (e instanceof OpencodeForbiddenError) return { status: e.status, error: e.message };
  if (e instanceof OpencodeAvailableError) return { status: e.status, error: e.message };
  const message = e instanceof Error ? e.message : "OpenCode request failed";
  return { status: 502, error: message };
}

api.get("/opencode/status", async (_req, res) => {
  try {
    const status = await getOpencodeStatus();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, ...status });
  } catch (e: unknown) {
    const { status, error } = opencodeErrorStatus(e);
    res.status(status).json({ ok: false, available: false, error, checkedAt: new Date().toISOString() });
  }
});

api.get("/opencode/sessions", async (req, res) => {
  const limit = Number(req.query.limit ?? NaN);
  try {
    const result = await listOpencodeSessions({ limit: Number.isFinite(limit) ? limit : undefined });
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, ...result });
  } catch (e: unknown) {
    const { status, error } = opencodeErrorStatus(e);
    res.status(status).json({ ok: false, sessions: [], error, source: "opencode" });
  }
});

api.get("/opencode/sessions/:sid/messages", async (req, res) => {
  const limit = Number(req.query.limit ?? NaN);
  try {
    const result = await listOpencodeSessionMessages(req.params.sid, { limit: Number.isFinite(limit) ? limit : undefined });
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, ...result });
  } catch (e: unknown) {
    const { status, error } = opencodeErrorStatus(e);
    res.status(status).json({ ok: false, messages: [], error, source: "opencode" });
  }
});

api.get("/opencode/agents", async (_req, res) => {
  try {
    const result = await listOpencodeAgents();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, ...result });
  } catch (e: unknown) {
    const { status, error } = opencodeErrorStatus(e);
    res.status(status).json({ ok: false, agents: [], error, source: "opencode" });
  }
});

api.get("/opencode/stats", async (_req, res) => {
  try {
    const result = await getOpencodeStats();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, ...result });
  } catch (e: unknown) {
    const { status, error } = opencodeErrorStatus(e);
    res.status(status).json({ ok: false, stats: null, error, source: "opencode" });
  }
});

api.get("/opencode/active", async (_req, res) => {
  try {
    const result = await listOpencodeActiveSessions();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, ...result });
  } catch (e: unknown) {
    const { status, error } = opencodeErrorStatus(e);
    res.status(status).json({ ok: false, active: [], error, source: "opencode" });
  }
});

api.get("/opencode/projects", async (_req, res) => {
  try {
    const result = await listOpencodeProjects();
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, ...result });
  } catch (e: unknown) {
    const { status, error } = opencodeErrorStatus(e);
    res.status(status).json({ ok: false, projects: [], error, source: "opencode" });
  }
});
