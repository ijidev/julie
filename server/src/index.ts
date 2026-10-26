// JULIE AI OS — single Express process: API + static web build on one port.
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { config, validateConfig } from "./config.js";
import { api } from "./routes.js";
import { gateway } from "./gateway.js";

const problems = validateConfig();
if (problems.length > 0) {
  console.error(`[julie] config incomplete: ${problems.join("; ")}`);
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.use("/api", api);

// Static web build + SPA fallback (no full-page reloads: server serves index.html for app routes)
if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist, { index: "index.html" }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) { next(); return; }
    res.sendFile(path.join(config.webDist, "index.html"));
  });
} else {
  app.get("*", (_req, res) => res.status(503).send("web build missing — run: npm run web:build"));
}

// JSON error handler (bad JSON bodies etc.)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(err.status ?? 500).json({ ok: false, error: err.message ?? "internal error" });
});

// Seed default workspace on first boot
import { db, getSetting, setSetting } from "./db.js";
if (!getSetting("active_workspace_id")) {
  const count = (db.prepare("SELECT COUNT(*) AS n FROM workspaces").get() as any).n;
  if (count === 0) {
    const info = db.prepare("INSERT INTO workspaces (name, description) VALUES (?, ?)").run("Mission Control", "Default JULIE workspace");
    setSetting("active_workspace_id", String(info.lastInsertRowid));
    console.log("[julie] seeded default workspace");
  }
}

const server = app.listen(config.port, config.host, () => {
  console.log(`[julie] listening on http://${config.host}:${config.port}`);
});

// Establish the gateway connection in the background; never block boot.
gateway.ensureConnected().then(() => {
  const s = gateway.getStatus();
  console.log(`[julie] gateway connected (server ${s.serverVersion ?? "?"}, protocol ${s.protocol ?? "?"})`);
}).catch((e) => {
  console.error(`[julie] gateway connect failed: ${e.message}`);
  gateway.getStatus();
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    gateway.shutdown();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}