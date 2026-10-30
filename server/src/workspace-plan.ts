import crypto from "node:crypto";
import { db } from "./db.js";
import { gateway } from "./gateway.js";
import { prepareAgentChatSession } from "./agent-chat.js";
import { getAgentProfileMap, getAgentWorkspaceAssignmentMap, setAgentWorkspaceAssignments } from "./agent-profiles.js";
import { createOnboardedAgent } from "./agent-onboarding.js";
import { ensureDepartmentTeamRooms } from "./agent-rooms.js";

export class WorkspacePlanError extends Error {
  status: number;
  details?: Record<string, unknown>;

  constructor(message: string, status = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = "WorkspacePlanError";
    this.status = status;
    this.details = details;
  }
}

type TeamMode = "shared" | "dedicated";

type PlanAgent = { agentId: string; reason: string };
type PlanRole = { name: string; role: string; emoji: string; reason: string; personality: string };

type WorkspacePlan = {
  summary: string;
  teamModeRationale: string;
  recommendedAgents: PlanAgent[];
  newRoles: PlanRole[];
  environment: {
    projectDirectory: string;
    runtime: string;
    setupSteps: string[];
  };
  model: string | null;
  tools: string[];
  skills: string[];
  operatingRules: string[];
  acceptanceChecks: string[];
  risks: string[];
};

type PlanCatalog = {
  agents: Array<{
    agentId: string;
    displayName: string;
    role: string;
    department: string;
    level: string | null;
    model: string | null;
    workspaces: string[];
  }>;
  models: Array<{ id: string; name: string; available: boolean }>;
  existingWorkspaces: Array<{ id: number; name: string; description: string }>;
};

function cleanLine(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\r\n\0]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\0/g, "").trim().slice(0, max) : "";
}

