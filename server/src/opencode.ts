// Read-only bridge to the local OpenCode v2 background service.
//
// Verified against OpenCode 2.2.0 (`opencode serve --service`):
// - Registration lives at $XDG_STATE_HOME/opencode/service.json and holds
//   { url, password, pid, version }. The URL is a loopback address.
// - HTTP auth is Basic "opencode:<password>" against that loopback URL.
// - The API contract is documented per version at /openapi.json on the service.
//
// Julie never forwards the password to the browser, never starts or stops the
// service, and never writes through it. Everything here is fetch-JSON GETs that
// sanitize and bound outgoing payloads; unavailable services surface as real
// error states, never as fabricated data.
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

export class OpencodeUnavailableError extends Error {
  status: number;

  constructor(message: string, status = 503) {
    super(message);
    this.name = "OpencodeUnavailableError";
    this.status = status;
  }
}

export class OpencodeForbiddenError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "OpencodeForbiddenError";
    this.status = status;
  }
}

export class OpencodeAvailableError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "OpencodeAvailableError";
    this.status = status;
  }
}

interface Registration {
  url: string;
  password: string;
  pid: number | null;
  version: string | null;
}

function registrationPath(): string {
  const stateHome = process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
  return path.join(stateHome, "opencode", "service.json");
}

async function readRegistration(): Promise<Registration> {
  let raw: string;
  try {
    raw = await fs.readFile(registrationPath(), "utf8");
  } catch {
    throw new OpencodeUnavailableError("OpenCode service is not registered on this host");
  }
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new OpencodeUnavailableError("OpenCode service registration is unreadable");
  }
  const { url, password, pid, version } = parsed ?? {};
  if (typeof url !== "string" || !/^https?:\/\//.test(url) || typeof password !== "string" || !password) {
    throw new OpencodeUnavailableError("OpenCode service registration is missing url/password");
  }
  const parsedUrl = new URL(url);
  if (parsedUrl.hostname !== "localhost" && parsedUrl.hostname !== "127.0.0.1" && parsedUrl.hostname !== "::1") {
    throw new OpencodeForbiddenError("OpenCode registration URL is not loopback");
  }
  return {
    url: url.replace(/\/+$/, ""),
    password,
    pid: typeof pid === "number" ? pid : null,
    version: typeof version === "string" ? version : null,
  };
}

