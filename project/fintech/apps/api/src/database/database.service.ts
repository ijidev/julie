import fs from "node:fs";
import path from "node:path";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import BetterSqlite3 from "better-sqlite3";
import { findProjectRoot } from "../config/project-root.js";
import { runtimeConfig } from "../config/runtime-config.js";
import { applySqliteMigrations } from "./migration-runner.js";

export type DatabaseProbe =
  | { state: "connected"; engine: "sqlite"; latencyMs: number; migrations: number }
  | { state: "unavailable"; engine: "sqlite"; latencyMs: number; reason: "integrity_check_failed" | "query_failed" };

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly database: BetterSqlite3.Database;

  constructor() {
    const directory = path.dirname(runtimeConfig.sqlitePath);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(directory, 0o700); } catch { /* best effort on non-POSIX filesystems */ }

    this.database = new BetterSqlite3(runtimeConfig.sqlitePath, { timeout: 5_000 });
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("synchronous = FULL");
    this.database.pragma("busy_timeout = 5000");
    const migrationsDirectory = path.join(findProjectRoot(), "database", "sqlite");
    applySqliteMigrations(this.database, migrationsDirectory);
    this.restrictFileModes();
  }

  onModuleDestroy(): void {
    this.database.close();
  }

  async probe(): Promise<DatabaseProbe> {
    const started = performance.now();
    try {
      const check = this.database.pragma("quick_check", { simple: true });
      if (check !== "ok") {
        return { state: "unavailable", engine: "sqlite", latencyMs: Math.max(0, Math.round(performance.now() - started)), reason: "integrity_check_failed" };
      }
      const count = this.database.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get() as { count: number };
      this.restrictFileModes();
      return { state: "connected", engine: "sqlite", latencyMs: Math.max(0, Math.round(performance.now() - started)), migrations: count.count };
    } catch {
      return { state: "unavailable", engine: "sqlite", latencyMs: Math.max(0, Math.round(performance.now() - started)), reason: "query_failed" };
    }
  }

  private restrictFileModes(): void {
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = `${runtimeConfig.sqlitePath}${suffix}`;
      if (!fs.existsSync(file)) continue;
      try { fs.chmodSync(file, 0o600); } catch { /* best effort on non-POSIX filesystems */ }
    }
  }
}
