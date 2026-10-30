import { db } from "./db.js";
import { gateway } from "./gateway.js";
import { publicAgentSession, resolveAgentSession } from "./agent-chat.js";
import { invalidateAgentDetail } from "./agent-detail.js";
import { invalidateAgentOverview } from "./agent-overview.js";

export class AgentSessionControlError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AgentSessionControlError";
    this.status = status;
  }
}

function audit(command: string, started: number): void {
  db.prepare("INSERT INTO audit_logs (command, exit_code, duration_ms) VALUES (?, 0, ?)")
    .run(command, Date.now() - started);
}

function cleanLabel(value: unknown): string {
  if (typeof value !== "string") throw new AgentSessionControlError("session title required");
  const label = value.replace(/[\r\n\0]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  if (!label) throw new AgentSessionControlError("session title required");
  return label;
}

async function refreshed(agentId: string, sessionId: string) {
  const target = await resolveAgentSession(agentId, sessionId, true);
  return publicAgentSession(target.row);
}

export async function renameAgentSession(agentId: string, sessionId: string, rawTitle: unknown) {
  const started = Date.now();
  const target = await resolveAgentSession(agentId, sessionId, true);
  await gateway.patchSession({
    key: target.key,
    agentId,
    expectedSessionId: sessionId,
    label: cleanLabel(rawTitle),
  });
  invalidateAgentDetail(agentId);
  invalidateAgentOverview();
  audit(`agent.session.rename:${agentId}`, started);
  return { ok: true as const, source: "gateway" as const, agentId, session: await refreshed(agentId, sessionId) };
}

export async function setAgentSessionArchived(agentId: string, sessionId: string, archived: boolean) {
  const started = Date.now();
  const target = await resolveAgentSession(agentId, sessionId, true);
  if (target.row?.hasActiveRun === true) throw new AgentSessionControlError("stop the active run before changing archive state", 409);
  await gateway.patchSession({
    key: target.key,
    agentId,
    expectedSessionId: sessionId,
    archived,
  });
  invalidateAgentDetail(agentId);
  invalidateAgentOverview();
  audit(`agent.session.${archived ? "archive" : "restore"}:${agentId}`, started);
  return { ok: true as const, source: "gateway" as const, agentId, session: await refreshed(agentId, sessionId) };
}

export async function abortAgentSession(agentId: string, sessionId: string) {
  const started = Date.now();
  const target = await resolveAgentSession(agentId, sessionId, true);
  await gateway.abortSession({ key: target.key, clearQueued: true });
  invalidateAgentDetail(agentId);
  invalidateAgentOverview();
  audit(`agent.session.abort:${agentId}`, started);
  return { ok: true as const, source: "gateway" as const, agentId, sessionId, status: "abort_requested" as const };
}

export async function deleteAgentSession(agentId: string, sessionId: string, confirmed: boolean) {
  if (!confirmed) throw new AgentSessionControlError("session deletion confirmation required");
  const started = Date.now();
  const target = await resolveAgentSession(agentId, sessionId, true);
  if (target.row?.hasActiveRun === true) throw new AgentSessionControlError("stop the active run before deleting the session", 409);
  if (target.row?.archived !== true) {
    await gateway.patchSession({
      key: target.key,
      agentId,
      expectedSessionId: sessionId,
      archived: true,
    });
  }
  const result = await gateway.deleteSession({
    key: target.key,
    agentId,
    expectedSessionId: sessionId,
    archivedOnly: true,
    deleteTranscript: true,
  });
  invalidateAgentDetail(agentId);
  invalidateAgentOverview();
  audit(`agent.session.delete:${agentId}`, started);
  return {
    ok: true as const,
    source: "gateway" as const,
    agentId,
    sessionId,
    deleted: result?.deleted === true,
    transcriptArchived: Array.isArray(result?.archived) && result.archived.length > 0,
  };
}
