// SQLite persistence: workspaces, tasks, conversations, messages, settings.
//
// Schema changes are versioned with `PRAGMA user_version`. A migration runs once
// per database and every step is written to be safe on a database that already
// has the column (older installs upgraded before versioning existed).
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

// The data directory holds the database, device identity, backups, and generated
// assets. It is owner-only: 0700 for the directory, 0600 for the database files.
fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
try { fs.chmodSync(config.dataDir, 0o700); } catch { /* best effort on exotic filesystems */ }

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function restrictDatabaseFileModes(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.chmodSync(`${config.dbPath}${suffix}`, 0o600); } catch { /* file may not exist yet */ }
  }
}
restrictDatabaseFileModes();

db.exec(`
CREATE TABLE IF NOT EXISTS workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'backlog'
    CHECK (status IN ('backlog','ready','in_progress','waiting_input','pending_review','done','blocked')),
  priority INTEGER NOT NULL DEFAULT 2,
  assigned_agent_id TEXT NOT NULL DEFAULT '',
  gateway_session_key TEXT NOT NULL DEFAULT '',
  last_run_output TEXT NOT NULL DEFAULT '',
  run_started_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  gateway_session_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  text TEXT NOT NULL,
  delivery_state TEXT NOT NULL DEFAULT 'complete',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS workspace_plans (
  token TEXT PRIMARY KEY,
  workspace_name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  team_mode TEXT NOT NULL CHECK (team_mode IN ('shared','dedicated')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','applied')),
  julie_session_id TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  catalog_json TEXT NOT NULL,
  result_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  applied_at TEXT
);
CREATE TABLE IF NOT EXISTS conversation_turn_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','dispatching','cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS conversation_turn_queue_next_idx
  ON conversation_turn_queue(conversation_id, status, id);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prompt_usage (
  prompt_hash TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  uses INTEGER NOT NULL DEFAULT 1,
  last_used TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command TEXT NOT NULL,
  exit_code INTEGER,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS agent_profiles (
  agent_id TEXT PRIMARY KEY,
  human_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  personality TEXT NOT NULL DEFAULT '',
  schedule_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (schedule_mode IN ('always_available','weekdays','manual')),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
  department TEXT NOT NULL DEFAULT '',
  reports_to TEXT NOT NULL DEFAULT '',
  org_level TEXT NOT NULL DEFAULT '',
  requested_tools TEXT NOT NULL DEFAULT '[]',
  requested_skills TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS workspace_agents (
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (workspace_id, agent_id)
);
CREATE TABLE IF NOT EXISTS task_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('owner','agent','system')),
  actor_id TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  from_status TEXT,
  to_status TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS task_activity_task_idx
  ON task_activity(task_id, id DESC);
CREATE TABLE IF NOT EXISTS agent_rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'task',
  department TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS agent_rooms_workspace_idx
  ON agent_rooms(workspace_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS agent_room_members (
  room_id INTEGER NOT NULL REFERENCES agent_rooms(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  gateway_session_key TEXT NOT NULL,
  gateway_session_id TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  last_dispatched_message_id INTEGER,
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (room_id, agent_id)
);
CREATE TABLE IF NOT EXISTS agent_room_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES agent_rooms(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('owner','agent','system')),
  sender_id TEXT NOT NULL,
  text TEXT NOT NULL,
  delivery_state TEXT NOT NULL CHECK (delivery_state IN ('local','confirmed','failed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS agent_room_messages_room_idx
  ON agent_room_messages(room_id, id);
CREATE TABLE IF NOT EXISTS agent_avatar_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  file_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp')),
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  cost_state TEXT NOT NULL DEFAULT 'not_reported'
    CHECK (cost_state IN ('reported','not_reported')),
  cost_usd REAL,
  gateway_applied INTEGER NOT NULL DEFAULT 0 CHECK (gateway_applied IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  applied_at TEXT
);
CREATE INDEX IF NOT EXISTS agent_avatar_assets_agent_idx
  ON agent_avatar_assets(agent_id, id DESC);
CREATE TABLE IF NOT EXISTS agent_avatar_provider_state (
  provider_id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('configured_unverified','last_attempt_failed','generation_succeeded')),
  last_attempt_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS agent_avatar_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('upload','https_url')),
  file_name TEXT,
  source_url TEXT,
  mime_type TEXT NOT NULL CHECK (mime_type = 'model/gltf-binary'),
  sha256 TEXT,
  size_bytes INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (
    (source_type = 'upload' AND file_name IS NOT NULL AND sha256 IS NOT NULL AND size_bytes IS NOT NULL)
    OR (source_type = 'https_url' AND source_url IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS agent_avatar_models_agent_idx
  ON agent_avatar_models(agent_id, id DESC);
CREATE TABLE IF NOT EXISTS run_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL DEFAULT '',
  session_key TEXT NOT NULL,
  session_id TEXT NOT NULL DEFAULT '',
  run_id TEXT NOT NULL,
  action_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('tool','run','note')),
  phase TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('running','completed','failed','blocked','stopped','unknown')),
  detail TEXT NOT NULL DEFAULT '',
  output TEXT NOT NULL DEFAULT '',
  is_error INTEGER NOT NULL DEFAULT 0 CHECK (is_error IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS run_actions_run_key
  ON run_actions(run_id, action_key);
CREATE INDEX IF NOT EXISTS run_actions_session_idx
  ON run_actions(session_key, id);
`);

