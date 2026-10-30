// JULIE AI OS — single Express process: API + static web build on one port.
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { config, validateConfig } from "./config.js";
import { api } from "./routes.js";
import { gateway } from "./gateway.js";
import { WebSocketServer } from "ws";
import http from "node:http";
import { setupTerminal } from "./terminal.js";
import { requireAuth, parseCookies, safeEqual, SESSION_COOKIE } from "./auth.js";
import {
  handleProjectHttp,
  handleProjectUpgrade,
} from "./projects.js";

const problems = validateConfig();
if (problems.length > 0) {
  console.error(`[julie] config incomplete: ${problems.join("; ")}`);
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.use("/api", api);

// Project subpath proxy at /project/<slug>/ — owner-session gated, like every
// mutating surface: running apps and their cookies must not be public. Raw
// project folders are deliberately NOT served statically; launch to view.
app.use("/project", requireAuth, (req, res, next) => {
  if (handleProjectHttp(req, res)) return;
  next();
});

// Static web build + SPA fallback (no full-page reloads: server serves index.html for app routes)
if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist, { index: "index.html" }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) { next(); return; }
    if (req.path.startsWith("/project/")) { next(); return; } // let static/404 handle it
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

// Upgrade handler: owner-gated project WS proxy + terminal WS (if enabled)
server.on("upgrade", (req, socket, head) => {
  if ((req.url ?? "").startsWith("/project/")) {
    const cookie = parseCookies(req)[SESSION_COOKIE];
    if (!cookie || !safeEqual(cookie, config.adminToken)) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return;
    }
    if (handleProjectUpgrade(req, socket, head)) return;
    socket.destroy();
    return;
  }
  if (config.terminalEnabled && req.url === "/terminal-ws") {
    const wss = new WebSocketServer({ noServer: true });
    setupTerminal(wss);
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    return;
  }
  socket.destroy();
});
if (config.terminalEnabled) {
  console.log(`[julie] owner terminal enabled (root ${config.terminalRoot})`);
} else {
  console.log("[julie] owner terminal disabled (set JULIE_TERMINAL_ENABLED=true to enable)");
}

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