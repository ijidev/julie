import { db } from "./db.js";
import { gateway, type GatewayAgent } from "./gateway.js";
import { saveAgentProfile, setAgentWorkspaceAssignments, type AgentProfile } from "./agent-profiles.js";
import { invalidateAgentDetail } from "./agent-detail.js";
import { invalidateAgentOverview } from "./agent-overview.js";

export class AgentOnboardingInputError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AgentOnboardingInputError";
    this.status = status;
  }
}

const ROLES = [
  { id: "coordinator", label: "Coordinator", description: "Coordinate specialists and keep work accountable." },
  { id: "researcher", label: "Researcher", description: "Gather evidence and return cited findings." },
  { id: "writer", label: "Writer", description: "Turn briefs and source material into usable drafts." },
  { id: "reviewer", label: "Reviewer", description: "Check work against requirements and report actionable issues." },
  { id: "developer", label: "Developer", description: "Build, test, and maintain software projects." },
  { id: "operations", label: "Operations", description: "Operate systems, schedules, and reliable delivery." },
  { id: "custom", label: "Custom", description: "Use an owner-defined role title and personality." },
] as const;

const SCHEDULES = [
  { id: "always_available", label: "Always available", description: "No Julie duty-window restriction is recorded." },
  { id: "weekdays", label: "Weekdays", description: "Planned weekday duty window; enforcement is a later automation task." },
  { id: "manual", label: "Manual", description: "The owner explicitly starts work; no duty schedule is inferred." },
] as const;

function cleanLine(value: string, max: number): string {
  return value.replace(/[\r\n\0]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function modelRef(agent: GatewayAgent | undefined): string | null {
  if (typeof agent?.model === "string") return agent.model;
  return typeof agent?.model?.primary === "string" ? agent.model.primary : null;
}

function missingSkillReason(skill: any): string | null {
  if (skill?.eligible === true) return null;
  const missing = skill?.missing && typeof skill.missing === "object" ? skill.missing : {};
  const parts: string[] = [];
  if (Array.isArray(missing.bins) && missing.bins.length) parts.push(`Missing ${missing.bins.length} command requirement${missing.bins.length === 1 ? "" : "s"}`);
  if (Array.isArray(missing.env) && missing.env.length) parts.push(`Missing ${missing.env.length} environment requirement${missing.env.length === 1 ? "" : "s"}`);
  if (Array.isArray(missing.config) && missing.config.length) parts.push(`Missing ${missing.config.length} configuration requirement${missing.config.length === 1 ? "" : "s"}`);
  if (Array.isArray(missing.os) && missing.os.length) parts.push(`Requires ${missing.os.join(" or ")}`);
  if (skill?.disabled === true) parts.push("Disabled");
  return parts.join(" · ") || "Requirements not met";
}

async function buildOptions() {
  const roster = await gateway.getAgentRoster();
  const sourceAgentId = roster.defaultId ?? roster.agents[0]?.id;
  if (!sourceAgentId) throw new Error("Gateway has no agent context for capability discovery");
  const [modelResult, toolResult, skillResult] = await Promise.all([
    gateway.listModels(),
    gateway.listTools(sourceAgentId),
    gateway.listSkills(sourceAgentId),
  ]);
  const models = (Array.isArray(modelResult?.models) ? modelResult.models : [])
    .filter((row: any) => typeof row?.provider === "string" && typeof row?.id === "string")
    .map((row: any) => ({
      id: `${row.provider}/${row.id}`,
      provider: String(row.provider).slice(0, 120),
      modelId: String(row.id).slice(0, 300),
      name: typeof row.name === "string" ? row.name.slice(0, 300) : String(row.id).slice(0, 300),
      available: row.available === true,
      reasoning: row.reasoning === true,
      contextWindow: typeof row.contextWindow === "number" && Number.isFinite(row.contextWindow) ? row.contextWindow : null,
      input: Array.isArray(row.input) ? row.input.filter((item: unknown): item is string => typeof item === "string").slice(0, 10) : [],
    }));
  const skills = (Array.isArray(skillResult?.skills) ? skillResult.skills : []).map((skill: any) => ({
    id: typeof skill.skillKey === "string" ? skill.skillKey : String(skill.name ?? "unknown"),
    name: String(skill.name ?? "Unnamed skill").slice(0, 200),
    description: typeof skill.description === "string" ? skill.description.slice(0, 700) : null,
    emoji: typeof skill.emoji === "string" ? skill.emoji.slice(0, 20) : null,
    eligible: skill.eligible === true,
    reason: missingSkillReason(skill),
  }));
  const workspaces = db.prepare("SELECT id, name, description FROM workspaces ORDER BY name").all();
  return {
    ok: true,
    source: "gateway+local",
    generatedAt: new Date().toISOString(),
    creationSupported: true,
    gatewayAppliedFields: ["name", "model", "emoji", "SOUL.md"],
    julieManagedFields: ["role", "personality", "schedule", "workspace assignment", "tool requests", "skill requests"],
    policyNote: "Tool and skill selections are onboarding requests. agents.create does not change Gateway tool/skill policy.",
    existingAgentIds: roster.agents.map((agent) => agent.id),
    defaultModel: modelRef(roster.agents.find((agent) => agent.id === roster.defaultId) ?? roster.agents[0]),
    roles: ROLES,
    schedules: SCHEDULES,
    models,
    tools: toolResult.map((tool) => ({ id: tool.id, name: tool.name ?? tool.id, description: tool.description ?? null, group: tool.group ?? null })),
    skills,
    workspaces,
  };
}

let optionsCache: { expiresAt: number; value: Awaited<ReturnType<typeof buildOptions>> } | null = null;

export async function getAgentOnboardingOptions(force = false) {
  if (!force && optionsCache && optionsCache.expiresAt > Date.now()) return optionsCache.value;
  const value = await buildOptions();
  optionsCache = { expiresAt: Date.now() + 60_000, value };
  return value;
}

function selectedStrings(value: unknown, max = 30): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, max);
}