export const TASK_STATUSES = [
  "backlog", "ready", "in_progress", "waiting_input", "pending_review", "done", "blocked",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// ---- versioned migrations -------------------------------------------------
// Every schema change is a numbered step. `PRAGMA user_version` records the
// last applied step, so a fresh install and an upgraded install converge on the
// same schema without re-running work. Steps are written defensively because
// databases created before versioning already contain some of these columns.

function tableColumns(table: string): Set<string> {
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name));
}

function migrateToV1(): void {
  const tasks = tableColumns("tasks");
  if (!tasks.has("gateway_session_key")) db.exec("ALTER TABLE tasks ADD COLUMN gateway_session_key TEXT NOT NULL DEFAULT ''");
  if (!tasks.has("last_run_output")) db.exec("ALTER TABLE tasks ADD COLUMN last_run_output TEXT NOT NULL DEFAULT ''");
  if (!tasks.has("run_started_at")) db.exec("ALTER TABLE tasks ADD COLUMN run_started_at TEXT");
  if (!tasks.has("assigned_agent_id")) db.exec("ALTER TABLE tasks ADD COLUMN assigned_agent_id TEXT NOT NULL DEFAULT ''");

  if (!tableColumns("messages").has("delivery_state")) {
    db.exec("ALTER TABLE messages ADD COLUMN delivery_state TEXT NOT NULL DEFAULT 'complete'");
  }

  const rooms = tableColumns("agent_rooms");
  if (!rooms.has("kind")) db.exec("ALTER TABLE agent_rooms ADD COLUMN kind TEXT NOT NULL DEFAULT 'task'");
  if (!rooms.has("department")) db.exec("ALTER TABLE agent_rooms ADD COLUMN department TEXT NOT NULL DEFAULT ''");
  if (!tableColumns("agent_room_members").has("gateway_session_id")) {
    db.exec("ALTER TABLE agent_room_members ADD COLUMN gateway_session_id TEXT NOT NULL DEFAULT ''");
  }

  const profiles = tableColumns("agent_profiles");
  if (!profiles.has("human_name")) db.exec("ALTER TABLE agent_profiles ADD COLUMN human_name TEXT NOT NULL DEFAULT ''");
  if (!profiles.has("department")) db.exec("ALTER TABLE agent_profiles ADD COLUMN department TEXT NOT NULL DEFAULT ''");
  if (!profiles.has("reports_to")) db.exec("ALTER TABLE agent_profiles ADD COLUMN reports_to TEXT NOT NULL DEFAULT ''");
  if (!profiles.has("org_level")) db.exec("ALTER TABLE agent_profiles ADD COLUMN org_level TEXT NOT NULL DEFAULT ''");

  // Existing rows predate the append-only task timeline. Record that boundary as
  // a baseline event rather than inventing historical edits or assignees.
  db.exec(`
    INSERT INTO task_activity (task_id, actor_type, event_type, details, created_at)
    SELECT t.id, 'system', 'baseline', 'Task existed before activity tracking', t.created_at
    FROM tasks t
    WHERE NOT EXISTS (SELECT 1 FROM task_activity a WHERE a.task_id = t.id);
  `);

  // One-time-compatible projection of the original single workspace_id field into
  // explicit many-to-many memberships. Existing rows remain as a legacy primary
  // assignment hint; workspace_agents is authoritative for scoped agent views.
  db.exec(`
    INSERT OR IGNORE INTO workspace_agents (workspace_id, agent_id)
    SELECT workspace_id, agent_id FROM agent_profiles WHERE workspace_id IS NOT NULL;
  `);
}

const MIGRATIONS: Array<{ version: number; up: () => void }> = [
  { version: 1, up: migrateToV1 },
];

export const SCHEMA_VERSION = MIGRATIONS.reduce((max, migration) => Math.max(max, migration.version), 0);

export function schemaVersion(): number {
  return Number(db.pragma("user_version", { simple: true })) || 0;
}

function migrate(): void {
  const current = schemaVersion();
  for (const migration of MIGRATIONS.filter((step) => step.version > current).sort((a, b) => a.version - b.version)) {
    db.transaction(() => {
      migration.up();
      db.pragma(`user_version = ${migration.version}`);
    })();
  }
  if (schemaVersion() < SCHEMA_VERSION) db.pragma(`user_version = ${SCHEMA_VERSION}`);
}
migrate();
restrictDatabaseFileModes();

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}
export function setSetting(key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}
