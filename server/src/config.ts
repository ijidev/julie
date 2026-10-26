// Environment + secrets loading for JULIE AI OS.
// Secrets live ONLY in /home/admin/julie/.env (gitignored). Never log them.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

function loadEnvFile(p: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const fileEnv = loadEnvFile(path.join(ROOT, ".env"));
const env = (key: string, fallback = ""): string => process.env[key] ?? fileEnv[key] ?? fallback;

export const config = {
  root: ROOT,
  port: parseInt(env("PORT", "3000"), 10),
  host: env("BIND_HOST", "0.0.0.0"),
  dbPath: env("DB_PATH", path.join(ROOT, "data", "julie.db")),
  dataDir: path.join(ROOT, "data"),
  webDist: path.join(ROOT, "web", "dist"),
  adminPassword: env("ADMIN_PASSWORD"), // owner login password
  adminToken: env("ADMIN_TOKEN"), // session cookie secret
  gatewayUrl: env("GATEWAY_URL", "ws://127.0.0.1:18789"),
  gatewayToken: env("GATEWAY_TOKEN"), // OpenClaw gateway shared secret
  deviceIdentityPath: path.join(ROOT, "data", "device-identity.json"),
};

export function validateConfig(): string[] {
  const problems: string[] = [];
  if (!config.adminPassword) problems.push("ADMIN_PASSWORD missing");
  if (!config.adminToken) problems.push("ADMIN_TOKEN missing");
  if (!config.gatewayToken) problems.push("GATEWAY_TOKEN missing");
  return problems;
}