// Projects: owner-visible folders under JULIE_PROJECT_DIR, with workspace
// ownership, an assigned agent team, real launch/stop lifecycle, and a
// same-origin subpath proxy at /project/<slug>/.
//
// Every reported state comes from the filesystem, SQLite, or the spawned
// process. Nothing here pretends a project is running when it is not.
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import http from "node:http";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { config } from "./config.js";
import { db } from "./db.js";
import { getWorkspaceAgentIds, getAgentProfileMap } from "./agent-profiles.js";

export type ProjectProcessStatus = "stopped" | "starting" | "running" | "stopping" | "failed";
export type ProjectKind = "node" | "static" | "unknown";

export type ProjectRow = {
  id: number;
  slug: string;
  name: string;
  path: string;
  description: string;
  workspace_id: number | null;
  port: number | null;
  team_mode: "inherit" | "custom";
  process_status: ProjectProcessStatus;
  process_pid: number | null;
  process_command: string;
  last_started_at: string | null;
  last_stopped_at: string | null;
  last_error: string;
  created_at: string;
  updated_at: string;
};

type ProjectMeta = {
  name: string;
  description: string;
  kind: ProjectKind;
  framework: string;
  packageManager: "npm" | "pnpm" | "yarn" | "bun" | null;
  devScript: string | null;
  buildScript: string | null;
  nodeModules: boolean;
};

type ProjectRuntime = {
  child: ChildProcess | null;
  stopping: boolean;
  logs: string[];
  startedAt: number | null;
};

const runtimes = new Map<string, ProjectRuntime>();
const MAX_LOG_LINES = 300;
const SLUG_RE = /^[a-z0-9][a-z0-9._-]*$/;

export class ProjectError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ---- filesystem discovery -------------------------------------------------

export function ensureProjectDir(): string {
  fs.mkdirSync(config.projectDir, { recursive: true });
  return config.projectDir;
}

function slugFromDir(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "project";
}

function prettyName(dirName: string): string {
  return dirName
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function firstReadmeLine(dir: string): string {
  for (const candidate of ["README.md", "readme.md", "README.txt"]) {
    const file = path.join(dir, candidate);
    try {
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, "utf8").slice(0, 4000);
      const line = text
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith("#") && !l.startsWith("![") && !l.startsWith("<"));
      if (line) return line.slice(0, 300);
      const heading = text.split("\n").map((l) => l.trim()).find((l) => l.startsWith("#"));
      if (heading) return heading.replace(/^#+\s*/, "").slice(0, 300);
    } catch { /* unreadable readme is not fatal */ }
  }
  return "";
}

