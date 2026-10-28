// SQLite persistence: workspaces, tasks, conversations, messages, settings.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
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
  role TEXT NOT NULL DEFAULT '',
  personality TEXT NOT NULL DEFAULT '',
  schedule_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (schedule_mode IN ('always_available','weekdays','manual')),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
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
`);

export const TASK_STATUSES = [
  "backlog", "ready", "in_progress", "waiting_input", "pending_review", "done", "blocked",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// Migrations for existing databases (ALTER only adds columns; idempotent).
function migrateTasks(): void {
  const cols = (db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>).map((c) => c.name);
  const has = (n: string) => cols.includes(n);
  if (!has("gateway_session_key")) db.exec("ALTER TABLE tasks ADD COLUMN gateway_session_key TEXT NOT NULL DEFAULT ''");
  if (!has("last_run_output")) db.exec("ALTER TABLE tasks ADD COLUMN last_run_output TEXT NOT NULL DEFAULT ''");
  if (!has("run_started_at")) db.exec("ALTER TABLE tasks ADD COLUMN run_started_at TEXT");
}
migrateTasks();

// One-time-compatible projection of the original single workspace_id field into
// explicit many-to-many memberships. Existing rows remain as a legacy primary
// assignment hint; workspace_agents is authoritative for scoped agent views.
db.exec(`
  INSERT OR IGNORE INTO workspace_agents (workspace_id, agent_id)
  SELECT workspace_id, agent_id FROM agent_profiles WHERE workspace_id IS NOT NULL;
`);

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}
export function setSetting(key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}
