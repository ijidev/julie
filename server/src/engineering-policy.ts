import { db } from "./db.js";
import { gateway } from "./gateway.js";
import { getAgentProfile } from "./agent-profiles.js";
import { config } from "./config.js";

export const OPENCODE_PRIMARY_MODEL = "agentrouter/gpt-5.6-sol";
export const OPENCODE_FALLBACK_MODEL = "nvidia/z-ai/glm-5.3-flash";
export const ENGINEERING_DEPARTMENT = "Product & Technology";

const CONTEXT_START = "<!-- JULIE-ENGINEERING-CONTEXT:START -->";
const CONTEXT_END = "<!-- JULIE-ENGINEERING-CONTEXT:END -->";

export function isEngineeringAgent(agentId: string): boolean {
  return getAgentProfile(agentId)?.department === ENGINEERING_DEPARTMENT;
}

function directReports(agentId: string): Array<{ agentId: string; role: string }> {
  return db.prepare(`
    SELECT agent_id AS agentId, role
    FROM agent_profiles
    WHERE reports_to = ?
    ORDER BY agent_id
  `).all(agentId) as Array<{ agentId: string; role: string }>;
}

function policyText(agentId: string, toolIds: string[] | null): string {
  const profile = getAgentProfile(agentId);
  if (!profile) return "";
  const reports = directReports(agentId);
  const relevant = toolIds?.filter((id) => [
    "ls", "read", "write", "edit", "apply_patch", "exec", "process",
    "sessions", "sessions_list", "sessions_history", "sessions_send",
    "sessions_spawn", "agents_list", "skills_search", "skills_read",
  ].includes(id)) ?? [];
  const lines = [
    CONTEXT_START,
    `Julie office identity and execution context for ${profile.humanName || agentId} (${agentId}):`,
    `- Your human name is ${profile.humanName || "not configured"}. Your canonical agent ID remains ${agentId}.`,
    `- Role: ${profile.role}; department: ${profile.department}; reports to: ${profile.reportsTo}.`,
    reports.length > 0
      ? `- Direct reports: ${reports.map((row) => `${row.agentId} (${row.role})`).join(", ")}. You are expected to know this roster and inspect current capabilities before delegation.`
      : `- You are a specialist. Return evidence to ${profile.reportsTo}; do not create same-agent children unless the owner-approved task explicitly requires that topology.`,
  ];
  if (profile.department === ENGINEERING_DEPARTMENT) lines.push(
    relevant.length > 0
      ? `- Current relevant OpenClaw catalog entries visible to you: ${relevant.join(", ")}. Catalog visibility is not proof that one call is authorized or healthy.`
      : `- Current relevant OpenClaw tool catalog could not be read. Report it as unavailable instead of claiming no access.`,
    `- OpenCode V2 is the default coding runtime. For Julie repository implementation, run from ${config.root} with primary model ${OPENCODE_PRIMARY_MODEL}.`,
    `- If and only if the primary fails before changes because it is unavailable or out of credit, retry once with ${OPENCODE_FALLBACK_MODEL} and disclose the fallback.`,
    `- Use a named OpenCode session and continue it for follow-up. Do not use sessions_spawn to perform normal coding or to rediscover one configuration fact.`,
    `- Use named durable OpenClaw conversations for lead/specialist communication. A spawn acknowledgment is not a completed response.`,
  );
  lines.push(CONTEXT_END);
  return lines.join("\n");
}

export function engineeringTaskPolicy(agentId: string): string {
  return policyText(agentId, null);
}

const toolsCache = new Map<string, { value: string[] | null; expires: number }>();
const TOOLS_TTL_MS = 60_000;

export async function engineeringRuntimeContext(agentId: string): Promise<string> {
  const profile = getAgentProfile(agentId);
  if (!profile) return "";
  let toolIds: string[] | null = null;
  if (profile.department === ENGINEERING_DEPARTMENT) {
    const cached = toolsCache.get(agentId);
    if (cached && cached.expires > Date.now()) {
      toolIds = cached.value;
    } else {
      try {
        toolIds = (await gateway.listTools(agentId)).map((tool) => tool.id);
      } catch {
        toolIds = null;
      }
      toolsCache.set(agentId, { value: toolIds, expires: Date.now() + TOOLS_TTL_MS });
    }
  }
  return policyText(agentId, toolIds);
}

export function wrapEngineeringOwnerMessage(context: string, message: string): string {
  return context ? `${context}\n\nOwner message:\n${message}` : message;
}

export function stripEngineeringRuntimeContext(value: string): string {
  if (!value.includes(CONTEXT_START)) return value;
  return value
    .replace(new RegExp(`${CONTEXT_START}[\\s\\S]*?${CONTEXT_END}\\s*`, "g"), "")
    .replace(/^Owner message:\s*/i, "");
}
