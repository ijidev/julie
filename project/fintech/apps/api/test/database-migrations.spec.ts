import fs from "node:fs";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { findProjectRoot } from "../src/config/project-root.js";
import { applySqliteMigrations } from "../src/database/migration-runner.js";

describe("SQLite migration runner", () => {
  it("applies migrations once and enforces immutable audit evidence", () => {
    const database = new BetterSqlite3(":memory:");
    try {
      const directory = path.join(findProjectRoot(), "database", "sqlite");
      const first = applySqliteMigrations(database, directory);
      const second = applySqliteMigrations(database, directory);
      expect(first.applied).toEqual(["001_foundation"]);
      expect(second.existing).toEqual(["001_foundation"]);

      database.prepare(`
        INSERT INTO audit_events
          (id, actor_type, action, resource_type, request_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        "00000000-0000-4000-8000-000000000001",
        "system",
        "test.insert",
        "database",
        "00000000-0000-4000-8000-000000000002",
        "{}",
      );
      expect(() => database.prepare("UPDATE audit_events SET action = 'changed'").run()).toThrow(/append-only/);
      expect(() => database.prepare("DELETE FROM audit_events").run()).toThrow(/append-only/);
    } finally {
      database.close();
    }
  });

  it("rejects an edited migration after it has been recorded", () => {
    const database = new BetterSqlite3(":memory:");
    const source = path.join(findProjectRoot(), "database", "sqlite");
    const scratch = path.join(findProjectRoot(), "data");
    fs.mkdirSync(scratch, { recursive: true });
    const temp = fs.mkdtempSync(path.join(scratch, "migration-test-"));
    try {
      const file = "001_foundation.sql";
      fs.copyFileSync(path.join(source, file), path.join(temp, file));
      applySqliteMigrations(database, temp);
      fs.appendFileSync(path.join(temp, file), "\n-- modified\n");
      expect(() => applySqliteMigrations(database, temp)).toThrow(/checksum changed/);
    } finally {
      database.close();
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});
