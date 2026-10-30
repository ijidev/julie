#!/usr/bin/env node
// Julie setup doctor: reads local configuration and performs bounded, read-only
// discovery. It never prints secret values and never changes anything.
//
//   npm run doctor
//
// Exit code 0 = no failures (warnings are allowed), 1 = at least one failure.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const checks = [];

function record(status, name, detail) {
  checks.push({ status, name, detail });
}

function pass(name, detail) { record("PASS", name, detail); }
function warn(name, detail) { record("WARN", name, detail); }
function fail(name, detail) { record("FAIL", name, detail); }

function readPackage() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  } catch {
    return {};
  }
}

function readEnvFile() {
  const out = {};
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return { file, values: out, exists: false };
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return { file, values: out, exists: true };
}

function modeOf(file) {
  try {
    return (fs.statSync(file).mode & 0o777).toString(8).padStart(4, "0");
  } catch {
    return null;
  }
}

function run(command, args, timeout = 15000) {
  return execFileSync(command, args, {
    cwd: ROOT,
    timeout,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
}

// ---- runtime --------------------------------------------------------------
const pkg = readPackage();
const minimum = (pkg.engines?.node ?? "").replace(/^>=?\s*/, "");
if (minimum) {
  const [wantMajor, wantMinor] = minimum.split(".").map(Number);
  const [haveMajor, haveMinor] = process.versions.node.split(".").map(Number);
  const ok = haveMajor > wantMajor || (haveMajor === wantMajor && haveMinor >= (wantMinor || 0));
  (ok ? pass : fail)("Node.js version", `running ${process.versions.node}; requires >=${minimum}`);
} else {
  warn("Node.js version", `running ${process.versions.node}; package.json has no engines constraint`);
}

// ---- configuration --------------------------------------------------------
const envFile = readEnvFile();
if (!envFile.exists) {
  fail(".env present", `missing ${path.relative(ROOT, envFile.file) || ".env"} — copy .env.example and fill it in`);
} else {
  const mode = modeOf(envFile.file);
  const tooOpen = mode && parseInt(mode, 8) & 0o077;
  (tooOpen ? fail : pass)(".env permissions", `mode ${mode}; secrets must not be readable by group/other`);
}

const required = ["ADMIN_PASSWORD", "ADMIN_TOKEN", "GATEWAY_TOKEN"];
const missing = required.filter((key) => !envFile.values[key]);
if (missing.length) fail("required secrets", `missing: ${missing.join(", ")} (values are never printed)`);
else pass("required secrets", "ADMIN_PASSWORD, ADMIN_TOKEN, GATEWAY_TOKEN present");

const minimums = { ADMIN_PASSWORD: 12, ADMIN_TOKEN: 24 };
for (const [key, min] of Object.entries(minimums)) {
  const value = envFile.values[key] ?? "";
  if (value && value.length < min) fail(`${key} strength`, `${value.length} characters; minimum ${min}`);
}

const dataDir = path.resolve(ROOT, envFile.values.JULIE_DATA_DIR || "data");
const dbPath = path.resolve(dataDir, envFile.values.DB_PATH || "julie.db");

// ---- local state ----------------------------------------------------------
if (!fs.existsSync(dataDir)) {
  warn("data directory", `${dataDir} does not exist yet; it is created with mode 0700 on first boot`);
} else {
  const mode = modeOf(dataDir);
  const tooOpen = mode && parseInt(mode, 8) & 0o077;
  (tooOpen ? warn : pass)("data directory", `${dataDir} mode ${mode}${tooOpen ? " (should be 0700)" : ""}`);
}

if (!fs.existsSync(dbPath)) {
  warn("database", `${dbPath} does not exist yet; it is created on first boot`);
} else {
  const mode = modeOf(dbPath);
  const tooOpen = mode && parseInt(mode, 8) & 0o077;
  (tooOpen ? warn : pass)("database", `${path.basename(dbPath)} mode ${mode}${tooOpen ? " (should be 0600)" : ""}`);
  try {
    const { default: Database } = await import("better-sqlite3");
    const database = new Database(dbPath, { readonly: true });
    const version = Number(database.pragma("user_version", { simple: true })) || 0;
    const integrity = database.pragma("integrity_check", { simple: true });
    database.close();
    (integrity === "ok" ? pass : fail)("database integrity", `integrity_check=${integrity}; schema user_version=${version}`);
  } catch (error) {
    warn("database integrity", `could not inspect database: ${error.message}`);
  }
}

// ---- builds ---------------------------------------------------------------
const serverBuild = path.join(ROOT, "server", "dist", "index.js");
const webBuild = path.join(ROOT, "web", "dist", "index.html");
if (fs.existsSync(serverBuild)) pass("backend build", "server/dist/index.js present");
else fail("backend build", "missing — run: npm run build");
if (fs.existsSync(webBuild)) pass("web build", "web/dist/index.html present");
else fail("web build", "missing — run: npm run web:build");

// ---- OpenClaw discovery ---------------------------------------------------
const openclawBin = envFile.values.OPENCLAW_BIN || process.env.OPENCLAW_BIN || "openclaw";
let cliVersion = null;
try {
  cliVersion = run(openclawBin, ["--version"]).trim().split("\n")[0];
  pass("OpenClaw CLI", cliVersion);
} catch (error) {
  fail("OpenClaw CLI", `could not run ${openclawBin}: ${error.code ?? error.message}`);
}

let discoveredPort = null;
if (cliVersion) {
  try {
    // Discovery only. We read a small set of non-secret fields; environment
    // values and key material are never printed.
    const status = JSON.parse(run(openclawBin, ["gateway", "status", "--json"], 20000));
    const runtime = status?.service?.runtime ?? {};
    const port = status?.service?.command?.environment?.OPENCLAW_GATEWAY_PORT;
    discoveredPort = port ? String(port) : null;
    const running = runtime.status === "running" || runtime.state === "active";
    (running ? pass : warn)(
      "OpenClaw Gateway service",
      `${runtime.status ?? runtime.state ?? "unknown"}${runtime.pid ? `, pid ${runtime.pid}` : ""}${discoveredPort ? `, port ${discoveredPort}` : ""}`
    );
  } catch (error) {
    warn("OpenClaw Gateway service", `gateway status unavailable: ${error.code ?? error.message}`);
  }
}

const configuredGateway = envFile.values.GATEWAY_URL || "ws://127.0.0.1:18789";
if (discoveredPort) {
  const configuredPort = configuredGateway.match(/:(\d+)(?:\/|$)/)?.[1] ?? null;
  if (configuredPort && configuredPort !== discoveredPort) {
    warn("Gateway URL", `${configuredGateway} does not match discovered port ${discoveredPort}`);
  } else {
    pass("Gateway URL", `${configuredGateway} matches the discovered Gateway`);
  }
} else {
  warn("Gateway URL", `configured ${configuredGateway}; discovery did not report a port`);
}

// ---- running service ------------------------------------------------------
const port = envFile.values.PORT || "3000";
const healthUrl = `http://127.0.0.1:${port}/api/health`;
try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  const response = await fetch(healthUrl, { signal: controller.signal });
  clearTimeout(timer);
  const health = await response.json();
  const gateway = health?.gateway?.connected ? "gateway connected" : "gateway not connected";
  (response.ok && health?.ok ? pass : fail)(
    "Julie health",
    `${healthUrl} -> ${response.status}, version ${health?.version ?? "?"}, schema ${health?.schemaVersion ?? "?"}, ${gateway}, terminal ${health?.terminal?.enabled ? "enabled" : "disabled"}`
  );
} catch (error) {
  warn("Julie health", `not reachable at ${healthUrl} (${error.name === "AbortError" ? "timed out" : error.message})`);
}

// ---- report ---------------------------------------------------------------
const width = Math.max(...checks.map((check) => check.name.length));
let failures = 0;
let warnings = 0;
console.log(`\nJulie doctor — ${ROOT}\n`);
for (const check of checks) {
  if (check.status === "FAIL") failures += 1;
  if (check.status === "WARN") warnings += 1;
  console.log(`  ${check.status.padEnd(4)} ${check.name.padEnd(width)}  ${check.detail}`);
}
console.log(`\n${checks.length} checks: ${checks.filter((c) => c.status === "PASS").length} pass, ${warnings} warn, ${failures} fail`);
console.log(`Host: ${os.hostname()} · user: ${os.userInfo().username}\n`);
process.exit(failures > 0 ? 1 : 0);
