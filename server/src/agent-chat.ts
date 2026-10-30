import crypto from "node:crypto";
import { gateway } from "./gateway.js";
import { engineeringRuntimeContext, stripEngineeringRuntimeContext, wrapEngineeringOwnerMessage } from "./engineering-policy.js";
import { stripJulieOperationsContext } from "./julie-operations.js";

export class AgentChatTargetError extends Error {
  status: number;

  constructor(message: string, status = 404) {
    super(message);
    this.name = "AgentChatTargetError";
    this.status = status;
  }
}

function safeText(value: unknown, max = 500): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function sanitizeMessageText(value: string): string {
  return stripJulieOperationsContext(stripEngineeringRuntimeContext(value))
    .replace(/-----BEGIN [^-\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\n]*PRIVATE KEY-----/gi, "[redacted private key]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]")
    .replace(/\b(api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|client[_ -]?secret)\s*[:=]\s*["']?[^\s"'`]+/gi, "$1=[redacted]")
    .replace(/\/home\/[^/\s]+\/\.openclaw(?:\/[^\s`"'<>)]*)?/g, "[OpenClaw path]");
}

async function assertAgent(agentId: string): Promise<void> {
  const roster = await gateway.getAgentRoster();
  if (!roster.agents.some((agent) => agent.id === agentId)) {
    throw new AgentChatTargetError("agent not found", 404);
  }
}

export async function allAgentSessions(agentId: string, archived: false | true | "all" = false): Promise<any[]> {
  const rows: any[] = [];
  let offset = 0;
  for (let page = 0; page < 5; page += 1) {
    const result = await gateway.listSessions({
      agentId,
      limit: 200,
      offset,
      excludeCron: true,
      excludeSystem: true,
      excludeDock: true,
      ...(archived === false ? {} : { archived }),
    });
    const batch = Array.isArray(result?.sessions) ? result.sessions : [];
    rows.push(...batch);
    if (result?.hasMore !== true) break;
    const nextOffset = typeof result?.nextOffset === "number" ? result.nextOffset : offset + batch.length;
    if (nextOffset <= offset || batch.length === 0) break;
    offset = nextOffset;
  }
  return rows;
}

export function publicAgentSession(row: any) {
  return {
    sessionId: safeText(row?.sessionId, 200),
    displayName: safeText(row?.displayName, 500) ?? safeText(row?.label, 500) ?? "Untitled session",
    status: safeText(row?.status, 80),
    hasActiveRun: row?.hasActiveRun === true,
    lastActivityAt: optionalNumber(row?.lastActivityAt) ?? optionalNumber(row?.updatedAt),
    model: safeText(row?.model, 300),
    archived: row?.archived === true,
  };
}

export async function resolveAgentSession(agentId: string, sessionId: string, includeArchived = false): Promise<{ key: string; row: any }> {
  await assertAgent(agentId);
  const rows = await allAgentSessions(agentId, includeArchived ? "all" : false);
  const row = rows.find((candidate) => candidate?.sessionId === sessionId);
  if (!row || typeof row.key !== "string" || !row.key) {
    throw new AgentChatTargetError("agent session not found", 404);
  }
  if (typeof row.agentId === "string" && row.agentId !== agentId) {
    throw new AgentChatTargetError("session does not belong to this agent", 403);
  }
  return { key: row.key, row };
}

function sanitizeHistory(messages: Awaited<ReturnType<typeof gateway.chatHistory>>) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .filter((message) => typeof message.text === "string" && Boolean(message.text.trim()))
    .slice(-120)
    .map((message, index) => ({
      id: index + 1,
      role: message.role,
      text: sanitizeMessageText(message.text).slice(0, 20_000),
      timestamp: optionalNumber(message.timestamp),
    }));
}

export async function getAgentSessionHistory(agentId: string, sessionId: string) {
  const target = await resolveAgentSession(agentId, sessionId);
  const history = await gateway.chatHistory(target.key);
  return {
    ok: true,
    source: "gateway",
    agentId,
    session: publicAgentSession(target.row),
    messages: sanitizeHistory(history),
    truncated: history.length > 120,
  };
}

export function directSessionTitle(rawTitle: unknown, message: string): string {
  const requested = typeof rawTitle === "string" ? rawTitle.replace(/[\r\n\0]+/g, " ").replace(/\s+/g, " ").trim() : "";
  if (requested) return requested.slice(0, 160);
  const firstLine = message.split(/\r?\n/, 1)[0].replace(/\s+/g, " ").trim();
  return (firstLine || "Agent conversation").slice(0, 100);
}

// OpenClaw can clear a generated `displayName` when background title generation
// fails (for example, an unavailable utility model), which leaves a real session
// unnamed. A session `label` is durable and is projected as the display name, so
// we claim one at creation time. Labels are unique per store; a collision gets a
// short suffix instead of an unnamed session.
async function createNamedSession(sessionKey: string, agentId: string, title: string) {
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 140) || "Agent conversation";
  try {
    return await gateway.createSession({ key: sessionKey, agentId, displayName: clean, label: clean });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/label already in use/i.test(message)) throw error;
    const unique = `${clean} · ${crypto.randomBytes(3).toString("hex")}`;
    return gateway.createSession({ key: sessionKey, agentId, displayName: unique, label: unique });
  }
}

export async function prepareAgentChatSession(agentId: string, sessionId: string | null, message: string, rawTitle?: unknown) {
  await assertAgent(agentId);
  if (sessionId) {
    const target = await resolveAgentSession(agentId, sessionId);
    return { sessionKey: target.key, sessionId, row: target.row, created: false, title: target.row?.displayName ?? "Agent conversation" };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(agentId)) {
    throw new AgentChatTargetError("this agent id cannot be used for a new Julie session", 400);
  }
  const sessionKey = `agent:${agentId}:julie-agent-chat-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
  const title = directSessionTitle(rawTitle, message);
  const created = await createNamedSession(sessionKey, agentId, title);
  let createdSessionId = safeText(created?.sessionId, 200)
    ?? safeText(created?.session?.sessionId, 200)
    ?? safeText(created?.entry?.sessionId, 200);
  let row: any = null;
  if (!createdSessionId) {
    const createdRows = await allAgentSessions(agentId);
    row = createdRows.find((candidate) => candidate?.key === sessionKey) ?? null;
    createdSessionId = safeText(row?.sessionId, 200);
  }
  if (!createdSessionId) throw new AgentChatTargetError("Gateway created a session without a durable session id", 502);
  return { sessionKey, sessionId: createdSessionId, row, created: true, title };
}

export async function sendAgentMessage(agentId: string, sessionId: string | null, rawText: string, rawTitle?: unknown) {
  const message = rawText.trim().slice(0, 20_000);
  if (!message) throw new AgentChatTargetError("message required", 400);
  const prepared = await prepareAgentChatSession(agentId, sessionId, message, rawTitle);

  const runtimeContext = await engineeringRuntimeContext(agentId);
  let reply: Awaited<ReturnType<typeof gateway.chat>>;
  try {
    reply = await gateway.chat(prepared.sessionKey, wrapEngineeringOwnerMessage(runtimeContext, message));
  } catch (error) {
    // A newly-created session whose first turn never completed is exactly the
    // empty/unnamed clutter this path is designed to prevent.
    if (prepared.created) {
      await gateway.deleteSession({ key: prepared.sessionKey, agentId, expectedSessionId: prepared.sessionId, deleteTranscript: true }).catch(() => {});
    }
    throw error;
  }
  const history = await gateway.chatHistory(prepared.sessionKey);
  const rows = await allAgentSessions(agentId);
  const row = rows.find((candidate) => candidate?.key === prepared.sessionKey) ?? prepared.row;

  return {
    ok: true,
    source: "gateway",
    status: "completed",
    agentId,
    session: row ? publicAgentSession(row) : { sessionId: prepared.sessionId, displayName: prepared.title, status: "done", hasActiveRun: false, lastActivityAt: Date.now(), model: null, archived: false },
    reply: reply.text,
    messages: sanitizeHistory(history),
    truncated: history.length > 120,
  };
}
