import { db } from "./db.js";
import { gateway, type AgentStreamEvent } from "./gateway.js";

// Observable agent activity: every structured Gateway `agent` frame is reduced
// into one durable row so the owner can see what an agent actually did — a
// command it ran, a file it edited, an approval it is waiting on, and whether
// the run finished, failed, or was stopped. Nothing here is synthesized: a row
// exists only because the Gateway emitted the corresponding frame.

export type AgentActionKind = "tool" | "run" | "note";

export type AgentAction = {
  id: number;
  sessionKey: string;
  sessionId: string;
  runId: string;
  kind: AgentActionKind;
  phase: string;
  name: string;
  title: string;
  status: "running" | "completed" | "failed" | "blocked" | "stopped" | "unknown";
  detail: string;
  output: string;
  isError: boolean;
  createdAt: string;
  updatedAt: string;
};

type ActionSubscriber = (action: AgentAction) => void;
const subscribers = new Map<string, Set<ActionSubscriber>>();

// `run_actions` is part of the versioned schema in db.ts; this module must not
// create tables at import time.

function text(value: unknown, max = 8000): string {
  if (typeof value === "string") return value.slice(0, max);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function resultText(result: unknown): string {
  const body = record(result);
  const content = Array.isArray(body.content) ? body.content : [];
  const parts: string[] = [];
  for (const part of content) {
    const row = record(part);
    if (typeof row.text === "string" && row.text.trim()) parts.push(row.text);
    else if (row.type === "image") parts.push("[image]");
  }
  if (parts.length === 0 && typeof body.text === "string") parts.push(body.text);
  if (parts.length === 0 && typeof body.output === "string") parts.push(body.output);
  return parts.join("\n").trim().slice(0, 8000);
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

// Human, honest labels. The raw tool name and arguments stay available in the
// expanded row; the title says what the agent touched, not that it succeeded.
function describeTool(name: string, args: Record<string, any>): { title: string; detail: string } {
  const command = firstString(args.command, args.cmd, args.script, args.argv);
  const path = firstString(args.path, args.file, args.file_path, args.filename, args.target, args.pattern);
  const query = firstString(args.query, args.q, args.url);
  switch (name) {
    case "exec":
    case "bash":
    case "shell":
    case "process":
      return { title: "Ran a command", detail: command };
    case "read":
      return { title: "Read a file", detail: path || query };
    case "write":
      return { title: "Wrote a file", detail: path };
    case "edit":
    case "apply_patch":
    case "str_replace_editor":
      return { title: path ? `Edited ${path}` : "Edited a file", detail: path || command };
    case "ls":
    case "list":
    case "glob":
      return { title: "Listed files", detail: path || query };
    case "grep":
      return { title: "Searched files", detail: query || path };
    case "web_fetch":
    case "web_search":
      return { title: "Searched the web", detail: query };
    case "sessions_send":
    case "sessions_spawn":
      return { title: "Delegated to another agent", detail: firstString(args.agentId, args.agent, args.label, args.message) };
    case "sessions_history":
      return { title: "Read session history", detail: firstString(args.sessionKey, args.sessionId) };
    default:
      return { title: `Used ${name}`, detail: command || path || query };
  }
}

type NormalizedAction = {
  actionKey: string;
  kind: AgentActionKind;
  phase: string;
  name: string;
  title: string;
  status: AgentAction["status"];
  detail: string;
  output: string;
  isError: boolean;
};

function normalize(event: AgentStreamEvent): NormalizedAction | null {
  const data = event.data;
  if (event.stream === "tool") {
    const phase = text(data.phase, 20) || "start";
    const toolCallId = firstString(data.toolCallId, data.itemId) || `${event.seq ?? 0}`;
    const name = firstString(data.name) || "tool";
    const args = record(data.args);
    const described = describeTool(name, args);
    const isResult = phase === "result" || phase === "end";
    const isError = data.isError === true;
    const status: AgentAction["status"] = isResult
      ? isError ? "failed" : data.status === "blocked" || data.status === "skipped" ? "blocked" : "completed"
      : "running";
    return {
      actionKey: `tool:${toolCallId}`,
      kind: "tool",
      phase: isResult ? "result" : "start",
      name,
      title: described.title,
      status,
      detail: described.detail,
      output: isResult ? resultText(data.result) : "",
      isError,
    };
  }

  if (event.stream === "lifecycle") {
    const phase = firstString(data.phase) || "unknown";
    if (phase === "start") {
      return { actionKey: "run", kind: "run", phase, name: "", title: "Run started", status: "running", detail: "", output: "", isError: false };
    }
    if (phase === "finishing") {
      return { actionKey: "run", kind: "run", phase, name: "", title: "Finishing the reply", status: "running", detail: "", output: "", isError: false };
    }
    if (phase === "end" || phase === "error") {
      const aborted = data.aborted === true;
      const stopReason = firstString(data.stopReason);
      const error = record(data.error);
      const errorText = firstString(error.message, data.error) || firstString(data.stopReason);
      const stopped = aborted || /abort|cancel|stop|timeout|interrupt/i.test(stopReason);
      const failed = phase === "error" && !stopped;
      return {
        actionKey: "run",
        kind: "run",
        phase,
        name: "",
        title: failed ? "Run failed" : stopped ? "Run stopped" : "Run finished",
        status: failed ? "failed" : stopped ? "stopped" : "completed",
        detail: stopReason,
        output: failed || stopped ? (errorText || (stopped ? `Stopped (${stopReason || "aborted"})` : "The run ended with an error.")) : "",
        isError: failed,
      };
    }
    if (phase === "waiting-approval" || phase === "approval-resolved") {
      const toolCallId = firstString(data.toolCallId, data.approvalId) || "approval";
      return {
        actionKey: `approval:${toolCallId}`,
        kind: "note",
        phase,
        name: "",
        title: phase === "waiting-approval" ? "Waiting for owner approval" : "Approval resolved",
        status: phase === "waiting-approval" ? "blocked" : "completed",
        detail: firstString(data.approvalId),
        output: "",
        isError: false,
      };
    }
    if (phase === "fallback_step") {
      return {
        actionKey: `fallback:${event.seq ?? 0}`,
        kind: "note",
        phase,
        name: "",
        title: "Model fallback step",
        status: "running",
        detail: firstString(data.from, data.to, data.model, data.reason),
        output: "",
        isError: false,
      };
    }
    return null;
  }

  if (event.stream === "item") {
    const kind = firstString(data.kind);
    if (kind !== "preamble" && kind !== "environment") return null;
    const itemId = firstString(data.itemId) || `${event.seq ?? 0}`;
    const phase = firstString(data.phase) || "update";
    return {
      actionKey: `item:${itemId}`,
      kind: "note",
      phase,
      name: kind,
      title: firstString(data.title) || "Progress note",
      status: phase === "end" ? "completed" : "running",
      detail: firstString(data.progressText, data.summary),
      output: "",
      isError: false,
    };
  }

  return null;
}

function publicAction(row: any): AgentAction {
  return {
    id: Number(row.id),
    sessionKey: String(row.session_key),
    sessionId: String(row.session_id ?? ""),
    runId: String(row.run_id),
    kind: row.kind,
    phase: String(row.phase ?? ""),
    name: String(row.name ?? ""),
    title: String(row.title ?? ""),
    status: row.status,
    detail: String(row.detail ?? ""),
    output: String(row.output ?? ""),
    isError: row.is_error === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function publish(sessionKey: string, action: AgentAction): void {
  for (const subscriber of subscribers.get(sessionKey) ?? []) {
    try { subscriber(action); } catch { /* disconnected client */ }
  }
}

export function recordAgentStreamEvent(event: AgentStreamEvent): void {
  const sessionKey = event.sessionKey;
  if (!sessionKey) return; // without a session we cannot attach the row honestly
  const action = normalize(event);
  if (!action) return;
  const runId = event.runId || `unknown-run:${sessionKey}`;
  db.prepare(`
    INSERT INTO run_actions (agent_id, session_key, session_id, run_id, action_key, kind, phase, name, title, status, detail, output, is_error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id, action_key) DO UPDATE SET
      phase = excluded.phase,
      title = excluded.title,
      status = excluded.status,
      detail = CASE WHEN excluded.detail <> '' THEN excluded.detail ELSE run_actions.detail END,
      output = CASE WHEN excluded.output <> '' THEN excluded.output ELSE run_actions.output END,
      is_error = excluded.is_error,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `).run(
    "",
    sessionKey,
    event.sessionId ?? "",
    runId,
    action.actionKey,
    action.kind,
    action.phase,
    action.name,
    action.title,
    action.status,
    action.detail,
    action.output,
    action.isError ? 1 : 0,
  );
  const row = db.prepare("SELECT * FROM run_actions WHERE run_id = ? AND action_key = ?").get(runId, action.actionKey);
  if (row) publish(sessionKey, publicAction(row));
}

export function listRunActions(sessionKey: string, limit = 200): AgentAction[] {
  if (!sessionKey) return [];
  const rows = db.prepare(
    "SELECT * FROM run_actions WHERE session_key = ? ORDER BY id DESC LIMIT ?"
  ).all(sessionKey, Math.max(1, Math.min(500, limit))) as any[];
  return rows.reverse().map(publicAction);
}

export function subscribeRunActions(sessionKey: string, subscriber: ActionSubscriber): () => void {
  const rows = subscribers.get(sessionKey) ?? new Set<ActionSubscriber>();
  rows.add(subscriber);
  subscribers.set(sessionKey, rows);
  return () => {
    rows.delete(subscriber);
    if (rows.size === 0) subscribers.delete(sessionKey);
  };
}

gateway.subscribeAgentEvents(recordAgentStreamEvent);
