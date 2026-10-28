import { db } from "./db.js";
import { gateway } from "./gateway.js";
import { getAgentProfileMap, getAgentWorkspaceAssignmentMap } from "./agent-profiles.js";
import { invalidateAgentOverview } from "./agent-overview.js";
import { invalidateAgentDetail } from "./agent-detail.js";

export class AgentAssignmentInputError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AgentAssignmentInputError";
    this.status = status;
  }
}

function modelName(model: unknown): string | null {
  if (typeof model === "string") return model;
  if (model && typeof model === "object" && typeof (model as any).primary === "string") return (model as any).primary;
  return null;
}

export async function getWorkspaceAgentAssignments(workspaceId: number) {
  const workspace = db.prepare("SELECT id, name, description FROM workspaces WHERE id = ?").get(workspaceId) as { id: number; name: string; description: string } | undefined;
  if (!workspace) throw new AgentAssignmentInputError("workspace not found", 404);
  const roster = await gateway.getAgentRoster();
  const assignments = getAgentWorkspaceAssignmentMap();
  const profiles = getAgentProfileMap();
  const agents = roster.agents.map((agent) => {
    const rows = assignments.get(agent.id) ?? [];
    const profile = profiles.get(agent.id);
    return {
      id: agent.id,
      displayName: agent.identity?.name ?? agent.name ?? agent.id,
      emoji: agent.identity?.emoji ?? null,
      model: modelName(agent.model),
      role: profile?.role || null,
      assigned: rows.some((row) => row.id === workspaceId),
      assignments: rows,
      shared: rows.length > 1,
      isDefault: roster.defaultId === agent.id,
    };
  });
  return {
    ok: true,
    source: "gateway+local",
    workspace,
    agents,
    summary: {
      assigned: agents.filter((agent) => agent.assigned).length,
      unassigned: agents.filter((agent) => agent.assignments.length === 0).length,
      shared: agents.filter((agent) => agent.shared).length,
      gatewayRosterTotal: agents.length,
    },
  };
}

export async function replaceWorkspaceAgentAssignments(workspaceId: number, rawAgentIds: unknown) {
  const workspace = db.prepare("SELECT id, name FROM workspaces WHERE id = ?").get(workspaceId) as { id: number; name: string } | undefined;
  if (!workspace) throw new AgentAssignmentInputError("workspace not found", 404);
  const agentIds = Array.isArray(rawAgentIds)
    ? [...new Set(rawAgentIds.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))]
    : [];
  const roster = await gateway.getAgentRoster();
  const validIds = new Set(roster.agents.map((agent) => agent.id));
  if (agentIds.some((id) => !validIds.has(id))) throw new AgentAssignmentInputError("one or more agents are not in the live Gateway roster");

  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM workspace_agents WHERE workspace_id = ?").run(workspaceId);
    const insert = db.prepare("INSERT INTO workspace_agents (workspace_id, agent_id) VALUES (?, ?)");
    for (const agentId of agentIds) insert.run(workspaceId, agentId);

    // Keep the legacy primary assignment hint synchronized without defining
    // membership: workspace_agents remains authoritative and may contain many.
    const profileRows = db.prepare("SELECT agent_id FROM agent_profiles").all() as Array<{ agent_id: string }>;
    const firstAssignment = db.prepare("SELECT workspace_id FROM workspace_agents WHERE agent_id = ? ORDER BY assigned_at, workspace_id LIMIT 1");
    const updateProfile = db.prepare("UPDATE agent_profiles SET workspace_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE agent_id = ?");
    for (const row of profileRows) {
      const first = firstAssignment.get(row.agent_id) as { workspace_id: number } | undefined;
      updateProfile.run(first?.workspace_id ?? null, row.agent_id);
    }
  });
  transaction();

  for (const agentId of roster.agents.map((agent) => agent.id)) invalidateAgentDetail(agentId);
  invalidateAgentOverview();
  db.prepare("INSERT INTO audit_logs (command, exit_code, duration_ms) VALUES (?, 0, 0)")
    .run(`workspace.agents.update:${workspaceId}:${agentIds.length}`);
  return getWorkspaceAgentAssignments(workspaceId);
}
