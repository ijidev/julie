import fs from "node:fs";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";

const root = path.resolve(import.meta.dirname, "..");
const sqliteDirectory = path.join(root, "database", "sqlite");
const mysqlDirectory = path.join(root, "database", "mysql");
const filePattern = /^\d{3}_[a-z0-9_]+\.sql$/;

const sqliteFiles = fs.readdirSync(sqliteDirectory).filter((file) => filePattern.test(file)).sort();
const mysqlFiles = fs.readdirSync(mysqlDirectory).filter((file) => filePattern.test(file)).sort();
if (sqliteFiles.length === 0) throw new Error("No SQLite migrations found");
if (sqliteFiles.join("\n") !== mysqlFiles.join("\n")) throw new Error("SQLite and MySQL migration versions differ");

const sqlite = new BetterSqlite3(":memory:");
try {
  sqlite.pragma("foreign_keys = ON");
  for (const file of sqliteFiles) sqlite.exec(fs.readFileSync(path.join(sqliteDirectory, file), "utf8"));
  sqlite.prepare(`
    INSERT INTO audit_events
      (id, actor_type, action, resource_type, request_id, metadata)
    VALUES
      ('00000000-0000-4000-8000-000000000001', 'system', 'schema.validate', 'database', '00000000-0000-4000-8000-000000000002', '{}')
  `).run();
  let immutable = false;
  try { sqlite.prepare("DELETE FROM audit_events").run(); } catch { immutable = true; }
  if (!immutable) throw new Error("SQLite audit_events delete trigger is missing");
} finally {
  sqlite.close();
}

for (const file of mysqlFiles) {
  const sql = fs.readFileSync(path.join(mysqlDirectory, file), "utf8");
  for (const required of ["ENGINE=InnoDB", "schema_migrations", "audit_events", "SIGNAL SQLSTATE '45000'"]) {
    if (!sql.includes(required)) throw new Error(`${file} is missing required MySQL control: ${required}`);
  }
  if (/\bDROP\s+(?:DATABASE|TABLE)\b/i.test(sql)) throw new Error(`${file} contains a destructive database/table drop`);
}

console.log(`Database artifact validation passed (${sqliteFiles.length} SQLite + ${mysqlFiles.length} MySQL migration files).`);
