// Terminal execution bridge (Owner only).
// WebSocket protocol: { type: "exec", command, cwd?, timeoutMs? }
//   -> responses: { type: "data", stream, text } | { type: "exit", code, durationMs } | { type: "error", message }
import { WebSocketServer, type WebSocket } from "ws";
import { spawn } from "node:child_process";
import { db } from "./db.js";
import { config } from "./config.js";
import { parseCookies, SESSION_COOKIE, safeEqual } from "./auth.js";

interface ExecRequest {
  type: "exec";
  command?: unknown;
  cwd?: unknown;
  timeoutMs?: unknown;
}

interface ExecState {
  proc: ReturnType<typeof spawn> | null;
  startedAt: number;
}

const SECRET_PATTERNS = [
  /\benv\b/, /\bprintenv\b/, /\bsetenv\b/,
  /cat\s+.*\.env\b/, /cat\s+.*\.env\./, /cat\s+.*\.env$/i,
  /\.env$/i, /\.env\s*$/i, /\.env\./i,
  /export\s+.*=/i, /echo\s+.*\$[A-Z_]{2,}/i,
  /aws\s+.*get-caller-identity/i, /aws\s+.*sts/i,
  /kubectl\s+.*get\s+secret/i, /kubectl\s+.*describe\s+secret/i,
  /docker\s+.*inspect/i, /curl\s+.*-H\s+.*[Aa]uthorization/i,
  /\/proc\/.*\/environ/i, /\/proc\/.*\/cmdline/i,
  /\bapi[_-]?key\b/i, /\bsecret\b/i, /\bpassword\b/i, /\btoken\b/i, /\bcredential/i,
];

function isSecretAttempt(cmd: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(cmd));
}

// Rate limiting: max 10 execs per rolling 60s window per connection.
const WINDOW_MS = 60_000;
const MAX_EXEC_PER_WINDOW = 10;

export function setupTerminal(wss: WebSocketServer): void {
  wss.on("connection", (ws: WebSocket, req: any) => {
    // Auth: only owner session cookie.
    const cookie = parseCookies(req);
    const sessionToken = cookie[SESSION_COOKIE];
    if (!sessionToken || !safeEqual(sessionToken, config.adminToken)) {
      ws.send(JSON.stringify({ type: "error", message: "Unauthorized" }));
      ws.close(4401, "Unauthorized");
      return;
    }

    const state: ExecState = { proc: null, startedAt: 0 };
    const timestamps: number[] = [];

    const audit = (cmd: string, code: number | null, durationMs: number) => {
      try {
        db.prepare("INSERT INTO audit_logs (command, exit_code, duration_ms) VALUES (?, ?, ?)")
          .run(cmd.slice(0, 2000), code, durationMs);
      } catch { /* audit logging must not break execution */ }
    };

    ws.on("message", (data: unknown) => {
      let msg: ExecRequest;
      try {
        msg = JSON.parse(String(data));
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      if (msg.type === "exec") {
        // Rate limit check.
        const now = Date.now();
        while (timestamps.length > 0 && now - timestamps[0] > WINDOW_MS) timestamps.shift();
        if (timestamps.length >= MAX_EXEC_PER_WINDOW) {
          ws.send(JSON.stringify({ type: "error", message: "Rate limit exceeded (10 commands/minute)" }));
          return;
        }
        timestamps.push(now);

        // If already running, refuse concurrent execution on this connection.
        if (state.proc && state.proc.exitCode === null) {
          ws.send(JSON.stringify({ type: "error", message: "A command is already running. Use the kill button first." }));
          return;
        }

        const cmd = typeof msg.command === "string" ? msg.command.trim() : "";
        if (!cmd) {
          ws.send(JSON.stringify({ type: "error", message: "Command required" }));
          return;
        }
        if (isSecretAttempt(cmd)) {
          ws.send(JSON.stringify({ type: "error", message: "Refusal: this command pattern could expose secrets. Only safe commands are permitted." }));
          return;
        }

        // cwd validation: restrict to a safe set.
        let cwd = typeof msg.cwd === "string" ? msg.cwd : "/home/admin";
        if (cwd.includes("..") || !cwd.startsWith("/home/admin")) cwd = "/home/admin";

        const timeoutMs = typeof msg.timeoutMs === "number" && msg.timeoutMs > 0 && msg.timeoutMs <= 600000
          ? msg.timeoutMs : 30000;

        state.startedAt = Date.now();
        const proc = spawn("bash", ["-c", cmd], { cwd, env: { PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" } });
        state.proc = proc;

        let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
          if (proc.exitCode === null) {
            ws.send(JSON.stringify({ type: "error", message: `Execution timed out after ${timeoutMs / 1000}s. Killed.` }));
            proc.kill("SIGKILL");
          }
        }, timeoutMs);

        proc.stdout?.on("data", (chunk: Buffer) => {
          ws.send(JSON.stringify({ type: "data", stream: "stdout", text: chunk.toString() }));
        });
        proc.stderr?.on("data", (chunk: Buffer) => {
          ws.send(JSON.stringify({ type: "data", stream: "stderr", text: chunk.toString() }));
        });
        proc.on("error", (err: Error) => {
          if (timeoutId) clearTimeout(timeoutId);
          ws.send(JSON.stringify({ type: "error", message: `Spawn failed: ${err.message}` }));
          audit(cmd, 127, Date.now() - state.startedAt);
        });
        proc.on("close", (code: number | null) => {
          if (timeoutId) clearTimeout(timeoutId);
          const durationMs = Date.now() - state.startedAt;
          ws.send(JSON.stringify({ type: "exit", code: code ?? -1, durationMs }));
          audit(cmd, code, durationMs);
          state.proc = null;
        });
      } else if (msg.type === "kill") {
        if (state.proc && state.proc.exitCode === null) {
          state.proc.kill("SIGKILL");
          ws.send(JSON.stringify({ type: "info", message: "Kill signal sent." }));
        } else {
          ws.send(JSON.stringify({ type: "info", message: "No running process to kill." }));
        }
      }
    });

    ws.on("close", () => {
      if (state.proc && state.proc.exitCode === null) {
        state.proc.kill("SIGKILL");
      }
    });
  });
}
