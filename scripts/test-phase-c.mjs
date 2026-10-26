import { test, describe, before } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";

// Load .env for credentials
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}
const PW = process.env.ADMIN_PASSWORD;

let authCookie = null;

async function login() {
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PW })
  });
  assert.strictEqual(res.status, 200, `Login failed with ${res.status}`);
  const cookie = res.headers.get("set-cookie");
  assert.ok(cookie, "No session cookie set");
  authCookie = cookie.split(";")[0];
}

describe("Auth & Security", () => {
  test("unauthenticated agents request returns 401", async () => {
    const res = await fetch(`${BASE}/api/agents`);
    assert.strictEqual(res.status, 401);
  });
  test("unauthenticated tools request returns 401", async () => {
    const res = await fetch(`${BASE}/api/tools`);
    assert.strictEqual(res.status, 401);
  });
  test("unauthenticated analytics request returns 401", async () => {
    const res = await fetch(`${BASE}/api/analytics`);
    assert.strictEqual(res.status, 401);
  });
});

describe("API Shape & Data", () => {
  before(async () => { await login(); });

  test("agents endpoint returns ok and array", async () => {
    const d = await fetch(`${BASE}/api/agents`, { headers: { Cookie: authCookie } }).then(r => r.json());
    assert.strictEqual(d.ok, true);
    assert.ok(Array.isArray(d.agents));
  });

  test("tools endpoint returns ok and array", async () => {
    const d = await fetch(`${BASE}/api/tools`, { headers: { Cookie: authCookie } }).then(r => r.json());
    assert.strictEqual(d.ok, true);
    assert.ok(Array.isArray(d.tools));
  });

  test("analytics endpoint returns numeric counts", async () => {
    const d = await fetch(`${BASE}/api/analytics`, { headers: { Cookie: authCookie } }).then(r => r.json());
    assert.strictEqual(d.ok, true);
    assert.strictEqual(typeof d.analytics.conversationCount, "number");
    assert.strictEqual(typeof d.analytics.taskCount, "number");
    assert.ok(Array.isArray(d.analytics.messagesPerDay));
  });
});
