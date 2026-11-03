import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";

type MigrationRow = { version: string; checksum: string };

export type MigrationResult = {
  applied: string[];
  existing: string[];
};

const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/;

export function applySqliteMigrations(database: BetterSqlite3.Database, migrationsDirectory: string): MigrationResult {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ) STRICT;
  `);

  const files = fs.readdirSync(migrationsDirectory)
    .filter((file) => MIGRATION_FILE.test(file))
    .sort();
  if (files.length === 0) throw new Error("No SQLite migration files found");

  const read = database.prepare("SELECT version, checksum FROM schema_migrations WHERE version = ?");
  const record = database.prepare("INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)");
  const result: MigrationResult = { applied: [], existing: [] };

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const sql = fs.readFileSync(path.join(migrationsDirectory, file), "utf8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    const previous = read.get(version) as MigrationRow | undefined;
    if (previous) {
      if (previous.checksum !== checksum) throw new Error(`Applied migration checksum changed: ${version}`);
      result.existing.push(version);
      continue;
    }
    database.transaction(() => {
      database.exec(sql);
      record.run(version, checksum);
    })();
    result.applied.push(version);
  }
  return result;
}