async function opencodeGetJson<T = unknown>(pathname: string, search: Record<string, string> = {}): Promise<T> {
  const registration = await readRegistration();
  const target = new URL(pathname, registration.url + "/");
  for (const [key, value] of Object.entries(search)) target.searchParams.set(key, value);
  const auth = Buffer.from(`opencode:${registration.password}`).toString("base64");
  let response: Response;
  try {
    response = await fetch(target, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new OpencodeUnavailableError("OpenCode service did not answer");
  }
  if (response.status === 401 || response.status === 403) {
    throw new OpencodeForbiddenError("OpenCode service rejected Julie's credentials");
  }
  if (!response.ok) {
    throw new OpencodeAvailableError(`OpenCode returned HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

function checkId(sid: string): string {
  if (!/^[A-Za-z0-9_+-]{8,64}$/.test(sid)) {
    throw new OpencodeAvailableError("OpenCode session id has an unexpected shape", 400);
  }
  return sid;
}

// Message text can contain tool transcripts that quote secrets or host paths.
// Same boundary as agent-chat: never leak credentials or OpenClaw paths, keep
// everything else owner-readable within bounds.
function sanitizeMessageText(value: string): string {
  return value
    .replace(/-----BEGIN [^-\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\n]*PRIVATE KEY-----/gi, "[redacted private key]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]")
    .replace(/\b(api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|client[_ -]?secret)\s*[:=]\s*["']?[^\s"'`]+/gi, "$1=[redacted]")
    .replace(/\/home\/[^/\s]+\/\.openclaw(?:\/[^\s`"'<>)]*)?/g, "[OpenClaw path]");
}

function safeString(value: unknown, max = 300): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeTokens(value: any): { input: number | null; output: number | null; reasoning: number | null; cacheRead: number | null; cacheWrite: number | null } {
  return {
    input: safeNumber(value?.input),
    output: safeNumber(value?.output),
    reasoning: safeNumber(value?.reasoning),
    cacheRead: safeNumber(value?.cache?.read),
    cacheWrite: safeNumber(value?.cache?.write),
  };
}

function safeTime(value: any): { created: number | null; updated: number | null } {
  return {
    created: safeNumber(value?.created),
    updated: safeNumber(value?.updated),
  };
}

function slimModel(value: any): { providerID: string | null; id: string | null } {
  return {
    providerID: safeString(value?.providerID, 100),
    id: safeString(value?.id, 200),
  };
}

function slimSessionRow(value: any) {
  return {
    id: safeString(value?.id, 64),
    title: safeString(value?.title, 200),
    agent: safeString(value?.agent, 100),
    model: slimModel(value?.model),
    cost: safeNumber(value?.cost),
    tokens: safeTokens(value?.tokens),
    outcome: safeString(value?.outcome, 30),
    time: safeTime(value?.time),
  };
}

// ---- public bridge surface ----

export async function getOpencodeStats() {
  const raw = await opencodeGetJson<any>("/api/experimental/session/stats");
  const d = raw?.data ?? raw ?? {};
  return {
    source: "opencode",
    stats: {
      range: {
        from: safeNumber(d?.range?.from),
        to: safeNumber(d?.range?.to),
      },
      sessions: safeNumber(d?.sessions) ?? 0,
      subagents: safeNumber(d?.subagents) ?? 0,
      prompts: safeNumber(d?.prompts) ?? 0,
      steps: safeNumber(d?.steps) ?? 0,
      tokens: safeTokens(d?.tokens),
      cost: safeNumber(d?.cost),
      tools: {
        calls: safeNumber(d?.tools?.totals?.calls) ?? 0,
        succeeded: safeNumber(d?.tools?.totals?.succeeded) ?? 0,
        failed: safeNumber(d?.tools?.totals?.failed) ?? 0,
        unfinished: safeNumber(d?.tools?.totals?.unfinished) ?? 0,
      },
      activeDays: safeNumber(d?.activeDays) ?? 0,
      streak: safeNumber(d?.streak) ?? 0,
      activity: Array.isArray(d?.activity)
        ? d.activity.slice(0, 60).map((row: any) => ({
            date: safeString(row?.date, 10),
            steps: safeNumber(row?.steps) ?? 0,
          }))
        : [],
      models: Array.isArray(d?.models)
        ? d.models.slice(0, 8).map((row: any) => ({
            model: slimModel(row?.model),
            steps: safeNumber(row?.steps) ?? 0,
            tokens: safeTokens(row?.tokens),
            cost: safeNumber(row?.cost),
          }))
        : [],
    },
  };
}

export async function listOpencodeActiveSessions() {
  const raw = await opencodeGetJson<any>("/api/session/active");
  const entries = raw?.data ?? {};
  const active = typeof entries === "object" && entries !== null ? entries : {};
  return {
    source: "opencode",
    active: Object.keys(active).slice(0, 20).map((id) => ({
      id: safeString(id, 64),
      state: safeString(active[id]?.type, 20),
    })),
  };
}

export async function getOpencodeStatus() {
  const registration = await readRegistration();
  const checkedAt = new Date().toISOString();
  let payload: any;
  try {
    payload = await opencodeGetJson("/api/info");
  } catch (error) {
    if (error instanceof OpencodeAvailableError) {
      throw new OpencodeUnavailableError("OpenCode service is registered but not healthy");
    }
    throw error;
  }
  // Pick a browser-reachable URL for the "open OpenCode web UI" link. Prefer a
  // public https tunnel (OpenCode manages its own password gate there); fall
  // back to the service's first advertised URL, which may be loopback-only.
  const urls = Array.isArray(payload?.urls)
    ? payload.urls.filter((u: unknown): u is string => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 4)
    : [];
  const webUiUrl = urls.find((u: string) => u.startsWith("https://")) ?? urls[0] ?? null;
  return {
    available: true,
    version: safeString(payload?.version, 40) ?? registration.version,
    pid: safeNumber(payload?.pid) ?? registration.pid,
    webUiUrl,
    checkedAt,
  };
}

type OpencodeSessionListArgs = { limit?: number };

export async function listOpencodeSessions({ limit }: OpencodeSessionListArgs = {}) {
  const bounded = Math.max(1, Math.min(50, limit && Number.isFinite(limit) ? Math.floor(limit) : 20));
  const raw = await opencodeGetJson<any>("/api/session", { limit: String(bounded) });
  const rows = Array.isArray(raw?.data) ? raw.data : [];
  return {
    source: "opencode",
    sessions: rows.filter(Boolean).slice(0, bounded).map(slimSessionRow),
  };
}

type OpencodeMessagesArgs = { limit?: number };

export async function listOpencodeSessionMessages(sid: string, { limit }: OpencodeMessagesArgs = {}) {
  checkId(sid);
  const bounded = Math.max(1, Math.min(200, limit && Number.isFinite(limit) ? Math.floor(limit) : 100));
  const raw = await opencodeGetJson<any>(`/api/session/${sid}/message`, {
    limit: String(bounded),
    order: "asc",
  });
  const messages = Array.isArray(raw?.data) ? raw.data : [];
  return {
    source: "opencode",
    id: sid,
    messages: messages.filter(Boolean).slice(0, bounded).map(sanitizeMessageRow),
  };
}

const BOUNDED_TEXT_LIMIT = 20_000;

function sanitizeMessageRow(message: any) {
  const userText = typeof message?.text === "string" && message.text.trim() ? message.text : null;
  return {
    id: safeString(message?.id, 64),
    type: safeString(message?.type, 30),
    agent: safeString(message?.agent, 100),
    model: slimModel(message?.model),
    tokens: safeTokens(message?.tokens),
    cost: safeNumber(message?.cost),
    time: safeTime(message?.time),
    text: userText ? sanitizeMessageText(userText).slice(0, BOUNDED_TEXT_LIMIT) : null,
    parts: Array.isArray(message?.content) ? message.content.slice(0, 80).map(sanitizePart) : [],
  };
}

function sanitizePart(part: any) {
  const type = safeString(part?.type, 30);
  if (type === "text" || type === "reasoning") {
    const text = typeof part?.text === "string" ? part.text : "";
    return {
      type,
      text: sanitizeMessageText(text).slice(0, BOUNDED_TEXT_LIMIT),
      truncated: text.length > BOUNDED_TEXT_LIMIT,
    };
  }
  if (type === "tool") {
    return {
      type,
      name: safeString(part?.name, 100),
      executed: part?.executed === true,
      state: {
        status: safeString(part?.state?.status, 30),
        input: sanitizeMessageText(JSON.stringify(part?.state?.input ?? {})).slice(0, 500),
        output: Array.isArray(part?.state?.content)
          ? part.state.content
              .filter((chunk: any) => typeof chunk?.text === "string")
              .map((chunk: any) => sanitizeMessageText(chunk.text))
              .join("\n")
              .slice(0, 4_000)
          : null,
      },
    };
  }
  // Unknown part shapes are reported as type + bounded raw preview, never dropped silently.
  return {
    type: type ?? "unknown",
    preview: sanitizeMessageText(JSON.stringify(part ?? {}).slice(0, 400)),
  };
}

export async function listOpencodeAgents() {
  const raw = await opencodeGetJson<any>("/api/agent");
  const rows = Array.isArray(raw?.data) ? raw.data : [];
  return {
    source: "opencode",
    agents: rows.filter(Boolean).slice(0, 40).map((agent: any) => ({
      id: safeString(agent?.id, 100),
      name: safeString(agent?.name, 200),
      description: safeString(agent?.description, 400),
      mode: safeString(agent?.mode, 30),
    })),
  };
}

// E3-10 development project registry. OpenCode tracks real project records for
// every directory with OpenCode activity (id, canonical path, VCS kind, times).
// Host paths stay server-side per the archive redaction rule; the browser gets
// a display name derived from the path plus merged per-path session counts.
export async function listOpencodeProjects() {
  const raw = await opencodeGetJson<any>("/api/project");
  const rows = (Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : []).filter(Boolean);
  // Session linkage: bounded query; payload items and definitely not paths.
  const sessionsRaw = await opencodeGetJson<any>("/api/session", { limit: "400" });
  const sessionRows = Array.isArray(sessionsRaw?.data) ? sessionsRaw.data : [];
  const byProject = new Map<string, { count: number; lastActive: number | null }>();
  for (const row of sessionRows) {
    const pid = safeString(row?.projectID, 80);
    if (!pid) continue;
    const cur = byProject.get(pid) ?? { count: 0, lastActive: null as number | null };
    cur.count += 1;
    const upd = safeNumber(row?.time?.updated);
    if (upd !== null && (cur.lastActive === null || upd > cur.lastActive)) cur.lastActive = upd;
    byProject.set(pid, cur);
  }
  // Group by canonical path: OpenCode may keep several ids for one path.
  const byPath = new Map<string, { record: any; ids: string; sessions: number; lastActive: number | null }>();
  for (const project of rows.slice(0, 30)) {
    const canonical = safeString(project?.canonical, 500);
    if (!canonical) continue;
    const marks = project?.time ?? {};
    const note = safeNumber(marks?.active);
    const existing = byPath.get(canonical) ?? {
      record: project,
      ids: safeString(project?.id, 80) ?? "",
      sessions: 0,
      lastActive: note,
    };
    const pid = safeString(project?.id, 80);
    if (pid && existing.ids && !existing.ids.split(",").includes(pid)) existing.ids += `,${pid}`;
    const counts = byProject.get(pid ?? "");
    if (counts) {
      existing.sessions += counts.count;
      if (counts.lastActive !== null && (existing.lastActive === null || counts.lastActive > existing.lastActive)) existing.lastActive = counts.lastActive;
    }
    byPath.set(canonical, existing);
  }
  return {
    source: "opencode",
    coverage: { projects: rows.length, sessionsScanned: sessionRows.length },
    projects: Array.from(byPath.entries()).slice(0, 30).map(([canonical, entry]) => ({
      id: entry.ids.split(",")[0] ?? null,
      name: canonical.split("/").filter(Boolean).pop() || canonical,
      vcs: safeString(entry.record?.vcs, 20),
      created: safeNumber(entry.record?.time?.created),
      updated: safeNumber(entry.record?.time?.updated),
      lastActive: entry.lastActive,
      sandboxes: Array.isArray(entry.record?.sandboxes) ? entry.record.sandboxes.length : 0,
      sessions: entry.sessions,
    })),
  };
}