function validateTimeZone(value: string): string {
  const timezone = cleanLine(value || "UTC", 100) || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return timezone;
  } catch {
    throw new AgentOnboardingInputError("valid IANA timezone required");
  }
}

function buildSoul(name: string, role: string, personality: string, schedule: string, timezone: string): string {
  const purpose = personality || `Work as ${role} with clear, evidence-based communication.`;
  return `# SOUL.md — ${name}\n\n## Role context\n\nYou are ${name}, serving as ${role} in Julie AiOS.\n\n## Personality and working style\n\n${purpose}\n\n## Operating principles\n\n- Be honest about evidence, uncertainty, tool state, and completion.\n- Protect owner data, credentials, and private workspace context.\n- Ask for input when a consequential choice is ambiguous.\n- Report real results; never fabricate status, metrics, or successful execution.\n\n## Duty context\n\nJulie schedule preference: ${schedule}. Timezone: ${timezone}. This is owner context, not autonomous authority to run.\n\n## Boundaries\n\nTool and skill access remains controlled by OpenClaw policy. Onboarding requests do not grant permissions.\n`;
}

export async function createOnboardedAgent(raw: any) {
  if (raw?.confirmed !== true) throw new AgentOnboardingInputError("review confirmation required");
  const name = cleanLine(typeof raw?.name === "string" ? raw.name : "", 100);
  const role = cleanLine(typeof raw?.role === "string" ? raw.role : "", 100);
  const personality = cleanLine(typeof raw?.personality === "string" ? raw.personality : "", 2000);
  const emoji = cleanLine(typeof raw?.emoji === "string" ? raw.emoji : "", 20);
  const model = cleanLine(typeof raw?.model === "string" ? raw.model : "", 400);
  const scheduleMode = cleanLine(typeof raw?.scheduleMode === "string" ? raw.scheduleMode : "manual", 40) as AgentProfile["scheduleMode"];
  const timezone = validateTimeZone(typeof raw?.timezone === "string" ? raw.timezone : "UTC");
  const workspaceId = raw?.workspaceId == null || raw.workspaceId === "" ? null : Number(raw.workspaceId);
  const requestedTools = selectedStrings(raw?.requestedTools);
  const requestedSkills = selectedStrings(raw?.requestedSkills);

  if (!name) throw new AgentOnboardingInputError("agent name required");
  if (!role) throw new AgentOnboardingInputError("role required");
  if (!SCHEDULES.some((item) => item.id === scheduleMode)) throw new AgentOnboardingInputError("valid schedule mode required");
  if (workspaceId !== null && (!Number.isInteger(workspaceId) || !db.prepare("SELECT id FROM workspaces WHERE id = ?").get(workspaceId))) {
    throw new AgentOnboardingInputError("valid Julie workspace required");
  }
  if (/(?:api[_ -]?key|access[_ -]?token|password|client[_ -]?secret)\s*[:=]/i.test(personality)) {
    throw new AgentOnboardingInputError("personality must not contain credentials");
  }

  const options = await getAgentOnboardingOptions();
  const modelOption = options.models.find((item: { id: string; available: boolean }) => item.id === model);
  if (!modelOption || !modelOption.available) throw new AgentOnboardingInputError("selected model is not available in the current Gateway catalog");
  const toolIds = new Set<string>(options.tools.map((item: { id: string }) => item.id));
  const skillMap = new Map<string, { eligible: boolean }>(options.skills.map((item: { id: string; eligible: boolean }) => [item.id, item]));
  if (requestedTools.some((id) => !toolIds.has(id))) throw new AgentOnboardingInputError("one or more tool requests are not in the current catalog");
  if (requestedSkills.some((id) => !skillMap.get(id)?.eligible)) throw new AgentOnboardingInputError("requested skills must be currently eligible");

  const started = Date.now();
  const created = await gateway.createAgent({ name, model, ...(emoji ? { emoji } : {}) });
  const agentId = typeof created?.agentId === "string" ? created.agentId : "";
  if (!agentId) throw new Error("Gateway created an agent without returning its id");
  const warnings: string[] = [];
  let profileSaved = false;
  let soulSaved = false;

  try {
    saveAgentProfile({
      agentId,
      role,
      personality,
      scheduleMode,
      timezone,
      workspaceId,
      requestedTools,
      requestedSkills,
    });
    setAgentWorkspaceAssignments(agentId, workspaceId === null ? [] : [workspaceId]);
    profileSaved = true;
  } catch {
    warnings.push("The Gateway agent was created, but Julie HR metadata could not be saved.");
  }

  try {
    const existing = await gateway.getAgentFile(agentId, "SOUL.md");
    const file = existing?.file;
    if (file?.missing === true) {
      await gateway.setAgentFile(agentId, "SOUL.md", buildSoul(name, role, personality, scheduleMode, timezone), undefined, true);
      soulSaved = true;
    } else if (typeof file?.hash === "string" && file.hash) {
      await gateway.setAgentFile(agentId, "SOUL.md", buildSoul(name, role, personality, scheduleMode, timezone), file.hash);
      soulSaved = true;
    } else {
      warnings.push("SOUL.md was not changed because the Gateway did not return a safe write precondition.");
    }
  } catch {
    warnings.push("The Gateway agent was created, but its SOUL.md onboarding profile could not be saved.");
  }

  invalidateAgentDetail(agentId);
  invalidateAgentOverview();
  optionsCache = null;
  db.prepare("INSERT INTO audit_logs (command, exit_code, duration_ms) VALUES (?, ?, ?)")
    .run(`agents.create:${agentId}`, 0, Date.now() - started);

  return {
    ok: true,
    source: "gateway+local",
    agent: {
      id: agentId,
      name: typeof created?.name === "string" ? created.name : name,
      model: typeof created?.model === "string" ? created.model : model,
    },
    applied: {
      gatewayCreated: true,
      profileSaved,
      soulSaved,
      capabilityPolicyChanged: false,
    },
    onboardingRequests: { tools: requestedTools.length, skills: requestedSkills.length },
    warnings,
  };
}