function stringList(value: unknown, maxItems = 12, maxLength = 300): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanLine(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function normalisePlan(raw: any): WorkspacePlan {
  const recommendedAgents = Array.isArray(raw?.recommendedAgents)
    ? raw.recommendedAgents
        .map((item: any) => ({ agentId: cleanLine(item?.agentId, 128), reason: cleanLine(item?.reason, 500) }))
        .filter((item: PlanAgent) => item.agentId)
        .slice(0, 20)
    : [];
  const newRoles = Array.isArray(raw?.newRoles)
    ? raw.newRoles
        .map((item: any) => ({
          name: cleanLine(item?.name, 80),
          role: cleanLine(item?.role, 120),
          emoji: cleanLine(item?.emoji, 20) || "🤖",
          reason: cleanLine(item?.reason, 500),
          personality: cleanText(item?.personality, 1500),
        }))
        .filter((item: PlanRole) => item.name && item.role)
        .slice(0, 8)
    : [];
  const environmentRaw = raw?.environment && typeof raw.environment === "object" ? raw.environment : {};
  return {
    summary: cleanText(raw?.summary, 2000),
    teamModeRationale: cleanText(raw?.teamModeRationale, 1500),
    recommendedAgents,
    newRoles,
    environment: {
      projectDirectory: cleanLine(environmentRaw.projectDirectory, 500),
      runtime: cleanLine(environmentRaw.runtime, 500),
      setupSteps: stringList(environmentRaw.setupSteps, 12, 500),
    },
    model: cleanLine(raw?.model, 400) || null,
    tools: stringList(raw?.tools, 20, 160),
    skills: stringList(raw?.skills, 20, 160),
    operatingRules: stringList(raw?.operatingRules, 12, 500),
    acceptanceChecks: stringList(raw?.acceptanceChecks, 12, 500),
    risks: stringList(raw?.risks, 12, 500),
  };
}

function parsePlanReply(reply: string): WorkspacePlan {
  const unfenced = reply.replace(/```(?:json)?/gi, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new WorkspacePlanError("Julie did not return a JSON plan", 502);
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    throw new WorkspacePlanError("Julie's plan was not valid JSON", 502);
  }
  return normalisePlan(parsed);
}

async function buildCatalog(): Promise<PlanCatalog> {
  const [roster, modelResult] = await Promise.all([gateway.getAgentRoster(), gateway.listModels()]);
  const profiles = getAgentProfileMap();
  const assignments = getAgentWorkspaceAssignmentMap();
  const agents = roster.agents.map((agent) => {
    const profile = profiles.get(agent.id);
    return {
      agentId: agent.id,
      displayName: profile?.humanName || agent.identity?.name || agent.name || agent.id,
      role: profile?.role || "",
      department: profile?.department || "",
      level: profile?.orgLevel ?? null,
      model: typeof agent.model === "string" ? agent.model : typeof agent.model?.primary === "string" ? agent.model.primary : null,
      workspaces: (assignments.get(agent.id) ?? []).map((workspace) => workspace.name),
    };
  });
  const models = (Array.isArray(modelResult?.models) ? modelResult.models : [])
    .filter((row: any) => typeof row?.provider === "string" && typeof row?.id === "string")
    .map((row: any) => ({
      id: `${row.provider}/${row.id}`,
      name: typeof row.name === "string" ? row.name : String(row.id),
      available: row.available === true,
    }))
    .filter((row: { available: boolean }) => row.available)
    .slice(0, 30);
  const existingWorkspaces = db.prepare("SELECT id, name, description FROM workspaces ORDER BY name").all() as PlanCatalog["existingWorkspaces"];
  return { agents, models, existingWorkspaces };
}

function planPrompt(name: string, purpose: string, teamMode: TeamMode, catalog: PlanCatalog): string {
  return [
    "You are Julie, planning a new owner-approved Julie AiOS workspace.",
    "Return ONLY a single JSON object. No markdown, no prose outside JSON.",
    "",
    `Workspace name: ${name}`,
    `Workspace purpose: ${purpose}`,
    `Required team mode: ${teamMode}`,
    "",
    teamMode === "shared"
      ? "SHARED TEAM: reuse agents from the live office roster. recommendedAgents must contain the exact agentId values needed, including a lead. newRoles must be an empty array."
      : "DEDICATED TEAM: propose new agents dedicated to this workspace. newRoles must contain 2-6 roles with unique human names, including exactly one lead. recommendedAgents must be empty.",
    "",
    "Choose the smallest competent team. Do not invent existing agent ids. Do not claim anything was created, installed, or verified.",
    "Environment setup is a plan only: propose a project directory and reviewable setup steps; no command is executed by this plan.",
    "",
    "Schema:",
    JSON.stringify({
      summary: "short outcome",
      teamModeRationale: "why this mode and team",
      recommendedAgents: [{ agentId: "exact existing id", reason: "why" }],
      newRoles: [{ name: "human first name", role: "role title", emoji: "one emoji", reason: "why", personality: "working style" }],
      environment: { projectDirectory: "/absolute/or/relative/path", runtime: "runtime/tooling", setupSteps: ["reviewable step"] },
      model: "exact model id from available models",
      tools: ["capability needed"],
      skills: ["skill or workflow needed"],
      operatingRules: ["approval or operating rule"],
      acceptanceChecks: ["observable check"],
      risks: ["real risk or unknown"],
    }, null, 2),
    "",
    "Live agent roster:",
    JSON.stringify(catalog.agents),
    "",
    "Available models:",
    JSON.stringify(catalog.models),
    "",
    "Existing workspaces:",
    JSON.stringify(catalog.existingWorkspaces),
  ].join("\n");
}

function validatePlanAgainstCatalog(plan: WorkspacePlan, teamMode: TeamMode, catalog: PlanCatalog): string[] {
  const warnings: string[] = [];
  const knownIds = new Set(catalog.agents.map((agent) => agent.agentId));
  plan.recommendedAgents = plan.recommendedAgents.filter((agent) => {
    if (knownIds.has(agent.agentId)) return true;
    warnings.push(`Ignored unknown recommended agent ${agent.agentId}.`);
    return false;
  });
  if (teamMode === "shared" && plan.recommendedAgents.length === 0) {
    throw new WorkspacePlanError("Julie did not recommend a valid shared team", 502);
  }
  if (teamMode === "dedicated" && (plan.newRoles.length < 2 || plan.newRoles.length > 6)) {
    throw new WorkspacePlanError("Julie must propose between two and six dedicated roles", 502);
  }
  if (teamMode === "dedicated") {
    plan.recommendedAgents = [];
    const existingNames = new Set(catalog.agents.map((agent) => agent.displayName.toLowerCase()));
    const requested = new Set<string>();
    plan.newRoles = plan.newRoles.filter((role) => {
      const key = role.name.toLowerCase();
      if (existingNames.has(key) || requested.has(key)) {
        warnings.push(`Ignored duplicate dedicated role name ${role.name}.`);
        return false;
      }
      requested.add(key);
      return true;
    });
    if (plan.newRoles.length < 2) throw new WorkspacePlanError("Julie's dedicated roles collided with existing agents", 502);
  }
  if (teamMode === "shared") plan.newRoles = [];
  if (plan.model && !catalog.models.some((model) => model.id === plan.model)) {
    warnings.push(`Requested model ${plan.model} is not currently available; the first available model will be used for dedicated agents.`);
    plan.model = null;
  }
  return warnings;
}

export async function planWorkspace(raw: any) {
  const name = cleanLine(raw?.name, 120);
  const purpose = cleanText(raw?.purpose ?? raw?.description, 2000);
  const teamMode = raw?.teamMode;
  if (!name) throw new WorkspacePlanError("workspace name required");
  if (!purpose) throw new WorkspacePlanError("workspace purpose required");
  if (teamMode !== "shared" && teamMode !== "dedicated") {
    throw new WorkspacePlanError("teamMode is required: choose shared or dedicated every time");
  }
  if (/(?:api[_ -]?key|access[_ -]?token|password|client[_ -]?secret)\s*[:=]/i.test(purpose)) {
    throw new WorkspacePlanError("workspace purpose must not contain credentials");
  }
  const catalog = await buildCatalog();
  if (teamMode === "dedicated" && catalog.models.length === 0) {
    throw new WorkspacePlanError("no available Gateway model can support dedicated agent creation", 409);
  }
  const prepared = await prepareAgentChatSession("main", null, purpose, `Workspace plan · ${name}`);
  let reply: { text: string };
  try {
    reply = await gateway.chat(prepared.sessionKey, planPrompt(name, purpose, teamMode, catalog), 180_000);
  } catch (error: any) {
    throw new WorkspacePlanError(`Julie could not complete the plan: ${error?.message ?? "gateway error"}`, 502, {
      julieSessionId: prepared.sessionId,
    });
  }
  let plan: WorkspacePlan;
  try {
    plan = parsePlanReply(reply.text);
  } catch (error) {
    throw new WorkspacePlanError(error instanceof Error ? error.message : "Julie's plan could not be read", 502, {
      julieSessionId: prepared.sessionId,
    });
  }
  const warnings = validatePlanAgainstCatalog(plan, teamMode, catalog);
  const token = crypto.randomUUID();
  db.prepare(`
    INSERT INTO workspace_plans (token, workspace_name, purpose, team_mode, julie_session_id, plan_json, catalog_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(token, name, purpose, teamMode, prepared.sessionId, JSON.stringify(plan), JSON.stringify(catalog));
  return {
    ok: true as const,
    source: "gateway+local" as const,
    planToken: token,
    status: "planned" as const,
    name,
    purpose,
    teamMode,
    plan,
    catalog: {
      agents: catalog.agents,
      models: catalog.models,
      existingWorkspaces: catalog.existingWorkspaces,
    },
    julie: { sessionId: prepared.sessionId, title: prepared.title },
    warnings,
    policy: "Nothing has been created. Apply this reviewed plan to create the workspace, team, and setup tasks.",
  };
}

function uniqueName(base: string, existing: Set<string>): string {
  let candidate = base;
  let index = 2;
  while (existing.has(candidate.toLowerCase())) {
    candidate = `${base} ${index}`;
    index += 1;
  }
  existing.add(candidate.toLowerCase());
  return candidate.slice(0, 100);
}

async function createSetupTask(workspaceId: number, title: string, description: string, assignedAgentId: string): Promise<number> {
  const info = db.transaction(() => {
    const created = db.prepare("INSERT INTO tasks (workspace_id, title, description, status, priority, assigned_agent_id) VALUES (?, ?, ?, 'ready', 1, ?)")
      .run(workspaceId, title.slice(0, 500), description.slice(0, 5000), assignedAgentId);
    const taskId = Number(created.lastInsertRowid);
    db.prepare("INSERT INTO task_activity (task_id, actor_type, actor_id, event_type, details) VALUES (?, 'owner', 'owner', 'created', ?)")
      .run(taskId, "Created from a confirmed Julie workspace plan");
    if (assignedAgentId) {
      db.prepare("INSERT INTO task_activity (task_id, actor_type, actor_id, event_type, details) VALUES (?, 'owner', 'owner', 'assigned', ?)")
        .run(taskId, `Assigned to ${assignedAgentId}`);
    }
    return taskId;
  })();
  return info;
}

export async function applyWorkspacePlan(token: string, confirmed: boolean) {
  if (!confirmed) throw new WorkspacePlanError("workspace plan confirmation required");
  const row = db.prepare("SELECT * FROM workspace_plans WHERE token = ?").get(token) as
    | { token: string; workspace_name: string; purpose: string; team_mode: TeamMode; status: string; julie_session_id: string; plan_json: string; catalog_json: string; result_json: string | null }
    | undefined;
  if (!row) throw new WorkspacePlanError("workspace plan not found", 404);
  if (row.status !== "planned") throw new WorkspacePlanError("this workspace plan was already applied", 409);
  const plan = JSON.parse(row.plan_json) as WorkspacePlan;
  const catalog = JSON.parse(row.catalog_json) as PlanCatalog;

  let workspaceId: number;
  try {
    const created = db.transaction(() => {
      const info = db.prepare("INSERT INTO workspaces (name, description) VALUES (?, ?)").run(row.workspace_name, row.purpose);
      return Number(info.lastInsertRowid);
    })();
    workspaceId = created;
  } catch (error: any) {
    throw new WorkspacePlanError(error?.message?.includes("UNIQUE") ? "a workspace with this name already exists" : "could not create workspace", error?.message?.includes("UNIQUE") ? 409 : 500);
  }

  const warnings: string[] = [];
  const createdAgents: Array<{ agentId: string; name: string; role: string }> = [];
  const assignedAgentIds: string[] = [];
  let leadAgentId = "main";

  if (row.team_mode === "shared") {
    const live = await gateway.getAgentRoster().catch(() => null);
    const liveIds = live ? new Set(live.agents.map((agent) => agent.id)) : new Set(catalog.agents.map((agent) => agent.agentId));
    for (const agent of plan.recommendedAgents) {
      if (liveIds.has(agent.agentId) && !assignedAgentIds.includes(agent.agentId)) assignedAgentIds.push(agent.agentId);
    }
    if (!assignedAgentIds.includes("main")) assignedAgentIds.unshift("main");
    if (assignedAgentIds.length < 2) warnings.push("Only Julie was valid in the shared team; add more agents from the workspace assignment view.");
    const profileMap = getAgentProfileMap();
    leadAgentId = assignedAgentIds.find((agentId) => profileMap.get(agentId)?.orgLevel === "lead")
      ?? assignedAgentIds.find((agentId) => agentId !== "main")
      ?? "main";
    db.transaction(() => {
      const insert = db.prepare("INSERT OR IGNORE INTO workspace_agents (workspace_id, agent_id) VALUES (?, ?)");
      for (const agentId of assignedAgentIds) insert.run(workspaceId, agentId);
    })();
  } else {
    const live = await gateway.getAgentRoster().catch(() => null);
    const existingNames = new Set((live?.agents ?? []).map((agent) => (agent.identity?.name || agent.name || agent.id).toLowerCase()));
    const model = plan.model || catalog.models[0]?.id;
    if (!model) throw new WorkspacePlanError("no available model for dedicated agents", 409);
    const roleNames: string[] = [];
    for (const role of plan.newRoles) {
      const name = uniqueName(role.name, existingNames);
      try {
        const created = await createOnboardedAgent({
          confirmed: true,
          name,
          role: role.role,
          personality: role.personality || role.reason,
          emoji: role.emoji,
          model,
          scheduleMode: "manual",
          timezone: "UTC",
          workspaceId,
          requestedTools: [],
          requestedSkills: [],
        });
        const agentId = created.agent?.id;
        if (!agentId) throw new Error("Gateway did not return an agent id");
        createdAgents.push({ agentId, name, role: role.role });
        roleNames.push(agentId);
        assignedAgentIds.push(agentId);
      } catch (error: any) {
        warnings.push(`Could not create ${name}: ${error?.message ?? "unknown error"}`);
      }
    }
    if (assignedAgentIds.length === 0) {
      warnings.push("No dedicated agents were created. The workspace exists but has no team yet.");
    } else {
      leadAgentId = assignedAgentIds[0];
      const department = row.workspace_name.slice(0, 120);
      db.transaction(() => {
        for (const agentId of assignedAgentIds) {
          setAgentWorkspaceAssignments(agentId, [workspaceId]);
          db.prepare(`UPDATE agent_profiles SET human_name = ?, role = ?, department = ?, reports_to = ?, org_level = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE agent_id = ?`)
            .run(
              createdAgents.find((agent) => agent.agentId === agentId)?.name ?? agentId,
              createdAgents.find((agent) => agent.agentId === agentId)?.role ?? "Specialist",
              department,
              agentId === leadAgentId ? "main" : leadAgentId,
              agentId === leadAgentId ? "lead" : "specialist",
              agentId,
            );
        }
      })();
      // Ensure the workspace row remains the primary hint for each created agent.
      for (const agentId of assignedAgentIds) setAgentWorkspaceAssignments(agentId, [workspaceId]);
    }
  }

  const setupDescription = [
    plan.summary,
    "",
    `Environment: ${plan.environment.runtime || "not specified"}`,
    `Project directory: ${plan.environment.projectDirectory || "not specified"}`,
    "",
    "Setup steps:",
    ...(plan.environment.setupSteps.length ? plan.environment.setupSteps.map((step, index) => `${index + 1}. ${step}`) : ["No setup steps proposed."]),
    "",
    "Operating rules:",
    ...(plan.operatingRules.length ? plan.operatingRules.map((rule) => `- ${rule}`) : ["No additional rules."]),
    "",
    "Acceptance checks:",
    ...(plan.acceptanceChecks.length ? plan.acceptanceChecks.map((check) => `- ${check}`) : ["No acceptance checks proposed."]),
    "",
    `Julie plan session: ${row.julie_session_id}`,
  ].join("\n");
  const setupTaskId = await createSetupTask(
    workspaceId,
    `Set up ${row.workspace_name} workspace environment`,
    setupDescription,
    leadAgentId,
  );

  let rooms: Awaited<ReturnType<typeof ensureDepartmentTeamRooms>>["rooms"] = [];
  try {
    const roomResult = await ensureDepartmentTeamRooms(workspaceId, true);
    rooms = roomResult.rooms;
  } catch (error: any) {
    warnings.push(`Team rooms were not created: ${error?.message ?? "gateway error"}`);
  }

  const result = {
    ok: true as const,
    source: "gateway+local" as const,
    planToken: token,
    status: "applied" as const,
    appliedAt: new Date().toISOString(),
    workspace: db.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId),
    teamMode: row.team_mode,
    julie: { sessionId: row.julie_session_id },
    assignedAgentIds,
    createdAgents,
    setupTaskId,
    rooms: rooms.map((room) => ({ id: room.id, title: room.title, kind: room.kind, members: room.members.length })),
    warnings,
  };
  db.prepare("UPDATE workspace_plans SET status = 'applied', result_json = ?, applied_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token = ?")
    .run(JSON.stringify(result), token);
  return result;
}

export async function getWorkspacePlan(token: string) {
  const row = db.prepare("SELECT token, workspace_name, purpose, team_mode, status, julie_session_id, plan_json, catalog_json, result_json, created_at, applied_at FROM workspace_plans WHERE token = ?").get(token) as any;
  if (!row) throw new WorkspacePlanError("workspace plan not found", 404);
  return {
    ok: true as const,
    source: "gateway+local" as const,
    planToken: row.token,
    name: row.workspace_name,
    purpose: row.purpose,
    teamMode: row.team_mode,
    status: row.status,
    plan: JSON.parse(row.plan_json) as WorkspacePlan,
    catalog: JSON.parse(row.catalog_json) as PlanCatalog,
    julie: { sessionId: row.julie_session_id },
    result: row.result_json ? JSON.parse(row.result_json) : null,
    createdAt: row.created_at,
    appliedAt: row.applied_at,
  };
}
