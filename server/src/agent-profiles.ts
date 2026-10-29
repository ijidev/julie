import { db } from "./db.js";

export type AgentProfile = {
  agentId: string;
  role: string;
  personality: string;
  scheduleMode: "always_available" | "weekdays" | "manual";
  timezone: string;
  workspaceId: number | null;
  workspaceName: string | null;
  workspaceAssignments: Array<{ id: number; name: string }>;
  department: string;
  reportsTo: string;
  orgLevel: "executive" | "lead" | "specialist" | null;
  requestedTools: string[];
  requestedSkills: string[];
  createdAt: string;
  updatedAt: string;
};

type AgentProfileRow = {
  agent_id: string;
  role: string;
  personality: string;
  schedule_mode: AgentProfile["scheduleMode"];
  timezone: string;
  workspace_id: number | null;
  workspace_name: string | null;
  department: string;
  reports_to: string;
  org_level: string;
  requested_tools: string;
  requested_skills: string;
  created_at: string;
  updated_at: string;
};

function stringArray(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function getAgentWorkspaceAssignmentMap(): Map<string, Array<{ id: number; name: string }>> {
  const rows = db.prepare(`
    SELECT wa.agent_id, w.id, w.name
    FROM workspace_agents wa
    JOIN workspaces w ON w.id = wa.workspace_id
    ORDER BY w.name
  `).all() as Array<{ agent_id: string; id: number; name: string }>;
  const result = new Map<string, Array<{ id: number; name: string }>>();
  for (const row of rows) {
    const list = result.get(row.agent_id) ?? [];
    list.push({ id: row.id, name: row.name });
    result.set(row.agent_id, list);
  }
  return result;
}

function mapRow(row: AgentProfileRow, assignments: Array<{ id: number; name: string }> = []): AgentProfile {
  const orgLevel = row.org_level === "executive" || row.org_level === "lead" || row.org_level === "specialist"
    ? row.org_level
    : null;
  return {
    agentId: row.agent_id,
    role: row.role,
    personality: row.personality,
    scheduleMode: row.schedule_mode,
    timezone: row.timezone,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    workspaceAssignments: assignments,
    department: row.department,
    reportsTo: row.reports_to,
    orgLevel,
    requestedTools: stringArray(row.requested_tools),
    requestedSkills: stringArray(row.requested_skills),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_PROFILE = `
  SELECT p.*, w.name AS workspace_name
  FROM agent_profiles p
  LEFT JOIN workspaces w ON w.id = p.workspace_id
`;

export function getAgentProfile(agentId: string): AgentProfile | null {
  const row = db.prepare(`${SELECT_PROFILE} WHERE p.agent_id = ?`).get(agentId) as AgentProfileRow | undefined;
  return row ? mapRow(row, getAgentWorkspaceAssignmentMap().get(agentId) ?? []) : null;
}

export function getAgentProfileMap(): Map<string, AgentProfile> {
  const rows = db.prepare(SELECT_PROFILE).all() as AgentProfileRow[];
  const assignments = getAgentWorkspaceAssignmentMap();
  return new Map(rows.map((row) => {
    const profile = mapRow(row, assignments.get(row.agent_id) ?? []);
    return [profile.agentId, profile];
  }));
}

export function setAgentWorkspaceAssignments(agentId: string, workspaceIds: number[]): void {
  const ids = [...new Set(workspaceIds)].filter((id) => Number.isInteger(id));
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM workspace_agents WHERE agent_id = ?").run(agentId);
    const insert = db.prepare("INSERT INTO workspace_agents (workspace_id, agent_id) VALUES (?, ?)");
    for (const id of ids) insert.run(id, agentId);
    db.prepare("UPDATE agent_profiles SET workspace_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE agent_id = ?")
      .run(ids[0] ?? null, agentId);
  });
  transaction();
}

export function isAgentAssignedToWorkspace(agentId: string, workspaceId: number): boolean {
  return Boolean(db.prepare("SELECT 1 FROM workspace_agents WHERE agent_id = ? AND workspace_id = ?").get(agentId, workspaceId));
}

export function getAgentWorkspaceAssignments(agentId: string): Array<{ id: number; name: string }> {
  return getAgentWorkspaceAssignmentMap().get(agentId) ?? [];
}

export function getWorkspaceAgentIds(workspaceId: number): string[] {
  return (db.prepare("SELECT agent_id FROM workspace_agents WHERE workspace_id = ? ORDER BY agent_id").all(workspaceId) as Array<{ agent_id: string }>).map((row) => row.agent_id);
}

export function saveAgentProfile(input: {
  agentId: string;
  role: string;
  personality: string;
  scheduleMode: AgentProfile["scheduleMode"];
  timezone: string;
  workspaceId: number | null;
  requestedTools: string[];
  requestedSkills: string[];
}): AgentProfile {
  db.prepare(`
    INSERT INTO agent_profiles (
      agent_id, role, personality, schedule_mode, timezone, workspace_id,
      requested_tools, requested_skills
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(agent_id) DO UPDATE SET
      role = excluded.role,
      personality = excluded.personality,
      schedule_mode = excluded.schedule_mode,
      timezone = excluded.timezone,
      workspace_id = excluded.workspace_id,
      requested_tools = excluded.requested_tools,
      requested_skills = excluded.requested_skills,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `).run(
    input.agentId,
    input.role,
    input.personality,
    input.scheduleMode,
    input.timezone,
    input.workspaceId,
    JSON.stringify(input.requestedTools),
    JSON.stringify(input.requestedSkills),
  );
  return getAgentProfile(input.agentId)!;
}

export function deleteAgentProfile(agentId: string): void {
  db.prepare("DELETE FROM agent_profiles WHERE agent_id = ?").run(agentId);
}

export type AgentOrganizationInput = {
  agentId: string;
  role: string;
  department: string;
  reportsTo: string;
  orgLevel: "executive" | "lead" | "specialist";
};

export function replaceAgentOrganization(entries: AgentOrganizationInput[]): void {
  const transaction = db.transaction(() => {
    // The reviewed payload is authoritative. Clear stale reporting metadata for
    // profiles omitted from a future roster before applying the current tree;
    // role/personality and workspace membership remain untouched.
    db.prepare("UPDATE agent_profiles SET department = '', reports_to = '', org_level = '', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')").run();
    const upsert = db.prepare(`
      INSERT INTO agent_profiles (agent_id, role, department, reports_to, org_level)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(agent_id) DO UPDATE SET
        role = excluded.role,
        department = excluded.department,
        reports_to = excluded.reports_to,
        org_level = excluded.org_level,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    `);
    for (const entry of entries) {
      upsert.run(entry.agentId, entry.role, entry.department, entry.reportsTo, entry.orgLevel);
    }
  });
  transaction();
}
