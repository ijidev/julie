// Environment + secrets loading for JULIE AI OS.
//
// Nothing here assumes a specific install path or user. The repository root is
// derived from this module's location, and every host-specific value can be
// overridden through the environment or the local `.env` file. Secrets are
// never logged; only their presence is validated.
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

function readPackageVersion(root: string): string {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    return typeof raw.version === "string" && raw.version.trim() ? raw.version.trim() : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const envFile = path.join(ROOT, ".env");
const fileEnv = loadEnvFile(envFile);
const env = (key: string, fallback = ""): string => process.env[key] ?? fileEnv[key] ?? fallback;
const envBool = (key: string, fallback: boolean): boolean => {
  const raw = env(key).trim().toLowerCase();
  if (raw === "") return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
};

const dataDir = path.resolve(ROOT, env("JULIE_DATA_DIR", "data"));
const dbPath = path.resolve(dataDir, env("DB_PATH", "julie.db"));

export const config = {
  root: ROOT,
  envFile,
  appVersion: readPackageVersion(ROOT),
  port: parseInt(env("PORT", "3000"), 10),
  host: env("BIND_HOST", "0.0.0.0"),
  dataDir,
  dbPath,
  webDist: path.join(ROOT, "web", "dist"),
  adminPassword: env("ADMIN_PASSWORD"), // owner login password
  adminToken: env("ADMIN_TOKEN"), // session cookie secret
  gatewayUrl: env("GATEWAY_URL", "ws://127.0.0.1:18789"),
  gatewayToken: env("GATEWAY_TOKEN"), // OpenClaw gateway shared secret
  deviceIdentityPath: path.join(dataDir, "device-identity.json"),
  // Owner terminal execution is a high-risk capability and is off unless the
  // operator explicitly enables it. When enabled, commands are confined to a
  // single directory tree (the repository by default).
  terminalEnabled: envBool("JULIE_TERMINAL_ENABLED", false),
  terminalRoot: path.resolve(ROOT, env("JULIE_TERMINAL_ROOT", ".")),
  openclawBin: env("OPENCLAW_BIN", "openclaw"),
  // Project folders live in one directory tree; each immediate child directory
  // becomes a project entry. Launched projects get an allocated port in the
  // configured range, or are reached through the authenticated subpath proxy.
  projectDir: path.resolve(ROOT, env("JULIE_PROJECT_DIR", "project")),
  projectPortStart: parseInt(env("JULIE_PROJECT_PORT_START", "4100"), 10),
  projectPortEnd: parseInt(env("JULIE_PROJECT_PORT_END", "4199"), 10),
  projectPublicBase: env("JULIE_PUBLIC_BASE_URL", "").replace(/\/+$/, ""),
};

export function validateConfig(): string[] {
  const problems: string[] = [];
  if (!config.adminPassword) problems.push("ADMIN_PASSWORD missing");
  if (!config.adminToken) problems.push("ADMIN_TOKEN missing");
  if (!config.gatewayToken) problems.push("GATEWAY_TOKEN missing");
  if (config.adminPassword && config.adminPassword.length < 12) problems.push("ADMIN_PASSWORD must be at least 12 characters");
  if (config.adminToken && config.adminToken.length < 24) problems.push("ADMIN_TOKEN must be at least 24 characters");
  if (!Number.isInteger(config.projectPortStart) || !Number.isInteger(config.projectPortEnd) || config.projectPortStart > config.projectPortEnd) {
    problems.push("JULIE_PROJECT_PORT_START/END must be an inclusive integer range");
  }
  if (!config.terminalEnabled) return problems;
  if (!fs.existsSync(config.terminalRoot)) problems.push(`JULIE_TERMINAL_ROOT does not exist: ${config.terminalRoot}`);
  return problems;
}
