import { gateway, type GatewayAgent } from "./gateway.js";
import { getAgentProfileMap, getAgentWorkspaceAssignmentMap, type AgentProfile } from "./agent-profiles.js";

// Julie-owned roster. Every turn gets a compact, live directory so an agent can
// resolve an owner mention like "@Victor" to the real canonical agent instead of
// guessing, inventing a person, or quietly doing the work itself.

export type AgentDirectoryEntry = {
  agentId: string;
  humanName: string;
  role: string;
  department: string;
  reportsTo: string;
  orgLevel: string;
  workspaces: string[];
  available: boolean | null;
  model: string | null;
};

function modelText(agent: GatewayAgent | undefined): string | null {
  if (!agent) return null;
  if (typeof agent.model === "string") return agent.model;
  const primary = typeof agent.model?.primary === "string" ? agent.model.primary : "";
  return primary || null;
}

export async function loadAgentDirectory(): Promise<AgentDirectoryEntry[]> {
  const profiles: Map<string, AgentProfile> = getAgentProfileMap();
  const assignments = getAgentWorkspaceAssignmentMap();
  let agents: GatewayAgent[] | null = null;
  try {
    agents = await gateway.listAgents();
  } catch {
    agents = null;
  }
  const byId = new Map((agents ?? []).map((agent) => [agent.id, agent]));
  const entries: AgentDirectoryEntry[] = [];
  for (const profile of profiles.values()) {
    const live = byId.get(profile.agentId);
    entries.push({
      agentId: profile.agentId,
      humanName: profile.humanName || profile.agentId,
      role: profile.role || "role not recorded",
      department: profile.department || "unassigned",
      reportsTo: profile.reportsTo || "owner",
      orgLevel: profile.orgLevel || "",
      workspaces: (assignments.get(profile.agentId) ?? []).map((row) => row.name),
      available: agents ? Boolean(live) : null,
      model: modelText(live),
    });
  }
  // Gateway agents without a Julie profile are still real; show them honestly
  // with unknown role rather than pretending the roster is complete.
  for (const agent of agents ?? []) {
    if (profiles.has(agent.id)) continue;
    entries.push({
      agentId: agent.id,
      humanName: agent.identity?.name?.trim() || agent.name?.trim() || agent.id,
      role: "role not recorded in Julie",
      department: "unassigned",
      reportsTo: "owner",
      orgLevel: "",
      workspaces: [],
      available: true,
      model: modelText(agent),
    });
  }
  return entries.sort((left, right) => {
    if (left.agentId === "main") return -1;
    if (right.agentId === "main") return 1;
    return left.humanName.localeCompare(right.humanName);
  });
}

export function formatAgentDirectory(entries: AgentDirectoryEntry[]): string {
  if (entries.length === 0) return "Agent directory: no agents are registered.";
  const lines = entries.map((entry) => {
    const parts = [
      `@${entry.humanName} = ${entry.agentId}`,
      `role: ${entry.role}`,
      `department: ${entry.department}`,
      `reports to: ${entry.reportsTo}`,
      `workspaces: ${entry.workspaces.length ? entry.workspaces.join("/") : "none"}`,
      entry.available === null
        ? "availability: gateway roster unavailable"
        : entry.available ? "available" : "not present in gateway roster",
      entry.model ? `model: ${entry.model}` : "",
    ].filter(Boolean);
    return `- ${parts.join(" · ")}`;
  });
  return [
    "Live agent directory (authoritative for names, IDs, and reporting lines):",
    ...lines,
    "Canonical agent IDs and Gateway identity never change when a human name does.",
  ].join("\n");
}

export async function agentDirectoryContext(): Promise<string> {
  try {
    return formatAgentDirectory(await loadAgentDirectory());
  } catch {
    return "Live agent directory unavailable in this turn. Do not invent an agent identity or claim a delegation that did not happen.";
  }
}

const MENTION = /@([A-Za-z][A-Za-z0-9._-]{1,40})/g;

export function resolveAgentMentions(text: string, entries: AgentDirectoryEntry[]): {
  matched: AgentDirectoryEntry[];
  unknown: string[];
} {
  const matched: AgentDirectoryEntry[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(MENTION)) {
    const token = match[1];
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const hit = entries.find((entry) =>
      entry.humanName.toLowerCase() === key || entry.agentId.toLowerCase() === key
    );
    if (hit) {
      if (!matched.some((row) => row.agentId === hit.agentId)) matched.push(hit);
    } else {
      unknown.push(token);
    }
  }
  return { matched, unknown };
}

export function delegationDirective(input: {
  ownerMessage: string;
  matched: AgentDirectoryEntry[];
  unknown: string[];
  dispatched: Array<{ entry: AgentDirectoryEntry; sessionId: string }>;
}): string {
  const lines = [
    "Owner delegation requirement (enforced by the Julie runtime):",
    "When the owner names an agent or uses an @mention, the named agent must do that work. Do not perform the same implementation yourself and do not answer as if you did it.",
    "Report which agent you delegated to, by human name and canonical ID, and report their actual result. If they fail or stop, say so explicitly.",
  ];
  if (input.matched.length > 0) {
    lines.push(`Owner mentions resolved to: ${input.matched.map((entry) => `@${entry.humanName} (${entry.agentId})`).join(", ")}.`);
  }
  if (input.dispatched.length > 0) {
    lines.push(
      "The Julie runtime already opened a named durable session with each mentioned agent and dispatched the owner's request:",
      ...input.dispatched.map((row) => `- ${row.entry.humanName} (${row.entry.agentId}) · session ${row.sessionId}`),
      "Do not re-dispatch the same request. In your reply, state this delegation and that the named agent owns the work; use sessions_history with those session keys if you need their current progress.",
    );
  }
  if (input.unknown.length > 0) {
    lines.push(`These mentions did not match any known agent and must not be invented: ${input.unknown.map((token) => `@${token}`).join(", ")}.`);
  }
  return lines.join("\n");
}

export function composeAgentPrompt(parts: Array<string | null | undefined>, ownerMessage: string): string {
  const context = parts.filter((part): part is string => Boolean(part && part.trim())).join("\n\n");
  return context ? `${context}\n\nOwner message:\n${ownerMessage}` : ownerMessage;
}
