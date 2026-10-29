import { db, getSetting } from "./db.js";
import { gateway } from "./gateway.js";
import {
  getAgentProfileMap,
  getWorkspaceAgentIds,
  replaceAgentOrganization,
  type AgentOrganizationInput,
} from "./agent-profiles.js";
import { invalidateAgentDetail } from "./agent-detail.js";
import { invalidateAgentOverview } from "./agent-overview.js";

export class AgentOrganizationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AgentOrganizationError";
    this.status = status;
  }
}

function cleanText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw new AgentOrganizationError(`${label} required`);
  return value.trim().slice(0, max);
}

function modelName(model: unknown): string | null {
  if (typeof model === "string") return model;
  if (model && typeof model === "object" && typeof (model as any).primary === "string") return (model as any).primary;
  return null;
}

export async function getAgentOrganization(workspaceId: number) {
  const workspace = db.prepare("SELECT id, name, description FROM workspaces WHERE id = ?").get(workspaceId) as { id: number; name: string; description: string } | undefined;
  if (!workspace) throw new AgentOrganizationError("workspace not found", 404);

  const roster = await gateway.getAgentRoster();
  const assignedIds = new Set(getWorkspaceAgentIds(workspaceId));
  const profiles = getAgentProfileMap();
  const members = roster.agents
    .filter((agent) => assignedIds.has(agent.id))
    .map((agent) => {
      const profile = profiles.get(agent.id);
      const configured = Boolean(profile?.role && profile?.department && profile?.reportsTo && profile?.orgLevel);
      return {
        agentId: agent.id,
        displayName: agent.identity?.name ?? agent.name ?? agent.id,
        emoji: agent.identity?.emoji ?? null,
        model: modelName(agent.model),
        role: profile?.role || null,
        department: profile?.department || null,
        reportsTo: profile?.reportsTo || null,
        level: profile?.orgLevel ?? null,
        configured,
        isDefault: roster.defaultId === agent.id,
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  const configured = members.filter((member) => member.configured);
  const departments = new Set(configured.filter((member) => member.level !== "executive").map((member) => member.department));
  return {
    ok: true as const,
    source: "gateway+local" as const,
    workspace,
    owner: {
      id: "owner" as const,
      displayName: getSetting("owner_display_name") || "You",
      role: "CEO" as const,
    },
    members,
    summary: {
      rosterMembers: members.length,
      configured: configured.length,
      unconfigured: members.length - configured.length,
      departments: departments.size,
      leads: configured.filter((member) => member.level === "lead").length,
      specialists: configured.filter((member) => member.level === "specialist").length,
      complete: members.length > 0 && configured.length === members.length,
    },
  };
}

function parseOrganizationMembers(raw: unknown, expectedIds: Set<string>): AgentOrganizationInput[] {
  if (!Array.isArray(raw)) throw new AgentOrganizationError("members array required");
  const entries: AgentOrganizationInput[] = raw.map((value, index) => {
    if (!value || typeof value !== "object") throw new AgentOrganizationError(`member ${index + 1} must be an object`);
    const row = value as Record<string, unknown>;
    const agentId = cleanText(row.agentId, `member ${index + 1} agentId`, 128);
    if (!expectedIds.has(agentId)) throw new AgentOrganizationError(`agent ${agentId} is not assigned to this workspace`, 409);
    const orgLevel = row.level;
    if (orgLevel !== "executive" && orgLevel !== "lead" && orgLevel !== "specialist") {
      throw new AgentOrganizationError(`member ${agentId} has an invalid level`);
    }
    return {
      agentId,
      role: cleanText(row.role, `member ${agentId} role`, 240),
      department: cleanText(row.department, `member ${agentId} department`, 120),
      reportsTo: cleanText(row.reportsTo, `member ${agentId} reportsTo`, 128),
      orgLevel,
    };
  });

  const ids = new Set(entries.map((entry) => entry.agentId));
  if (ids.size !== entries.length) throw new AgentOrganizationError("organization contains duplicate agents");
  const missing = [...expectedIds].filter((id) => !ids.has(id));
  const extra = [...ids].filter((id) => !expectedIds.has(id));
  if (missing.length || extra.length) {
    throw new AgentOrganizationError(`organization must include every workspace agent (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"})`, 409);
  }

  const executives = entries.filter((entry) => entry.orgLevel === "executive");
  if (executives.length !== 1 || executives[0].agentId !== "main" || executives[0].reportsTo !== "owner") {
    throw new AgentOrganizationError("main must be the sole executive and report to owner");
  }
  const leads = new Map(entries.filter((entry) => entry.orgLevel === "lead").map((entry) => [entry.agentId, entry]));
  const departmentLeadCount = new Map<string, number>();
  for (const entry of entries) {
    if (entry.agentId === entry.reportsTo) throw new AgentOrganizationError(`${entry.agentId} cannot report to itself`);
    if (entry.orgLevel === "lead") {
      if (entry.reportsTo !== "main") throw new AgentOrganizationError(`department lead ${entry.agentId} must report to main`);
      departmentLeadCount.set(entry.department, (departmentLeadCount.get(entry.department) ?? 0) + 1);
    }
    if (entry.orgLevel === "specialist") {
      const lead = leads.get(entry.reportsTo);
      if (!lead) throw new AgentOrganizationError(`specialist ${entry.agentId} must report to a configured department lead`);
      if (lead.department !== entry.department) throw new AgentOrganizationError(`specialist ${entry.agentId} must share its lead's department`);
    }
  }
  for (const [department, count] of departmentLeadCount) {
    if (count !== 1) throw new AgentOrganizationError(`${department} must have exactly one department lead`);
  }
  const specialistDepartments = new Set(entries.filter((entry) => entry.orgLevel === "specialist").map((entry) => entry.department));
  for (const department of specialistDepartments) {
    if ((departmentLeadCount.get(department) ?? 0) !== 1) throw new AgentOrganizationError(`${department} specialists require exactly one lead`);
  }
  return entries;
}

export async function configureAgentOrganization(workspaceId: number, rawMembers: unknown, confirmed: boolean) {
  if (!confirmed) throw new AgentOrganizationError("organization confirmation required");
  const workspace = db.prepare("SELECT id FROM workspaces WHERE id = ?").get(workspaceId);
  if (!workspace) throw new AgentOrganizationError("workspace not found", 404);
  const roster = await gateway.getAgentRoster();
  const liveIds = new Set(roster.agents.map((agent) => agent.id));
  const expectedIds = new Set(getWorkspaceAgentIds(workspaceId).filter((id) => liveIds.has(id)));
  if (!expectedIds.has("main")) throw new AgentOrganizationError("main must be assigned to this workspace", 409);
  const entries = parseOrganizationMembers(rawMembers, expectedIds);
  replaceAgentOrganization(entries);
  for (const entry of entries) invalidateAgentDetail(entry.agentId);
  invalidateAgentOverview();
  db.prepare("INSERT INTO audit_logs (command, exit_code, duration_ms) VALUES (?, 0, 0)")
    .run(`agent.organization.replace:${workspaceId}:${entries.length}`);
  return getAgentOrganization(workspaceId);
}
