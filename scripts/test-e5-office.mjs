import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

let cookie = "";
const auth = () => ({ Cookie: cookie });
const forbiddenKeys = new Set(["gateway_session_key", "gatewaySessionKey", "sessionKey", "runId"]);

function assertPrivateRoutingAbsent(value, { hostPaths = true } = {}) {
  const walk = (row) => {
    if (Array.isArray(row)) { row.forEach(walk); return; }
    if (!row || typeof row !== "object") return;
    for (const [key, nested] of Object.entries(row)) {
      assert.ok(!forbiddenKeys.has(key), `response leaked key ${key}`);
      walk(nested);
    }
  };
  walk(value);
  if (hostPaths) assert.ok(!JSON.stringify(value).includes("/home/admin/.openclaw"), "response leaked an OpenClaw host path");
}

before(async () => {
  const response = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
  });
  assert.equal(response.status, 200);
  cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  assert.ok(cookie);
});

describe("E5 office auth and projections", () => {
  test("organization and rooms require the owner session", async () => {
    assert.equal((await fetch(`${BASE}/api/agents/organization`)).status, 401);
    assert.equal((await fetch(`${BASE}/api/agent-rooms`)).status, 401);
  });

  test("task projection includes real stats and assignments without private session keys", async () => {
    const response = await fetch(`${BASE}/api/tasks?workspaceId=1`, { headers: auth() });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.ok, true);
    assert.equal(typeof data.summary.total, "number");
    assert.equal(typeof data.summary.assigned, "number");
    assert.equal(data.summary.total, data.tasks.length);
    assert.ok(data.tasks.every((task) => typeof task.assigned_agent_id === "string" && typeof task.session_linked === "boolean"));
    assertPrivateRoutingAbsent(data, { hostPaths: false });
  });

  test("conversation list and transcript keep Gateway routing server-side", async () => {
    const list = await fetch(`${BASE}/api/conversations?workspaceId=1`, { headers: auth() }).then((response) => response.json());
    assert.equal(list.ok, true);
    assertPrivateRoutingAbsent(list);
    if (list.conversations.length > 0) {
      const transcript = await fetch(`${BASE}/api/conversations/${list.conversations[0].id}/messages`, { headers: auth() }).then((response) => response.json());
      assert.equal(transcript.ok, true);
      assertPrivateRoutingAbsent(transcript);
    }
  });

  test("organization is complete and obeys CEO → main → lead → specialist invariants", async () => {
    const response = await fetch(`${BASE}/api/agents/organization?workspaceId=1`, { headers: auth() });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.owner.role, "CEO");
    assert.equal(data.summary.complete, true);
    assert.equal(data.summary.configured, data.summary.rosterMembers);
    const main = data.members.find((member) => member.agentId === "main");
    assert.deepEqual({ level: main.level, reportsTo: main.reportsTo }, { level: "executive", reportsTo: "owner" });
    const leads = new Map(data.members.filter((member) => member.level === "lead").map((member) => [member.agentId, member]));
    assert.ok(leads.size > 0);
    for (const lead of leads.values()) assert.equal(lead.reportsTo, "main");
    for (const specialist of data.members.filter((member) => member.level === "specialist")) {
      assert.ok(leads.has(specialist.reportsTo));
      assert.equal(leads.get(specialist.reportsTo).department, specialist.department);
    }
    assertPrivateRoutingAbsent(data);
  });

  test("organization mutation requires explicit confirmation", async () => {
    const response = await fetch(`${BASE}/api/agents/organization`, {
      method: "PUT",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: 1, members: [], confirmed: false }),
    });
    assert.equal(response.status, 400);
  });

  test("room list/detail expose only confirmed public projections", async (t) => {
    const listResponse = await fetch(`${BASE}/api/agent-rooms?workspaceId=1`, { headers: auth() });
    assert.equal(listResponse.status, 200);
    const list = await listResponse.json();
    assert.equal(list.ok, true);
    assertPrivateRoutingAbsent(list);
    if (list.rooms.length === 0) { t.skip("no retained room fixture"); return; }
    const response = await fetch(`${BASE}/api/agent-rooms/${list.rooms[0].id}`, { headers: auth() });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.ok(data.room.members.length >= 2);
    assert.ok(data.room.messages.every((message) => ["local", "confirmed", "failed"].includes(message.deliveryState)));
    assertPrivateRoutingAbsent(data);
  });

  test("room creation and empty dispatch are rejected before mutation", async (t) => {
    const tasks = await fetch(`${BASE}/api/tasks?workspaceId=1`, { headers: auth() }).then((response) => response.json());
    const task = tasks.tasks.find((row) => row.status !== "done");
    if (!task) { t.skip("no open task"); return; }
    const create = await fetch(`${BASE}/api/agent-rooms`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: 1, taskId: task.id, agentIds: ["main"], confirmed: false }),
    });
    assert.equal(create.status, 400);
    const rooms = await fetch(`${BASE}/api/agent-rooms?workspaceId=1`, { headers: auth() }).then((response) => response.json());
    if (rooms.rooms.length === 0) return;
    const send = await fetch(`${BASE}/api/agent-rooms/${rooms.rooms[0].id}/messages`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ text: "   ", agentIds: rooms.rooms[0].members.map((member) => member.agentId) }),
    });
    assert.equal(send.status, 400);
  });

  test("room SSE hello is sanitized and restores the real active-run snapshot", async (t) => {
    const rooms = await fetch(`${BASE}/api/agent-rooms?workspaceId=1`, { headers: auth() }).then((response) => response.json());
    if (rooms.rooms.length === 0) { t.skip("no retained room fixture"); return; }
    const controller = new AbortController();
    const response = await fetch(`${BASE}/api/agent-rooms/${rooms.rooms[0].id}/events`, { headers: auth(), signal: controller.signal });
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes('"type":"hello"')) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
      if (text.length > 20_000) break;
    }
    controller.abort();
    assert.match(text, /"type":"hello"/);
    for (const key of forbiddenKeys) assert.ok(!text.includes(`"${key}"`), `SSE leaked key ${key}`);
    assertPrivateRoutingAbsent(text);
  });

  test("agent detail exposes linked tasks without routing internals", async () => {
    const response = await fetch(`${BASE}/api/agents/main?refresh=1`, { headers: auth() });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.agent.taskHistory.state, "linked");
    assert.ok(Array.isArray(data.agent.taskHistory.items));
    assertPrivateRoutingAbsent(data);
  });
});
