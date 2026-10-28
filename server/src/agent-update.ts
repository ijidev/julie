import { db } from "./db.js";
import { gateway } from "./gateway.js";
import { getAgentOnboardingOptions } from "./agent-onboarding.js";
import { saveAgentProfile, setAgentWorkspaceAssignments, type AgentProfile } from "./agent-profiles.js";
import { invalidateAgentDetail } from "./agent-detail.js";
import { invalidateAgentOverview } from "./agent-overview.js";

export class AgentUpdateInputError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AgentUpdateInputError";
    this.status = status;
  }
}

const HR_START = "<!-- JULIE-HR:START -->";
const HR_END = "<!-- JULIE-HR:END -->";

function line(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\r\n\0]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function selectedStrings(value: unknown, max = 30): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, max);
}

function timezone(value: unknown): string {
  const result = line(value, 100) || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: result }).format();
    return result;
  } catch {
    throw new AgentUpdateInputError("valid IANA timezone required");
  }
}

function hrBlock(input: { name: string; role: string; personality: string; scheduleMode: string; timezone: string }): string {
  const personality = input.personality || `Work as ${input.role} with clear, evidence-based communication.`;
  return `${HR_START}\n## Julie HR context\n\n- **Display name:** ${input.name}\n- **Role:** ${input.role}\n- **Schedule preference:** ${input.scheduleMode}\n- **Timezone:** ${input.timezone}\n\n### Personality and working style\n\n${personality}\n\n### Julie boundaries\n\nThis HR context does not grant tools, credentials, autonomous schedules, spending, or permission bypasses. Report evidence honestly and ask the owner when consequential intent is ambiguous.\n${HR_END}`;
}

function mergeHrBlock(existing: string, block: string, name: string): string {
  const start = existing.indexOf(HR_START);
  const end = existing.indexOf(HR_END);
  if (start >= 0 && end >= start) {
    return `${existing.slice(0, start).trimEnd()}${start > 0 ? "\n\n" : ""}${block}${existing.slice(end + HR_END.length)}`.trim() + "\n";
  }
  const base = existing.trim() || `# SOUL.md — ${name}`;
  return `${base}\n\n${block}\n`;
}

export async function updateManagedAgent(agentId: string, raw: any) {
  if (raw?.confirmed !== true) throw new AgentUpdateInputError("review confirmation required");
  const roster = await gateway.getAgentRoster();
  const rosterAgent = roster.agents.find((agent) => agent.id === agentId);
  if (!rosterAgent) throw new AgentUpdateInputError("agent not found", 404);

  const name = line(raw?.name, 100);
  const role = line(raw?.role, 100);
  const personality = line(raw?.personality, 2000);
  const emoji = line(raw?.emoji, 20);
  const model = line(raw?.model, 400);
  const scheduleMode = line(raw?.scheduleMode, 40) as AgentProfile["scheduleMode"];
  const timeZone = timezone(raw?.timezone);
  const workspaceIds: number[] = Array.isArray(raw?.workspaceIds)
    ? [...new Set<number>(raw.workspaceIds.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value)))].slice(0, 50)
    : raw?.workspaceId == null || raw.workspaceId === "" ? [] : [Number(raw.workspaceId)];
  const workspaceId = workspaceIds[0] ?? null;
  const requestedTools = selectedStrings(raw?.requestedTools);
  const requestedSkills = selectedStrings(raw?.requestedSkills);
  const updateSoul = raw?.updateSoul !== false;

  if (!name) throw new AgentUpdateInputError("display name required");
  if (!role) throw new AgentUpdateInputError("role required");
  if (!["always_available", "weekdays", "manual"].includes(scheduleMode)) throw new AgentUpdateInputError("valid schedule mode required");
  if (workspaceIds.some((id) => !db.prepare("SELECT id FROM workspaces WHERE id = ?").get(id))) throw new AgentUpdateInputError("valid Julie workspaces required");
  if (/(?:api[_ -]?key|access[_ -]?token|password|client[_ -]?secret)\s*[:=]/i.test(personality)) {
    throw new AgentUpdateInputError("personality must not contain credentials");
  }

  const options = await getAgentOnboardingOptions();
  const selectedModel = options.models.find((item: { id: string; available: boolean }) => item.id === model);
  if (!selectedModel || !selectedModel.available) throw new AgentUpdateInputError("selected model is not available in the current Gateway catalog");
  const toolIds = new Set<string>(options.tools.map((item: { id: string }) => item.id));
  const skillMap = new Map<string, { eligible: boolean }>(options.skills.map((item: { id: string; eligible: boolean }) => [item.id, item]));
  if (requestedTools.some((id) => !toolIds.has(id))) throw new AgentUpdateInputError("one or more tool requests are not in the current catalog");
  if (requestedSkills.some((id) => !skillMap.get(id)?.eligible)) throw new AgentUpdateInputError("requested skills must be currently eligible");

  const started = Date.now();
  const currentModel = typeof rosterAgent.model === "string" ? rosterAgent.model : rosterAgent.model?.primary ?? "";
  const currentName = rosterAgent.identity?.name ?? rosterAgent.name ?? agentId;
  const currentEmoji = rosterAgent.identity?.emoji ?? "";
  const gatewayPatch: { agentId: string; name?: string; model?: string; emoji?: string } = { agentId };
  if (name !== currentName) gatewayPatch.name = name;
  if (model !== currentModel) gatewayPatch.model = model;
  if (emoji && emoji !== currentEmoji) gatewayPatch.emoji = emoji;
  const gatewayUpdated = Object.keys(gatewayPatch).length > 1;
  if (gatewayUpdated) await gateway.updateAgent(gatewayPatch);
  const warnings: string[] = [];
  let profileSaved = false;
  let soulSaved = false;

  try {
    saveAgentProfile({ agentId, role, personality, scheduleMode, timezone: timeZone, workspaceId, requestedTools, requestedSkills });
    setAgentWorkspaceAssignments(agentId, workspaceIds);
    profileSaved = true;
  } catch {
    warnings.push(`${gatewayUpdated ? "OpenClaw identity/model changed, but" : ""} Julie HR metadata could not be saved.`.trim());
  }

  if (updateSoul) {
    try {
      const current = await gateway.getAgentFile(agentId, "SOUL.md");
      const file = current?.file;
      const content = mergeHrBlock(typeof file?.content === "string" ? file.content : "", hrBlock({ name, role, personality, scheduleMode, timezone: timeZone }), name);
      if (file?.missing === true) {
        await gateway.setAgentFile(agentId, "SOUL.md", content, undefined, true);
        soulSaved = true;
      } else if (typeof file?.hash === "string" && file.hash) {
        await gateway.setAgentFile(agentId, "SOUL.md", content, file.hash);
        soulSaved = true;
      } else {
        warnings.push("SOUL.md was not changed because no safe write precondition was returned.");
      }
    } catch {
      warnings.push(`${gatewayUpdated ? "Identity/model changes were applied, but" : ""} the guarded SOUL.md update failed.`.trim());
    }
  }

  invalidateAgentDetail(agentId);
  invalidateAgentOverview();
  db.prepare("INSERT INTO audit_logs (command, exit_code, duration_ms) VALUES (?, ?, ?)")
    .run(`agents.update:${agentId}`, 0, Date.now() - started);

  return {
    ok: true,
    source: "gateway+local",
    agentId,
    applied: { gatewayUpdated, profileSaved, soulSaved, soulSkipped: !updateSoul, capabilityPolicyChanged: false },
    warnings,
  };
}
