import crypto from "node:crypto";
import { db } from "./db.js";
import { gateway, type GatewayChatAttachment } from "./gateway.js";
import { engineeringRuntimeContext } from "./engineering-policy.js";
import { allAgentSessions, prepareAgentChatSession, publicAgentSession } from "./agent-chat.js";
import { agentDirectoryContext, composeAgentPrompt, delegationDirective, loadAgentDirectory, resolveAgentMentions } from "./agent-directory.js";
import { julieOperationsContext } from "./julie-operations.js";
import { invalidateAgentDetail } from "./agent-detail.js";
import { invalidateAgentOverview } from "./agent-overview.js";

type AgentTurnState = "queued" | "accepted" | "complete" | "cancel_requested" | "cancelled" | "error";

type AgentTurn = {
  turnId: string;
  agentId: string;
  sessionId: string;
  sessionKey: string;
  gatewayRunId: string;
  state: AgentTurnState;
  text: string;
  createdAt: number;
  updatedAt: number;
  reply?: string;
  error?: string;
};

type Subscriber = (event: Record<string, unknown>) => void;
const turnsBySession = new Map<string, AgentTurn[]>();
const subscribers = new Map<string, Set<Subscriber>>();

function isTerminal(state: AgentTurnState): boolean {
  return state === "complete" || state === "cancelled" || state === "error";
}

function publicTurn(turn: AgentTurn) {
  return {
    turnId: turn.turnId,
    state: turn.state,
    text: turn.text,
    createdAt: turn.createdAt,
    updatedAt: turn.updatedAt,
    ...(turn.reply ? { reply: turn.reply } : {}),
    ...(turn.error ? { error: turn.error } : {}),
  };
}

function publish(sessionId: string, event: Record<string, unknown>): void {
  for (const subscriber of subscribers.get(sessionId) ?? []) {
    try { subscriber(event); } catch { /* disconnected client */ }
  }
}

function retain(turn: AgentTurn): void {
  const rows = turnsBySession.get(turn.sessionId) ?? [];
  rows.push(turn);
  turnsBySession.set(turn.sessionId, rows.slice(-50));
}

export function listAgentTurns(sessionId: string) {
  return (turnsBySession.get(sessionId) ?? []).map(publicTurn);
}

export function subscribeAgentTurns(sessionId: string, subscriber: Subscriber): () => void {
  const rows = subscribers.get(sessionId) ?? new Set<Subscriber>();
  rows.add(subscriber);
  subscribers.set(sessionId, rows);
  return () => {
    rows.delete(subscriber);
    if (rows.size === 0) subscribers.delete(sessionId);
  };
}

// A terminal lifecycle frame is authoritative even when the reply wait is still
// polling. Reflect a failure or an intentional stop as soon as the Gateway says
// so, so the owner never watches a dead run appear to continue.
gateway.subscribeAgentEvents((event) => {
  if (event.stream !== "lifecycle" || !event.sessionKey) return;
  const phase = typeof event.data.phase === "string" ? event.data.phase : "";
  if (phase !== "end" && phase !== "error") return;
  const aborted = event.data.aborted === true;
  const stopReason = typeof event.data.stopReason === "string" ? event.data.stopReason : "";
  const stopped = aborted || /abort|cancel|stop|timeout|interrupt/i.test(stopReason);
  const error = event.data.error as { message?: unknown } | string | undefined;
  const errorMessage = typeof error === "string" ? error : typeof error?.message === "string" ? error.message : "";
  for (const turns of turnsBySession.values()) {
    for (const turn of turns) {
      if (turn.sessionKey !== event.sessionKey || isTerminal(turn.state)) continue;
      turn.state = phase === "error" && !stopped ? "error" : stopped ? "cancelled" : turn.state;
      if (turn.state === "error" || turn.state === "cancelled") {
        turn.error = (phase === "error" ? errorMessage || "agent run failed" : `stopped${stopReason ? ` (${stopReason})` : ""}`).slice(0, 1000);
        turn.updatedAt = Date.now();
        publish(turn.sessionId, { type: "turn", turn: publicTurn(turn) });
      }
    }
  }
});

