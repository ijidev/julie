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

describe("Task Card Run Output (Phase D-2 Chunk B)", () => {
  let wsId = null;
  let taskId = null;

  test("PATCH /api/tasks/:id accepts last_run_output and run_started_at", async () => {
    const ws = await fetch(`${BASE}/api/workspaces`, { headers: { Cookie: authCookie } }).then(r => r.json());
    wsId = ws.activeWorkspaceId || ws.workspaces[0].id;
    const created = await fetch(`${BASE}/api/tasks`, {
      method: "POST",
      headers: { Cookie: authCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: wsId, title: "E2E: task run output field (auto-cleanup)", status: "backlog" }),
    }).then(r => r.json());
    assert.strictEqual(created.ok, true);
    taskId = created.task.id;

    const patched = await fetch(`${BASE}/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { Cookie: authCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ last_run_output: "E2E run evidence line", run_started_at: "2026-10-26T18:00:00.000Z" }),
    }).then(r => r.json());
    assert.strictEqual(patched.ok, true);
    assert.strictEqual(patched.task.last_run_output, "E2E run evidence line");
    assert.strictEqual(patched.task.run_started_at, "2026-10-26T18:00:00.000Z");

    const list = await fetch(`${BASE}/api/tasks?workspaceId=${wsId}`, { headers: { Cookie: authCookie } }).then(r => r.json());
    const row = list.tasks.find((t) => t.id === taskId);
    assert.strictEqual(row.last_run_output, "E2E run evidence line");
  });

  test("PATCH without new fields is backward compatible (keeps previous values)", async () => {
    if (taskId == null) throw new Error("setup failed");
    const patched = await fetch(`${BASE}/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { Cookie: authCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    }).then(r => r.json());
    assert.strictEqual(patched.ok, true);
    assert.strictEqual(patched.task.last_run_output, "E2E run evidence line");
    assert.strictEqual(patched.task.run_started_at, "2026-10-26T18:00:00.000Z");
  });

  test("cleanup: test card deleted", async () => {
    if (taskId == null) throw new Error("setup failed");
    const del = await fetch(`${BASE}/api/tasks/${taskId}`, { method: "DELETE", headers: { Cookie: authCookie } }).then(r => r.json());
    assert.strictEqual(del.ok, true);
    taskId = null;
  });
});
