import crypto from "node:crypto";
import { gateway } from "./gateway.js";

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

function sanitizeMessageText(value: string): string {
  return value
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

async function allAgentSessions(agentId: string): Promise<any[]> {
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

function publicSession(row: any) {
  return {
    sessionId: safeText(row?.sessionId, 200),
    displayName: safeText(row?.displayName, 500) ?? "Untitled session",
    status: safeText(row?.status, 80),
    hasActiveRun: row?.hasActiveRun === true,
    lastActivityAt: optionalNumber(row?.lastActivityAt) ?? optionalNumber(row?.updatedAt),
    model: safeText(row?.model, 300),
  };
}

async function resolveSession(agentId: string, sessionId: string): Promise<{ key: string; row: any }> {
  await assertAgent(agentId);
  const rows = await allAgentSessions(agentId);
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
  const target = await resolveSession(agentId, sessionId);
  const history = await gateway.chatHistory(target.key);
  return {
    ok: true,
    source: "gateway",
    agentId,
    session: publicSession(target.row),
    messages: sanitizeHistory(history),
    truncated: history.length > 120,
  };
}

export async function sendAgentMessage(agentId: string, sessionId: string | null, rawText: string) {
  await assertAgent(agentId);
  const message = rawText.trim().slice(0, 20_000);
  if (!message) throw new AgentChatTargetError("message required", 400);

  let sessionKey: string;
  let previousRow: any = null;
  if (sessionId) {
    const target = await resolveSession(agentId, sessionId);
    sessionKey = target.key;
    previousRow = target.row;
  } else {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(agentId)) {
      throw new AgentChatTargetError("this agent id cannot be used for a new Julie session", 400);
    }
    sessionKey = `agent:${agentId}:julie-agent-chat-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
  }

  const reply = await gateway.chat(sessionKey, message);
  const history = await gateway.chatHistory(sessionKey);
  const rows = await allAgentSessions(agentId);
  const row = rows.find((candidate) => candidate?.key === sessionKey) ?? previousRow;

  return {
    ok: true,
    source: "gateway",
    status: "completed",
    agentId,
    session: row ? publicSession(row) : { sessionId: sessionId ?? null, displayName: "Agent conversation", status: "done", hasActiveRun: false, lastActivityAt: Date.now(), model: null },
    reply: reply.text,
    messages: sanitizeHistory(history),
    truncated: history.length > 120,
  };
}