export async function startAgentTurn(
  agentId: string,
  sessionId: string | null,
  rawText: unknown,
  rawTitle?: unknown,
  attachments: GatewayChatAttachment[] = [],
  options: {
    skipDelegation?: boolean;
    onComplete?: (outcome: { state: AgentTurnState; reply?: string; error?: string }) => void;
  } = {},
) {
  const text = typeof rawText === "string" ? rawText.trim().slice(0, 20_000) : "";
  if (!text) throw new Error("message required");
  const prepared = await prepareAgentChatSession(agentId, sessionId, text, rawTitle);
  const existing = turnsBySession.get(prepared.sessionId) ?? [];
  const busy = prepared.row?.hasActiveRun === true || existing.some((turn) => !isTerminal(turn.state));
  const turnId = crypto.randomUUID();
  const runtimeContext = await engineeringRuntimeContext(agentId);
  const directoryContext = await agentDirectoryContext();

  // Julie orchestrates: an owner @mention is dispatched to the named agent's own
  // durable, named session before Julie's turn runs, so the work cannot silently
  // fall back to Julie doing it herself.
  let directive = "";
  if (agentId === "main" && !options.skipDelegation) {
    const entries = await loadAgentDirectory();
    const { matched, unknown } = resolveAgentMentions(text, entries);
    if (matched.length > 0) {
      const dispatched: Array<{ entry: (typeof matched)[number]; sessionId: string }> = [];
      const failures: string[] = [];
      for (const entry of matched) {
        try {
          const child = await startAgentTurn(
            entry.agentId,
            null,
            text,
            `Delegated by Julie · ${text.split(/\r?\n/, 1)[0].slice(0, 80)}`,
            [],
            { skipDelegation: true },
          );
          dispatched.push({ entry, sessionId: child.session.sessionId ?? "session id unavailable" });
        } catch (error) {
          failures.push(`${entry.humanName} (${entry.agentId}): ${error instanceof Error ? error.message : "dispatch failed"}`);
        }
      }
      directive = delegationDirective({ ownerMessage: text, matched, unknown, dispatched });
      if (failures.length > 0) directive += `\nDelegation failures you must report honestly: ${failures.join("; ")}.`;
      if (dispatched.length > 0) {
        db.prepare("INSERT INTO settings (key, value) VALUES ('last_delegation', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
          .run(JSON.stringify({ at: new Date().toISOString(), from: agentId, dispatched: dispatched.map((row) => ({ agentId: row.entry.agentId, humanName: row.entry.humanName, sessionId: row.sessionId })) }));
      }
    } else if (unknown.length > 0) {
      directive = delegationDirective({ ownerMessage: text, matched, unknown, dispatched: [] });
    }
  }

  const prompt = composeAgentPrompt([
    agentId === "main" ? julieOperationsContext() : "",
    directoryContext,
    directive,
    runtimeContext,
  ], text);
  let accepted: Awaited<ReturnType<typeof gateway.startChat>>;
  try {
    accepted = await gateway.startChat(
      prepared.sessionKey,
      prompt,
      attachments,
      `julie-agent-${crypto.randomBytes(10).toString("hex")}`,
      { queueMode: busy ? "followup" : undefined },
    );
  } catch (error) {
    if (prepared.created) {
      await gateway.deleteSession({
        key: prepared.sessionKey,
        agentId,
        expectedSessionId: prepared.sessionId,
        deleteTranscript: true,
      }).catch(() => {});
    }
    throw error;
  }

  const now = Date.now();
  const turn: AgentTurn = {
    turnId,
    agentId,
    sessionId: prepared.sessionId,
    sessionKey: prepared.sessionKey,
    gatewayRunId: accepted.runId,
    state: accepted.status === "queued" || busy ? "queued" : "accepted",
    text,
    createdAt: now,
    updatedAt: now,
  };
  retain(turn);
  publish(turn.sessionId, { type: "turn", turn: publicTurn(turn) });

  void gateway.waitForChatReply(prepared.sessionKey, accepted.runId, 10 * 60_000, prompt, accepted.startedAt)
    .then((reply) => {
      turn.state = "complete";
      turn.reply = reply.text;
      turn.updatedAt = Date.now();
      invalidateAgentDetail(agentId);
      invalidateAgentOverview();
      publish(turn.sessionId, { type: "turn", turn: publicTurn(turn) });
      options.onComplete?.({ state: "complete", reply: reply.text });
    })
    .catch((error: any) => {
      const message = typeof error?.message === "string" ? error.message : "agent turn failed";
      turn.state = turn.state === "cancel_requested" || /abort|cancel/i.test(message) ? "cancelled" : "error";
      turn.error = message.slice(0, 1000);
      turn.updatedAt = Date.now();
      invalidateAgentDetail(agentId);
      invalidateAgentOverview();
      publish(turn.sessionId, { type: "turn", turn: publicTurn(turn) });
      options.onComplete?.({ state: turn.state, error: turn.error });
    });

  const rows = await allAgentSessions(agentId);
  const row = rows.find((candidate) => candidate?.key === prepared.sessionKey) ?? prepared.row;
  return {
    ok: true as const,
    source: "gateway" as const,
    status: turn.state,
    agentId,
    sessionKey: prepared.sessionKey,
    session: row ? publicAgentSession(row) : {
      sessionId: prepared.sessionId,
      displayName: prepared.title,
      status: turn.state,
      hasActiveRun: true,
      lastActivityAt: now,
      model: null,
      archived: false,
    },
    turn: publicTurn(turn),
  };
}

export async function cancelAgentTurn(agentId: string, sessionId: string, turnId: string) {
  const turn = (turnsBySession.get(sessionId) ?? []).find((candidate) => candidate.turnId === turnId && candidate.agentId === agentId);
  if (!turn) throw new Error("queued turn not found");
  if (isTerminal(turn.state)) return { ok: true as const, source: "gateway" as const, turn: publicTurn(turn) };
  const previousState = turn.state;
  turn.state = "cancel_requested";
  turn.updatedAt = Date.now();
  publish(sessionId, { type: "turn", turn: publicTurn(turn) });
  try {
    await gateway.abortSession({ runId: turn.gatewayRunId });
  } catch (error) {
    if (turn.state === "cancel_requested") turn.state = previousState;
    turn.updatedAt = Date.now();
    publish(sessionId, { type: "turn", turn: publicTurn(turn) });
    throw error;
  }
  return { ok: true as const, source: "gateway" as const, turn: publicTurn(turn) };
}