function readPackage(dir: string): any | null {
  try {
    const raw = fs.readFileSync(path.join(dir, "package.json"), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function detectMeta(dirName: string, dir: string): ProjectMeta {
  const pkg = readPackage(dir);
  const scripts = pkg?.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {};
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const framework = ["next", "nuxt", "vite", "astro", "svelte", "remix", "@remix-run/dev", "parcel"]
    .find((name) => Object.prototype.hasOwnProperty.call(deps, name)) ?? "";
  const packageManager = fs.existsSync(path.join(dir, "pnpm-lock.yaml")) ? "pnpm"
    : fs.existsSync(path.join(dir, "yarn.lock")) ? "yarn"
    : fs.existsSync(path.join(dir, "bun.lockb")) || fs.existsSync(path.join(dir, "bun.lock")) ? "bun"
    : pkg ? "npm" : null;
  const devScript = typeof scripts.dev === "string" ? "dev"
    : typeof scripts.start === "string" ? "start"
    : typeof scripts.preview === "string" ? "preview"
    : null;
  const buildScript = typeof scripts.build === "string" ? "build" : null;
  const isStatic = !pkg && fs.existsSync(path.join(dir, "index.html"));
  const description = (typeof pkg?.description === "string" && pkg.description.trim())
    ? pkg.description.trim().slice(0, 300)
    : firstReadmeLine(dir);
  return {
    name: (typeof pkg?.name === "string" && pkg.name.trim()) ? pkg.name.trim() : prettyName(dirName),
    description,
    kind: pkg && devScript ? "node" : isStatic ? "static" : pkg ? "node" : "unknown",
    framework: framework || (isStatic ? "static html" : ""),
    packageManager,
    devScript,
    buildScript,
    nodeModules: fs.existsSync(path.join(dir, "node_modules")),
  };
}

function safeProjectPath(slug: string): string | null {
  const dir = path.join(config.projectDir, slug);
  const resolved = path.resolve(dir);
  const root = path.resolve(config.projectDir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

// Upsert one discovered folder. Existing rows keep owner-set workspace, team,
// port, and description; discovery only refreshes name/path.
function upsertProject(dirName: string, dir: string): ProjectRow {
  const meta = detectMeta(dirName, dir);
  const slug = slugFromDir(dirName);
  const existing = db.prepare("SELECT * FROM projects WHERE slug = ?").get(slug) as ProjectRow | undefined;
  if (existing) {
    db.prepare(
      `UPDATE projects SET name = ?, path = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    ).run(meta.name, dir, existing.id);
    return db.prepare("SELECT * FROM projects WHERE id = ?").get(existing.id) as ProjectRow;
  }
  const info = db.prepare("INSERT INTO projects (slug, name, path, description) VALUES (?, ?, ?, ?)")
    .run(slug, meta.name, dir, meta.description);
  return db.prepare("SELECT * FROM projects WHERE id = ?").get(info.lastInsertRowid) as ProjectRow;
}

// Discover immediate child directories. Hidden folders and plain files are not
// projects. Removed folders are reported as missing rather than deleted, so an
// accidental unmount does not silently erase ownership or team assignments.
export function syncProjects(): ProjectRow[] {
  ensureProjectDir();
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(config.projectDir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const dir = path.join(config.projectDir, entry.name);
    const row = upsertProject(entry.name, dir);
    seen.add(row.slug);
  }
  // Slug collisions (two folders normalizing to one slug) keep the first row;
  // the second folder is still visible through the directory listing endpoint.
  return db.prepare("SELECT * FROM projects ORDER BY name COLLATE NOCASE").all() as ProjectRow[];
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// After a Julie restart we no longer own the previous child's stdio. Trust the
// OS: if the PID is gone the project is stopped, not "running".
function reconcileRuntime(row: ProjectRow): ProjectRow {
  if (row.process_status === "stopped" || row.process_status === "failed") return row;
  // Static projects have no process PID; they are served directly from disk.
  // If they were marked as running, they should stay running.
  if (!row.process_pid) {
    if (row.process_status === "running") return row;
    // If somehow not running, treat as stopped.
    return row;
  }
  if (isAlive(row.process_pid)) return row;
  const status: ProjectProcessStatus = row.process_status === "stopping" ? "stopped" : "failed";
  db.prepare(
    `UPDATE projects SET process_status = ?, process_pid = NULL,
       last_error = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
  ).run(status, "Project process is no longer running", row.id);
  return db.prepare("SELECT * FROM projects WHERE id = ?").get(row.id) as ProjectRow;
}

export function reconcileProjects(): void {
  const rows = db.prepare("SELECT * FROM projects WHERE process_status IN ('starting','running','stopping')").all() as ProjectRow[];
  for (const row of rows) reconcileRuntime(row);
}

export type ProjectView = ProjectRow & {
  kind: ProjectKind;
  framework: string;
  package_manager: string | null;
  dev_script: string | null;
  build_script: string | null;
  node_modules: boolean;
  exists: boolean;
  workspace_name: string | null;
  agent_ids: string[];
  agents: Array<{ id: string; humanName: string; role: string }>;
  team_source: "project" | "workspace";
  local_url: string | null;
  subpath_url: string;
  uptime_seconds: number | null;
};

function projectMetaFor(row: ProjectRow): { meta: ProjectMeta | null; exists: boolean } {
  const dir = safeProjectPath(row.slug) ?? row.path;
  if (!fs.existsSync(dir)) return { meta: null, exists: false };
  return { meta: detectMeta(path.basename(dir), dir), exists: true };
}

function teamFor(row: ProjectRow): { ids: string[]; source: "project" | "workspace" } {
  const custom = db.prepare("SELECT agent_id FROM project_agents WHERE project_id = ? ORDER BY agent_id")
    .all(row.id) as Array<{ agent_id: string }>;
  if (row.team_mode === "custom") return { ids: custom.map((r) => r.agent_id), source: "project" };
  if (row.workspace_id) return { ids: getWorkspaceAgentIds(row.workspace_id), source: "workspace" };
  return { ids: [], source: "workspace" };
}

export function toProjectView(row: ProjectRow): ProjectView {
  const { meta, exists } = projectMetaFor(row);
  const team = teamFor(row);
  const workspace = row.workspace_id
    ? db.prepare("SELECT name FROM workspaces WHERE id = ?").get(row.workspace_id) as { name: string } | undefined
    : undefined;
  const runtime = runtimes.get(row.slug);
  const profiles = getAgentProfileMap();
  return {
    ...row,
    kind: meta?.kind ?? "unknown",
    framework: meta?.framework ?? "",
    package_manager: meta?.packageManager ?? null,
    dev_script: meta?.devScript ?? null,
    build_script: meta?.buildScript ?? null,
    node_modules: meta?.nodeModules ?? false,
    exists,
    workspace_name: workspace?.name ?? null,
    agent_ids: team.ids,
    agents: team.ids.map((id) => ({
      id,
      humanName: profiles.get(id)?.humanName || id,
      role: profiles.get(id)?.role || "",
    })),
    team_source: team.source,
    local_url: row.port && row.process_status === "running" ? `http://127.0.0.1:${row.port}` : null,
    subpath_url: `/project/${row.slug}/`,
    uptime_seconds: runtime?.startedAt ? Math.max(0, Math.round((Date.now() - runtime.startedAt) / 1000)) : null,
  };
}

export function listProjects(): ProjectView[] {
  return syncProjects().map((row) => toProjectView(reconcileRuntime(row)));
}

export function getProject(slug: string): ProjectRow | null {
  if (!SLUG_RE.test(slug)) return null;
  const row = db.prepare("SELECT * FROM projects WHERE slug = ?").get(slug) as ProjectRow | undefined;
  return row ? reconcileRuntime(row) : null;
}

export function getProjectView(slug: string): ProjectView | null {
  const row = getProject(slug);
  return row ? toProjectView(row) : null;
}

// ---- owner configuration --------------------------------------------------

export function updateProject(slug: string, input: {
  workspaceId?: number | null;
  teamMode?: "inherit" | "custom";
  agentIds?: string[];
  port?: number | null;
  description?: string;
}): ProjectView {
  const row = getProject(slug);
  if (!row) throw new ProjectError("Project not found", 404);
  if (input.workspaceId !== undefined && input.workspaceId !== null) {
    const ws = db.prepare("SELECT id FROM workspaces WHERE id = ?").get(input.workspaceId);
    if (!ws) throw new ProjectError("Workspace not found", 404);
  }
  if (input.port !== undefined && input.port !== null) {
    if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) throw new ProjectError("Port must be an integer between 1 and 65535");
    if (input.port === config.port) throw new ProjectError("Port is used by Julie itself");
    const clash = db.prepare(
      "SELECT slug FROM projects WHERE port = ? AND id != ?"
    ).get(input.port, row.id) as { slug: string } | undefined;
    if (clash) throw new ProjectError(`Port ${input.port} is already assigned to ${clash.slug}`, 409);
  }
  if (input.agentIds !== undefined) {
    if (!Array.isArray(input.agentIds) || input.agentIds.some((id) => typeof id !== "string" || !id.trim())) {
      throw new ProjectError("agentIds must be an array of agent IDs");
    }
  }
  const workspaceId = input.workspaceId !== undefined ? input.workspaceId : row.workspace_id;
  const teamMode = input.teamMode ?? row.team_mode;
  const description = input.description !== undefined ? input.description.slice(0, 2000) : row.description;
  db.transaction(() => {
    db.prepare(
      `UPDATE projects SET workspace_id = ?, team_mode = ?, port = ?, description = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    ).run(workspaceId, teamMode, input.port !== undefined ? input.port : row.port, description, row.id);
    if (input.agentIds !== undefined) {
      db.prepare("DELETE FROM project_agents WHERE project_id = ?").run(row.id);
      const insert = db.prepare("INSERT OR IGNORE INTO project_agents (project_id, agent_id) VALUES (?, ?)");
      for (const agentId of input.agentIds) insert.run(row.id, agentId.trim());
    }
  })();
  return toProjectView(getProject(slug)!);
}

// ---- port allocation ------------------------------------------------------

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const done = (used: boolean) => { socket.destroy(); resolve(used); };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(700, () => done(false));
  });
}

async function allocatePort(row: ProjectRow): Promise<number> {
  const assigned = db.prepare("SELECT slug, port, process_status FROM projects WHERE port IS NOT NULL AND id != ?")
    .all(row.id) as Array<{ slug: string; port: number; process_status: string }>;
  const reserved = new Set(assigned.filter((r) => r.process_status === "running" || r.process_status === "starting").map((r) => r.port));
  if (row.port && !reserved.has(row.port) && !(await portInUse(row.port))) return row.port;
  for (let port = config.projectPortStart; port <= config.projectPortEnd; port++) {
    if (port === config.port || reserved.has(port)) continue;
    if (!(await portInUse(port))) {
      db.prepare("UPDATE projects SET port = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(port, row.id);
      return port;
    }
  }
  throw new ProjectError(`No free port in ${config.projectPortStart}-${config.projectPortEnd}`, 409);
}

// ---- process lifecycle ----------------------------------------------------

function runtimeFor(slug: string): ProjectRuntime {
  let runtime = runtimes.get(slug);
  if (!runtime) {
    runtime = { child: null, stopping: false, logs: [], startedAt: null };
    runtimes.set(slug, runtime);
  }
  return runtime;
}

function pushLog(runtime: ProjectRuntime, chunk: Buffer | string): void {
  const text = chunk.toString();
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  runtime.logs.push(...lines.map((line) => line.slice(0, 500)));
  if (runtime.logs.length > MAX_LOG_LINES) runtime.logs.splice(0, runtime.logs.length - MAX_LOG_LINES);
}

function markFailed(slug: string, message: string): void {
  const runtime = runtimeFor(slug);
  runtime.child = null;
  runtime.startedAt = null;
  db.prepare(
    `UPDATE projects SET process_status = 'failed', process_pid = NULL, last_error = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE slug = ?`
  ).run(message.slice(0, 500), slug);
}

function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = net.connect({ host: "127.0.0.1", port });
      socket.once("connect", () => { socket.destroy(); resolve(true); });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() >= deadline) resolve(false);
        else setTimeout(attempt, 300);
      });
      socket.setTimeout(1000, () => { socket.destroy(); if (Date.now() >= deadline) resolve(false); else setTimeout(attempt, 300); });
    };
    attempt();
  });
}

function launchCommand(meta: ProjectMeta, script: string, port: number): { command: string; args: string[] } {
  const manager = meta.packageManager ?? "npm";
  const args = manager === "npm" ? ["run", script] : [script];
  // Next uses `-p` and binds all interfaces by default; Vite/Astro/Nuxt/Svelte
  // accept `--host` + `--port`. Other Node scripts read the PORT env var.
  const devServer = /^(next|vite|astro|nuxt|svelte|sveltekit|remix|parcel)$/i.test(meta.framework);
  if (meta.framework === "next") {
    args.push("--", "-p", String(port));
  } else if (devServer) {
    args.push("--", "--host", "127.0.0.1", "--port", String(port));
  }
  return { command: manager, args };
}

export async function startProject(slug: string): Promise<ProjectView> {
  const row = getProject(slug);
  if (!row) throw new ProjectError("Project not found", 404);
  if (row.process_status === "running" || row.process_status === "starting") {
    throw new ProjectError("Project is already running", 409);
  }
  const dir = safeProjectPath(row.slug);
  if (!dir || !fs.existsSync(dir)) throw new ProjectError("Project folder is missing", 404);
  const meta = detectMeta(path.basename(dir), dir);

  // Static folder: no process, but genuinely served by the subpath proxy.
  if (meta.kind === "static") {
    db.prepare(
      `UPDATE projects SET process_status = 'running', process_pid = NULL, process_command = 'static files',
         last_started_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), last_error = '',
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    ).run(row.id);
    return toProjectView(getProject(slug)!);
  }
  if (!meta.devScript || !meta.packageManager) {
    throw new ProjectError("No launchable entry found. Add a package.json with a dev/start script, or an index.html for a static project.", 422);
  }
  if (!meta.nodeModules) {
    throw new ProjectError("Dependencies are not installed (node_modules missing). Install them in the project before launching.", 422);
  }

  const port = await allocatePort(row);
  const { command, args } = launchCommand(meta, meta.devScript, port);
  const runtime = runtimeFor(slug);
  runtime.logs = [];
  runtime.stopping = false;
  runtime.startedAt = Date.now();
  const display = `${command} ${args.join(" ")}`;

  const child = spawn(command, args, {
    cwd: dir,
    detached: true,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      BROWSER: "none",
      FORCE_COLOR: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  runtime.child = child;
  child.stdout?.on("data", (chunk) => pushLog(runtime, chunk));
  child.stderr?.on("data", (chunk) => pushLog(runtime, chunk));
  child.once("exit", (code, signal) => recordExit(slug, code, signal));

  db.prepare(
    `UPDATE projects SET process_status = 'starting', process_pid = ?, process_command = ?, last_error = '',
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
  ).run(child.pid ?? null, display, row.id);

  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
    child.once("error", (error) => resolve({ code: null, signal: null }));
  });

  const ready = await Promise.race([
    waitForPort(port, 25_000).then((ok) => (ok ? "ready" as const : "timeout" as const)),
    exited.then((info) => ({ exited: info })),
  ]);

  if (ready === "ready") {
    db.prepare(
      `UPDATE projects SET process_status = 'running', last_started_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    ).run(row.id);
    return toProjectView(getProject(slug)!);
  }
  if (typeof ready === "object") {
    const tail = runtime.logs.slice(-3).join(" · ") || "no output";
    markFailed(slug, `Process exited before listening (code ${ready.exited.code ?? "?"}): ${tail}`);
    throw new ProjectError(`Project failed to start: ${tail}`, 502);
  }
  markFailed(slug, `Timed out waiting for port ${port}. Last output: ${runtime.logs.slice(-3).join(" · ") || "none"}`);
  throw new ProjectError(`Project did not listen on port ${port} within 25s`, 504);
}

export async function stopProject(slug: string): Promise<ProjectView> {
  const row = getProject(slug);
  if (!row) throw new ProjectError("Project not found", 404);
  if (row.process_status === "stopped") return toProjectView(row);
  const runtime = runtimeFor(slug);
  if (!row.process_pid) {
    // Static project or a process that already exited.
    db.prepare(
      `UPDATE projects SET process_status = 'stopped', process_pid = NULL, last_error = '',
         last_stopped_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    ).run(row.id);
    return toProjectView(getProject(slug)!);
  }
  runtime.stopping = true;
  db.prepare(
    `UPDATE projects SET process_status = 'stopping', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
  ).run(row.id);
  const pid = row.process_pid;
  const send = (signal: NodeJS.Signals) => {
    try { process.kill(-pid, signal); } catch { try { process.kill(pid, signal); } catch { /* exited */ } }
  };
  send("SIGTERM");
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline && isAlive(pid)) await new Promise((r) => setTimeout(r, 200));
  if (isAlive(pid)) send("SIGKILL");
  runtime.child = null;
  runtime.startedAt = null;
  db.prepare(
    `UPDATE projects SET process_status = 'stopped', process_pid = NULL, last_error = '',
       last_stopped_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
  ).run(row.id);
  return toProjectView(getProject(slug)!);
}

// Called from the process-exit handler; never overwrites an intentional stop.
export function recordExit(slug: string, code: number | null, signal: string | null): void {
  const runtime = runtimes.get(slug);
  const row = getProject(slug);
  if (!row) return;
  if (runtime?.stopping) return;
  const message = `Process exited (code ${code ?? "?"}${signal ? `, signal ${signal}` : ""})`;
  db.prepare(
    `UPDATE projects SET process_status = 'failed', process_pid = NULL, last_error = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND process_status IN ('starting','running')`
  ).run(message, row.id);
  if (runtime) runtime.startedAt = null;
}

export function projectLogs(slug: string): { slug: string; lines: string[]; source: string } {
  const row = getProject(slug);
  if (!row) throw new ProjectError("Project not found", 404);
  const runtime = runtimes.get(slug);
  return {
    slug,
    lines: runtime?.logs ?? [],
    source: runtime ? "live-process" : "none",
  };
}

export function projectDirectoryEntries(): string[] {
  ensureProjectDir();
  try {
    return fs.readdirSync(config.projectDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

// ---- same-origin subpath proxy -------------------------------------------

function upstreamPort(slug: string): number | null {
  const row = getProject(slug);
  if (!row || row.process_status !== "running") return null;
  return row.port ?? null;
}

function rewriteHtml(html: string, prefix: string): string {
  // Root-absolute asset URLs are the common reason a subpath proxy breaks.
  // Rewriting at the edge keeps the project's own config untouched.
  let out = html.replace(/(\s(?:href|src|action)=)(["'])\/(?!\/)/gi, `$1$2${prefix}/`);
  if (/<head[^>]*>/i.test(out) && !/<base\s/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (match) => `${match}\n<base href="${prefix}/">`);
  }
  return out;
}

export function handleProjectHttp(req: IncomingMessage, res: http.ServerResponse): boolean {
  // Express middleware mounted at /project gets the full URL in req.url
  // but req.path is the stripped path. Try both.
  const fullUrl = req.url ?? "/";
  const url = new URL(fullUrl, "http://localhost");
  let match = url.pathname.match(/^\/project\/([^/]+)(\/.*)?$/);
  if (!match) {
    // Try with req.path if available (Express adds it)
    const path = (req as any).path;
    if (path) {
      match = path.match(/^\/project\/([^/]+)(\/.*)?$/);
      if (!match) {
        // Try without the /project prefix (stripped by express)
        match = path.match(/^\/([^/]+)(\/.*)?$/);
        if (match) {
          // Reconstruct the full path for the rest of the logic
          match[0] = `/project${match[0]}`;
          match[1] = match[1];
          match[2] = match[2] || "/";
        }
      }
    }
  }
  if (!match) return false;
  const slug = decodeURIComponent(match[1]);
  if (!SLUG_RE.test(slug)) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "invalid project slug" }));
    return true;
  }
  const row = getProject(slug);
  if (!row) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "project not found" }));
    return true;
  }
  const prefix = `/project/${slug}`;
  if (match[2] === undefined) {
    res.writeHead(302, { location: `${prefix}/${url.search}` });
    res.end();
    return true;
  }

  // Static projects are served straight from disk, still behind the proxy.
  if (row.process_status === "running" && !row.port) {
    const dir = safeProjectPath(slug);
    if (!dir || !fs.existsSync(dir)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Project folder is missing");
      return true;
    }
    const rest = decodeURIComponent((match[2] ?? "/").replace(/^\/+/, ""));
    const target = path.resolve(dir, rest || "index.html");
    const root = path.resolve(dir);
    if (target !== root && !target.startsWith(root + path.sep)) {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end("invalid path");
      return true;
    }
    let file = target;
    try {
      if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
      if (!fs.existsSync(file)) file = path.join(dir, "index.html");
      const body = fs.readFileSync(file);
      const ext = path.extname(file).toLowerCase();
      const type = ext === ".html" ? "text/html; charset=utf-8"
        : ext === ".js" ? "text/javascript; charset=utf-8"
        : ext === ".css" ? "text/css; charset=utf-8"
        : ext === ".json" ? "application/json; charset=utf-8"
        : ext === ".svg" ? "image/svg+xml"
        : ext === ".png" ? "image/png"
        : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
        : ext === ".webp" ? "image/webp"
        : ext === ".ico" ? "image/x-icon"
        : "application/octet-stream";
      const payload = type.startsWith("text/html") ? rewriteHtml(body.toString("utf8"), prefix) : body;
      res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
      res.end(payload);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
    return true;
  }

  const port = upstreamPort(slug);
  if (!port) {
    res.writeHead(409, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><meta charset="utf-8"><title>Project not running</title><body style="font-family:system-ui;padding:2rem;background:#0b0d12;color:#e6e8ee"><h1>${escapeHtml(row.name)} is not running</h1><p>Start it from the Julie Projects page, then reload.</p><p><a style="color:#8ab4ff" href="/projects">Back to Projects</a></p></body>`);
    return true;
  }

  const rest = (match[2] || "/") + (url.search || "");
  const headers = { ...req.headers, host: `127.0.0.1:${port}` };
  delete headers["accept-encoding"]; // keep HTML readable for URL rewriting
  const upstream = http.request(
    { host: "127.0.0.1", port, method: req.method, path: rest || "/", headers },
    (upstreamRes) => {
      const contentType = String(upstreamRes.headers["content-type"] ?? "");
      const isHtml = contentType.includes("text/html");
      const responseHeaders = { ...upstreamRes.headers };
      delete responseHeaders["content-length"];
      delete responseHeaders["content-encoding"];
      delete responseHeaders["transfer-encoding"];
      if (isHtml) {
        const chunks: Buffer[] = [];
        upstreamRes.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        upstreamRes.on("end", () => {
          const html = rewriteHtml(Buffer.concat(chunks).toString("utf8"), prefix);
          res.writeHead(upstreamRes.statusCode ?? 200, { ...responseHeaders, "content-length": Buffer.byteLength(html), "cache-control": "no-store" });
          res.end(html);
        });
        upstreamRes.on("error", () => {
          if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
          res.end("Upstream stream failed");
        });
      } else {
        res.writeHead(upstreamRes.statusCode ?? 200, responseHeaders);
        upstreamRes.pipe(res);
      }
    }
  );
  upstream.on("error", (error) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Project upstream unavailable: ${error.message}`);
  });
  req.pipe(upstream);
  return true;
}

// WebSocket upgrades (Vite HMR, live reload) are tunneled at the socket level.
// The path prefix is stripped and Host/Origin rewritten to the upstream port.
export function handleProjectUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
  const url = req.url ?? "/";
  const match = url.match(/^\/project\/([^/?]+)(\/[^?]*)?(\?.*)?$/);
  if (!match) return false;
  const slug = decodeURIComponent(match[1]);
  const port = upstreamPort(slug);
  if (!port) {
    socket.end("HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n");
    return true;
  }
  const upstream = net.connect(port, "127.0.0.1", () => {
    const rest = (match[2] || "/") + (match[3] || "");
    const headers = Object.entries(req.headers)
      .filter(([key]) => key.toLowerCase() !== "host")
      .map(([key, value]) => Array.isArray(value) ? value.map((v) => `${key}: ${v}`).join("\r\n") : `${key}: ${value}`)
      .join("\r\n");
    upstream.write(`${req.method} ${rest} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n${headers}\r\n\r\n`);
    if (head?.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
  return true;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// Install exit handlers once per slug so the database reflects reality even if
// the child dies long after the launch request returned.
export function watchProjectRuntime(slug: string): void {
  const runtime = runtimeFor(slug);
  if (!runtime.child || runtime.child.exitCode !== null) return;
  runtime.child.once("exit", (code, signal) => recordExit(slug, code, signal));
}

// Reconcile at import time: the previous process tree may be gone.
reconcileProjects();
