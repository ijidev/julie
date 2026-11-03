import { DatabaseService } from "./database.service.js";

const database = new DatabaseService();
try {
  const probe = await database.probe();
  if (probe.state !== "connected") throw new Error(`SQLite migration verification failed: ${probe.reason}`);
  console.log(JSON.stringify({ ok: true, engine: probe.engine, migrations: probe.migrations }));
} finally {
  database.onModuleDestroy();
}
