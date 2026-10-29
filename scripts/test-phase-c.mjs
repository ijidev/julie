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
  test("unauthenticated agent overview returns 401", async () => {
    const res = await fetch(`${BASE}/api/agents/overview`);
    assert.strictEqual(res.status, 401);
  });
  test("unauthenticated agent detail returns 401", async () => {
    const res = await fetch(`${BASE}/api/agents/main`);
    assert.strictEqual(res.status, 401);
  });
  test("unauthenticated agent history returns 401", async () => {
    const res = await fetch(`${BASE}/api/agents/main/sessions/not-a-session/history`);
    assert.strictEqual(res.status, 401);
  });
  test("unauthenticated per-agent send returns 401", async () => {
    const res = await fetch(`${BASE}/api/agents/main/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "must not run", sessionId: null }),
    });
    assert.strictEqual(res.status, 401);
  });
  test("unauthenticated onboarding options return 401", async () => {
    const res = await fetch(`${BASE}/api/agents/onboarding/options`);
    assert.strictEqual(res.status, 401);
  });
  test("unauthenticated agent creation returns 401", async () => {
    const res = await fetch(`${BASE}/api/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true, name: "must-not-create" }),
    });
    assert.strictEqual(res.status, 401);
  });
  test("unauthenticated agent update returns 401", async () => {
    const res = await fetch(`${BASE}/api/agents/main`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true, name: "must-not-update" }),
    });
    assert.strictEqual(res.status, 401);
  });
  test("unauthenticated workspace-agent assignments return 401", async () => {
    const res = await fetch(`${BASE}/api/agents/assignments`);
    assert.strictEqual(res.status, 401);
  });
  test("unauthenticated workspace-agent assignment mutation returns 401", async () => {
    const res = await fetch(`${BASE}/api/agents/assignments`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: 1, agentIds: [], confirmed: true }),
    });
    assert.strictEqual(res.status, 401);
  });
  test("unauthenticated avatar studio returns 401", async () => {
    const res = await fetch(`${BASE}/api/agents/main/avatar`);
    assert.strictEqual(res.status, 401);
  });
  test("unauthenticated avatar preview returns 401", async () => {
    const res = await fetch(`${BASE}/api/agents/main/avatar/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "synthetic_hologram", ownerNotes: "" }),
    });
    assert.strictEqual(res.status, 401);
  });
  test("unauthenticated avatar generation returns 401", async () => {
    const res = await fetch(`${BASE}/api/agents/main/avatar/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true, costAcknowledged: true }),
    });
    assert.strictEqual(res.status, 401);
  });
  test("unauthenticated avatar apply returns 401", async () => {
    const res = await fetch(`${BASE}/api/agents/main/avatar/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: 1, confirmed: true }),
    });
    assert.strictEqual(res.status, 401);
  });
  test("unauthenticated avatar fallback returns 401", async () => {
    const res = await fetch(`${BASE}/api/agents/main/avatar/fallback.svg`);
    assert.strictEqual(res.status, 401);
  });
  test("unauthenticated avatar image import returns 401", async () => {
    const res = await fetch(`${BASE}/api/agents/main/avatar/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: "data:image/png;base64,AA==", confirmed: true }),
    });
    assert.strictEqual(res.status, 401);
  });
  test("unauthenticated remote avatar apply returns 401", async () => {
    const res = await fetch(`${BASE}/api/agents/main/avatar/apply-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/avatar.png", confirmed: true }),
    });
    assert.strictEqual(res.status, 401);
  });
  test("unauthenticated GLB upload returns 401", async () => {
    const res = await fetch(`${BASE}/api/agents/main/avatar/model`, {
      method: "POST",
      headers: { "Content-Type": "model/gltf-binary", "X-Julie-Confirm": "true" },
      body: Buffer.from("glTF"),
    });
    assert.strictEqual(res.status, 401);
  });
  test("unauthenticated GLB URL storage returns 401", async () => {
    const res = await fetch(`${BASE}/api/agents/main/avatar/model-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/avatar.glb", confirmed: true }),
    });
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

  test("agent overview returns sanitized real-data summaries", async () => {
    const res = await fetch(`${BASE}/api/agents/overview`, { headers: { Cookie: authCookie } });
    assert.strictEqual(res.status, 200);
    const d = await res.json();
    assert.strictEqual(d.ok, true);
    assert.strictEqual(d.source, "gateway");
    assert.ok(Array.isArray(d.agents));
    assert.strictEqual(d.summary.configuredAgents, d.agents.length);
    assert.ok(Array.isArray(d.summary.usage.models), "aggregate model usage must be an array");
    const states = new Set(["working", "no_active_run", "no_sessions", "unknown"]);
    for (const agent of d.agents) {
      assert.strictEqual(typeof agent.id, "string");
      assert.ok(states.has(agent.activity.state), `unexpected activity state: ${agent.activity.state}`);
      assert.ok(["desk", "library", "lounge", "home", "staging"].includes(agent.office.zone));
      if (agent.activity.state === "working") {
        assert.strictEqual(agent.office.zone, "desk");
        assert.strictEqual(agent.office.classification, "verified");
      } else {
        assert.strictEqual(agent.office.zone, "staging", "non-working agents require stronger evidence before room placement");
        assert.strictEqual(agent.office.classification, "unclassified");
      }
      assert.ok(!Object.hasOwn(agent, "workspace"), "host workspace path must not be exposed");
    }
    const body = JSON.stringify(d);
    assert.ok(!body.includes("/.openclaw/"), "OpenClaw host paths must not be exposed");
    assert.ok(!body.includes('"sessionFile"'), "usage storage paths must not be exposed");
    assert.ok(!body.includes('"activeRunIds"'), "raw run identifiers must not be exposed");
  });

  test("agent detail returns bounded profile data without host paths or raw SOUL", async () => {
    const overview = await fetch(`${BASE}/api/agents/overview`, { headers: { Cookie: authCookie } }).then(r => r.json());
    assert.ok(overview.agents.length > 0, "live Gateway should return at least one configured agent");
    const id = overview.agents[0].id;
    const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(id)}`, { headers: { Cookie: authCookie } });
    assert.strictEqual(res.status, 200);
    const d = await res.json();
    assert.strictEqual(d.ok, true);
    assert.strictEqual(d.source, "gateway");
    assert.strictEqual(d.agent.id, id);
    assert.ok(Array.isArray(d.agent.activity.sessions));
    assert.ok(Array.isArray(d.agent.tools.items));
    assert.ok(Array.isArray(d.agent.skills.items));
    assert.ok(Array.isArray(d.agent.commands.items));
    assert.ok(Array.isArray(d.agent.usage.models), "per-agent model usage must be an array");
    for (const model of d.agent.usage.models) {
      assert.strictEqual(typeof model.model, "string");
      assert.strictEqual(typeof model.totalTokens, "number");
      assert.strictEqual(typeof model.totalCost, "number");
      assert.strictEqual(typeof model.missingCostEntries, "number");
    }
    assert.strictEqual(d.agent.role.state, "configured");
    assert.strictEqual(d.agent.taskHistory.state, "linked");
    assert.ok(Array.isArray(d.agent.taskHistory.items));
    assert.ok(!Object.hasOwn(d.agent.soul, "content"), "raw SOUL content must not be returned");
    const body = JSON.stringify(d);
    assert.ok(!body.includes("/.openclaw/"), "OpenClaw host paths must not be exposed");
    assert.ok(!body.includes('"sessionFile"'), "usage storage paths must not be exposed");
    assert.ok(!body.includes('"activeRunIds"'), "raw run identifiers must not be exposed");
  });

  test("unknown agent detail returns 404 without fallback", async () => {
    const res = await fetch(`${BASE}/api/agents/__julie_missing_agent__`, { headers: { Cookie: authCookie } });
    assert.strictEqual(res.status, 404);
    const d = await res.json();
    assert.strictEqual(d.ok, false);
    assert.strictEqual(d.error, "agent not found");
  });

  test("per-agent history is scoped, sanitized, and user/assistant-only", async (t) => {
    const overview = await fetch(`${BASE}/api/agents/overview`, { headers: { Cookie: authCookie } }).then(r => r.json());
    const row = overview.agents.find(agent => agent.activity.visibleSessions > 0);
    if (!row) { t.skip("active workspace has no assigned agent with a visible session"); return; }
    const detail = await fetch(`${BASE}/api/agents/${encodeURIComponent(row.id)}`, { headers: { Cookie: authCookie } }).then(r => r.json());
    const session = detail.agent.activity.sessions.find(session => session.sessionId);
    assert.ok(session, "expected a visible session id");
    const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(row.id)}/sessions/${encodeURIComponent(session.sessionId)}/history`, { headers: { Cookie: authCookie } });
    assert.strictEqual(res.status, 200);
    const d = await res.json();
    assert.strictEqual(d.ok, true);
    assert.strictEqual(d.agentId, row.id);
    assert.ok(d.messages.every(message => message.role === "user" || message.role === "assistant"));
    const body = JSON.stringify(d);
    assert.ok(!body.includes("/.openclaw/"), "history must redact OpenClaw host paths");
    assert.ok(!body.includes('"key"'), "session key must stay server-side");
  });

  test("per-agent send validates empty input without executing", async () => {
    const overview = await fetch(`${BASE}/api/agents/overview`, { headers: { Cookie: authCookie } }).then(r => r.json());
    const id = overview.agents[0].id;
    const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(id)}/chat`, {
      method: "POST",
      headers: { Cookie: authCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "   ", sessionId: null }),
    });
    assert.strictEqual(res.status, 400);
    const d = await res.json();
    assert.strictEqual(d.error, "message required");
  });

  test("agent onboarding options are live, bounded, and capability-honest", async () => {
    const res = await fetch(`${BASE}/api/agents/onboarding/options`, { headers: { Cookie: authCookie } });
    assert.strictEqual(res.status, 200);
    const d = await res.json();
    assert.strictEqual(d.ok, true);
    assert.strictEqual(d.creationSupported, true);
    assert.ok(Array.isArray(d.models));
    assert.ok(Array.isArray(d.tools));
    assert.ok(Array.isArray(d.skills));
    assert.ok(Array.isArray(d.workspaces));
    assert.ok(d.models.every(model => typeof model.id === "string" && typeof model.available === "boolean"));
    assert.ok(d.gatewayAppliedFields.includes("name"));
    assert.ok(d.julieManagedFields.includes("tool requests"));
    assert.match(d.policyNote, /requests/i);
  });

  test("agent creation requires explicit review confirmation before Gateway mutation", async () => {
    const res = await fetch(`${BASE}/api/agents`, {
      method: "POST",
      headers: { Cookie: authCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "must-not-create", confirmed: false }),
    });
    assert.strictEqual(res.status, 400);
    const d = await res.json();
    assert.strictEqual(d.error, "review confirmation required");
  });

  test("agent update requires explicit review confirmation before Gateway mutation", async () => {
    const overview = await fetch(`${BASE}/api/agents/overview`, { headers: { Cookie: authCookie } }).then(r => r.json());
    const id = overview.agents[0].id;
    const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Cookie: authCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: false, name: "must-not-update" }),
    });
    assert.strictEqual(res.status, 400);
    const d = await res.json();
    assert.strictEqual(d.error, "review confirmation required");
  });

  test("agent overview is exactly scoped to active workspace assignments", async () => {
    const assignments = await fetch(`${BASE}/api/agents/assignments`, { headers: { Cookie: authCookie } }).then(r => r.json());
    const overview = await fetch(`${BASE}/api/agents/overview`, { headers: { Cookie: authCookie } }).then(r => r.json());
    assert.strictEqual(overview.workspace.id, assignments.workspace.id);
    assert.deepStrictEqual(
      overview.agents.map(agent => agent.id).sort(),
      assignments.agents.filter(agent => agent.assigned).map(agent => agent.id).sort(),
    );
    assert.strictEqual(overview.summary.configuredAgents, overview.agents.length);
    assert.strictEqual(overview.summary.gatewayRosterTotal, assignments.summary.gatewayRosterTotal);
  });

  test("workspace assignment changes require explicit confirmation", async () => {
    const assignments = await fetch(`${BASE}/api/agents/assignments`, { headers: { Cookie: authCookie } }).then(r => r.json());
    const current = assignments.agents.filter(agent => agent.assigned).map(agent => agent.id);
    const res = await fetch(`${BASE}/api/agents/assignments`, {
      method: "PUT",
      headers: { Cookie: authCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: assignments.workspace.id, agentIds: current, confirmed: false }),
    });
    assert.strictEqual(res.status, 400);
    const d = await res.json();
    assert.strictEqual(d.error, "assignment confirmation required");
  });

  test("avatar studio projects live provider readiness without auth hints or paths", async () => {
    const overview = await fetch(`${BASE}/api/agents/overview`, { headers: { Cookie: authCookie } }).then(r => r.json());
    const id = overview.agents[0].id;
    const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(id)}/avatar`, { headers: { Cookie: authCookie } });
    assert.strictEqual(res.status, 200);
    const d = await res.json();
    assert.strictEqual(d.ok, true);
    assert.strictEqual(d.source, "gateway+local");
    assert.ok(Array.isArray(d.providers));
    assert.ok(d.providers.some(provider => provider.configured), "expected a configured live image provider");
    assert.strictEqual(typeof d.readiness.verifiedUsableProviderCount, "number");
    assert.strictEqual(typeof d.readiness.failedProviderCount, "number");
    assert.ok(d.providers.every(provider => ["not_configured", "not_supported", "configured_unverified", "last_attempt_failed", "generation_succeeded"].includes(provider.runtimeState)));
    assert.ok(d.providers.some(provider => provider.id === "omniroute" && provider.runtimeState === "not_supported"));
    assert.ok(!d.providers.some(provider => provider.id === "openrouter"), "owner-selected avatar policy excludes OpenRouter");
    assert.ok(d.providers.every(provider => provider.models.every(model => model.cost.state === "not_reported" && model.cost.estimateUsd === null)));
    assert.ok(Array.isArray(d.models3d));
    assert.match(d.model3dBoundary, /Julie-only/);
    assert.strictEqual(d.preview.inferredAppearance, false);
    assert.match(d.preview.prompt, /Do not infer or depict human gender/i);
    const body = JSON.stringify(d);
    assert.ok(!body.includes("authEnvVars"), "provider auth hints must not leave the server");
    assert.ok(!body.includes("OPENAI_API_KEY"), "provider credential variable names must not be projected");
    assert.ok(!body.includes("/home/"), "avatar readiness must not expose host paths");
  });

  test("avatar prompt preview is deterministic, bounded, and source-labeled", async () => {
    const overview = await fetch(`${BASE}/api/agents/overview`, { headers: { Cookie: authCookie } }).then(r => r.json());
    const id = overview.agents[0].id;
    const input = { direction: "abstract_core", ownerNotes: "Use a compass motif and restrained amber light." };
    const request = () => fetch(`${BASE}/api/agents/${encodeURIComponent(id)}/avatar/preview`, {
      method: "POST",
      headers: { Cookie: authCookie, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then(async res => ({ status: res.status, body: await res.json() }));
    const first = await request();
    const second = await request();
    assert.strictEqual(first.status, 200);
    assert.strictEqual(second.status, 200);
    assert.strictEqual(first.body.preview.promptHash, second.body.preview.promptHash);
    assert.strictEqual(first.body.preview.promptHash.length, 64);
    assert.ok(first.body.preview.prompt.length <= 4000);
    assert.ok(first.body.preview.sources.includes("explicit owner notes"));
    assert.strictEqual(first.body.preview.inferredAppearance, false);
  });

  test("avatar preview rejects credential-shaped owner notes", async () => {
    const overview = await fetch(`${BASE}/api/agents/overview`, { headers: { Cookie: authCookie } }).then(r => r.json());
    const id = overview.agents[0].id;
    const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(id)}/avatar/preview`, {
      method: "POST",
      headers: { Cookie: authCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "synthetic_hologram", ownerNotes: "api_key=must-not-pass" }),
    });
    assert.strictEqual(res.status, 400);
  });

  test("avatar generation requires review and cost acknowledgement before execution", async () => {
    const overview = await fetch(`${BASE}/api/agents/overview`, { headers: { Cookie: authCookie } }).then(r => r.json());
    const id = overview.agents[0].id;
    const url = `${BASE}/api/agents/${encodeURIComponent(id)}/avatar/generate`;
    const unreviewed = await fetch(url, {
      method: "POST",
      headers: { Cookie: authCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: false, costAcknowledged: false }),
    });
    assert.strictEqual(unreviewed.status, 400);
    const unacknowledged = await fetch(url, {
      method: "POST",
      headers: { Cookie: authCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true, costAcknowledged: false }),
    });
    assert.strictEqual(unacknowledged.status, 400);
    const d = await unacknowledged.json();
    assert.strictEqual(d.error, "provider cost acknowledgement required");
  });

  test("avatar application requires exact-image review before Gateway mutation", async () => {
    const overview = await fetch(`${BASE}/api/agents/overview`, { headers: { Cookie: authCookie } }).then(r => r.json());
    const id = overview.agents[0].id;
    const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(id)}/avatar/apply`, {
      method: "POST",
      headers: { Cookie: authCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: 1, confirmed: false }),
    });
    assert.strictEqual(res.status, 400);
    const d = await res.json();
    assert.strictEqual(d.error, "generated image review confirmation required");
  });

  test("avatar fallback is a private deterministic SVG without host data", async () => {
    const overview = await fetch(`${BASE}/api/agents/overview`, { headers: { Cookie: authCookie } }).then(r => r.json());
    const id = overview.agents[0].id;
    const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(id)}/avatar/fallback.svg`, { headers: { Cookie: authCookie } });
    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /^image\/svg\+xml/);
    assert.match(res.headers.get("cache-control") ?? "", /private/);
    const svg = await res.text();
    assert.match(svg, /^<\?xml/);
    assert.ok(!svg.includes("/home/"));
    assert.ok(!svg.includes(".openclaw"));
  });

  test("avatar image import requires explicit local-storage confirmation", async () => {
    const overview = await fetch(`${BASE}/api/agents/overview`, { headers: { Cookie: authCookie } }).then(r => r.json());
    const id = overview.agents[0].id;
    const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(id)}/avatar/import`, {
      method: "POST",
      headers: { Cookie: authCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ image: "data:image/png;base64,AA==", confirmed: false }),
    });
    assert.strictEqual(res.status, 400);
    const d = await res.json();
    assert.strictEqual(d.error, "image import confirmation required");
  });

  test("remote image avatar requires review and rejects non-HTTPS URLs before Gateway mutation", async () => {
    const overview = await fetch(`${BASE}/api/agents/overview`, { headers: { Cookie: authCookie } }).then(r => r.json());
    const id = overview.agents[0].id;
    const url = `${BASE}/api/agents/${encodeURIComponent(id)}/avatar/apply-url`;
    const unconfirmed = await fetch(url, {
      method: "POST",
      headers: { Cookie: authCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/avatar.png", confirmed: false }),
    });
    assert.strictEqual(unconfirmed.status, 400);
    const insecure = await fetch(url, {
      method: "POST",
      headers: { Cookie: authCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://example.com/avatar.png", confirmed: true }),
    });
    assert.strictEqual(insecure.status, 400);
  });

  test("GLB upload requires explicit storage confirmation", async () => {
    const overview = await fetch(`${BASE}/api/agents/overview`, { headers: { Cookie: authCookie } }).then(r => r.json());
    const id = overview.agents[0].id;
    const bytes = Buffer.alloc(12);
    bytes.write("glTF", 0, "ascii");
    bytes.writeUInt32LE(2, 4);
    bytes.writeUInt32LE(12, 8);
    const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(id)}/avatar/model`, {
      method: "POST",
      headers: { Cookie: authCookie, "Content-Type": "model/gltf-binary" },
      body: bytes,
    });
    assert.strictEqual(res.status, 400);
    const d = await res.json();
    assert.strictEqual(d.error, "3D model storage confirmation required");
  });

  test("3D model URL storage is GLB-only and does not pretend Gateway compatibility", async () => {
    const overview = await fetch(`${BASE}/api/agents/overview`, { headers: { Cookie: authCookie } }).then(r => r.json());
    const id = overview.agents[0].id;
    const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(id)}/avatar/model-url`, {
      method: "POST",
      headers: { Cookie: authCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/avatar.gltf", confirmed: true }),
    });
    assert.strictEqual(res.status, 400);
    const d = await res.json();
    assert.match(d.error, /\.glb/);
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
