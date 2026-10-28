import { gateway, type GatewayAgent } from "./gateway.js";
import { aggregateModelUsage } from "./usage-projection.js";
import { getAgentProfile } from "./agent-profiles.js";

export class AgentNotFoundError extends Error {
  constructor(agentId: string) {
    super(`agent not found: ${agentId}`);
    this.name = "AgentNotFoundError";
  }
}

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown, max = 500): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function stringList(value: unknown, maxItems = 30, maxLength = 200): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, maxItems).map((item) => item.trim().slice(0, maxLength))
    : [];
}

function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Gateway read unavailable";
  return raw.replace(/[A-Za-z0-9_+\/=.-]{32,}/g, "[redacted]").slice(0, 300);
}

function safeImageAvatar(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/^https:\/\/[^\s"'<>]+$/i.test(value) && value.length <= 2048) return value;
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(value) && value.length <= 350_000) return value;
  return null;
}

function modelInfo(agent: GatewayAgent) {
  if (typeof agent.model === "string") return { primary: agent.model, fallbacks: [] as string[] };
  return {
    primary: text(agent.model?.primary, 300),
    fallbacks: stringList(agent.model?.fallbacks, 20, 300),
  };
}

function rowTime(row: any): number {
  for (const candidate of [row?.lastActivityAt, row?.lastInteractionAt, row?.updatedAt, row?.startedAt, row?.createdAt]) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }
  return 0;
}

async function sessionsForAgent(agentId: string): Promise<{ rows: any[]; complete: boolean }> {
  const rows: any[] = [];
  let offset = 0;
  let complete = false;
  for (let page = 0; page < 5; page += 1) {
    const result = await gateway.listSessions({
      agentId,
      limit: 200,
      offset,
      excludeCron: true,
      excludeSystem: true,
      excludeDock: true,
    });
    const batch = Array.isArray(result?.sessions) ? result.sessions : [];
    rows.push(...batch);
    if (result?.hasMore !== true) {
      complete = true;
      break;
    }
    const nextOffset = typeof result?.nextOffset === "number" ? result.nextOffset : offset + batch.length;
    if (nextOffset <= offset || batch.length === 0) break;
    offset = nextOffset;
  }
  rows.sort((a, b) => Number(b?.hasActiveRun === true) - Number(a?.hasActiveRun === true) || rowTime(b) - rowTime(a));
  return { rows, complete };
}

function sanitizeSession(row: any) {
  return {
    sessionId: text(row?.sessionId, 200),
    displayName: text(row?.displayName, 500) ?? "Untitled session",
    status: text(row?.status, 80),
    hasActiveRun: row?.hasActiveRun === true,
    activeRunCount: Array.isArray(row?.activeRunIds) ? row.activeRunIds.length : null,
    model: text(row?.model, 300),
    modelProvider: text(row?.modelProvider, 120),
    channel: text(row?.channel, 120),
    chatType: text(row?.chatType, 120),
    startedAt: optionalNumber(row?.startedAt),
    endedAt: optionalNumber(row?.endedAt),
    lastActivityAt: optionalNumber(row?.lastActivityAt) ?? optionalNumber(row?.updatedAt),
    runtimeMs: optionalNumber(row?.runtimeMs),
    inputTokens: optionalNumber(row?.inputTokens),
    outputTokens: optionalNumber(row?.outputTokens),
    totalTokens: optionalNumber(row?.totalTokens),
    estimatedCostUsd: optionalNumber(row?.estimatedCostUsd),
    archived: row?.archived === true,
    pinned: row?.pinned === true,
  };
}

function aggregateUsage(report: any, error: string | null) {
  if (error) return { state: "unavailable", range: "30d", error };
  const rows = Array.isArray(report?.sessions) ? report.sessions : [];
  const readyRows = rows.filter((row: any) => row?.usage && typeof row.usage === "object");
  const hasPending = rows.some((row: any) => row?.usage == null);
  const totals = readyRows.reduce((sum: any, row: any) => {
    const usage = row.usage;
    for (const key of ["input", "output", "cacheRead", "cacheWrite", "totalTokens", "totalCost", "inputCost", "outputCost", "cacheReadCost", "cacheWriteCost", "missingCostEntries"]) {
      sum[key] += finite(usage[key]);
    }
    return sum;
  }, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, totalCost: 0, inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, missingCostEntries: 0 });
  return {
    state: hasPending ? "pending" : rows.length === 0 ? "no_data" : "ready",
    range: "30d",
    sessions: rows.length,
    readySessions: readyRows.length,
    startDate: text(report?.startDate, 40),
    endDate: text(report?.endDate, 40),
    models: aggregateModelUsage(readyRows),
    ...totals,
  };
}

function missingSkillReason(skill: any): string | null {
  if (skill?.eligible === true) return null;
  const missing = skill?.missing && typeof skill.missing === "object" ? skill.missing : {};
  const parts: string[] = [];
  const bins = stringList(missing.bins, 8, 80);
  const anyBins = stringList(missing.anyBins, 8, 80);
  const os = stringList(missing.os, 8, 80);
  if (bins.length) parts.push(`Missing command${bins.length === 1 ? "" : "s"}: ${bins.join(", ")}`);
  if (anyBins.length) parts.push(`Needs one of: ${anyBins.join(", ")}`);
  if (os.length) parts.push(`Requires: ${os.join(", ")}`);
  if (Array.isArray(missing.env) && missing.env.length) parts.push(`${missing.env.length} environment requirement${missing.env.length === 1 ? "" : "s"} missing`);
  if (Array.isArray(missing.config) && missing.config.length) parts.push(`${missing.config.length} configuration requirement${missing.config.length === 1 ? "" : "s"} missing`);
  if (skill?.disabled === true) parts.push("Disabled");
  if (skill?.blockedByAgentFilter === true || skill?.blockedByAllowlist === true) parts.push("Blocked by agent policy");
  return parts.join(" · ") || "Requirements not met";
}

function parseSoul(fileResult: any, error: string | null) {
  if (error) return { state: "unavailable", source: "SOUL.md", error };
  const file = fileResult?.file;
  if (!file || file.missing === true) return { state: "missing", source: "SOUL.md" };
  const content: string = typeof file.content === "string" ? file.content : "";
  const lines = content.split(/\r?\n/);
  const sections = lines
    .map((line) => /^#{1,4}\s+(.+?)\s*$/.exec(line)?.[1]?.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, 12);
  const title = sections[0] ?? null;
  const secretLike = /(?:api[_ -]?key|access[_ -]?token|bearer\s+|password|private[_ -]?key|client[_ -]?secret|authorization\s*:)/i;
  const prose = lines
    .filter((line) => !/^\s*(?:#|```|---)/.test(line))
    .filter((line) => !secretLike.test(line))
    .map((line) => line.replace(/^\s*[-*+]\s+/, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`]/g, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 700);
  return {
    state: "ready",
    source: "SOUL.md",
    title,
    excerpt: prose || null,
    sections,
    size: optionalNumber(file.size) ?? content.length,
    updatedAt: optionalNumber(file.updatedAtMs),
  };
}

async function buildAgentDetail(agentId: string) {
  const roster = await gateway.getAgentRoster();
  const agent = roster.agents.find((candidate) => candidate.id === agentId);
  if (!agent) throw new AgentNotFoundError(agentId);
  const localProfile = getAgentProfile(agentId);

  const reads = await Promise.allSettled([
    sessionsForAgent(agentId),
    gateway.getSessionsUsage({ range: "30d", agentId }),
    gateway.listTools(agentId),
    gateway.listSkills(agentId),
    gateway.getAgentIdentity(agentId),
    gateway.listAgentFiles(agentId),
    gateway.getAgentFile(agentId, "SOUL.md"),
    gateway.listCommands(agentId),
  ]);
  const [sessionsRead, usageRead, toolsRead, skillsRead, identityRead, filesRead, soulRead, commandsRead] = reads;
  const partialErrors: Array<{ source: string; message: string }> = [];
  const failed = (source: string, result: PromiseSettledResult<any>): string | null => {
    if (result.status === "fulfilled") return null;
    const message = safeError(result.reason);
    partialErrors.push({ source, message });
    return message;
  };

  const sessionsError = failed("sessions", sessionsRead);
  const usageError = failed("usage", usageRead);
  const toolsError = failed("tools", toolsRead);
  const skillsError = failed("skills", skillsRead);
  const identityError = failed("identity", identityRead);
  const filesError = failed("files", filesRead);
  const soulError = failed("soul", soulRead);
  const commandsError = failed("commands", commandsRead);

  const sessionsData = sessionsRead.status === "fulfilled" ? sessionsRead.value : { rows: [], complete: false };
  const activeSessions = sessionsData.rows.filter((row: any) => row?.hasActiveRun === true);
  const activityState = sessionsError ? "unknown" : activeSessions.length ? "working" : sessionsData.rows.length ? "no_active_run" : "no_sessions";
  const tools = toolsRead.status === "fulfilled" ? toolsRead.value.map((tool) => ({
    id: tool.id,
    name: text(tool.name, 200) ?? tool.id,
    description: text(tool.description, 1000),
    group: text(tool.group, 200),
    status: text(tool.status, 80),
  })) : [];
  const skillRows = skillsRead.status === "fulfilled" && Array.isArray(skillsRead.value?.skills) ? skillsRead.value.skills : [];
  const skills = skillRows.map((skill: any) => ({
    id: text(skill.skillKey, 200) ?? text(skill.name, 200) ?? "unknown",
    name: text(skill.name, 200) ?? "Unnamed skill",
    description: text(skill.description, 1000),
    emoji: text(skill.emoji, 20),
    source: text(skill.source, 120),
    eligible: skill.eligible === true,
    disabled: skill.disabled === true,
    userInvocable: skill.userInvocable === true,
    reason: missingSkillReason(skill),
  }));
  const effectiveIdentity = identityRead.status === "fulfilled" ? identityRead.value : null;
  const identity = agent.identity && typeof agent.identity === "object" ? agent.identity : {};
  const files = filesRead.status === "fulfilled" && Array.isArray(filesRead.value?.files)
    ? filesRead.value.files.map((file: any) => ({
        name: text(file.name, 200),
        missing: file.missing === true,
        size: optionalNumber(file.size),
        updatedAt: optionalNumber(file.updatedAtMs),
      })).filter((file: any) => file.name)
    : [];
  const commands = commandsRead.status === "fulfilled" && Array.isArray(commandsRead.value?.commands)
    ? commandsRead.value.commands.map((command: any) => ({
        name: text(command.name, 200) ?? "unknown",
        description: text(command.description, 1000),
        category: text(command.category, 120),
        source: text(command.source, 120),
        scope: text(command.scope, 120),
        acceptsArgs: command.acceptsArgs === true,
      }))
    : [];
  const model = modelInfo(agent);

  return {
    ok: true,
    source: "gateway",
    generatedAt: new Date().toISOString(),
    agent: {
      id: agent.id,
      configuredName: text(agent.name, 200),
      displayName: text(identity.name, 200) ?? text(agent.name, 200) ?? agent.id,
      isDefault: roster.defaultId === agent.id,
      identity: {
        name: text(identity.name, 200),
        theme: text(identity.theme, 500),
        emoji: text(identity.emoji, 20),
        avatar: safeImageAvatar(identity.avatar),
        effectiveName: text(effectiveIdentity?.name, 200),
        effectiveNameSource: text(effectiveIdentity?.nameSource, 120),
        effectiveAvatarLabel: typeof effectiveIdentity?.avatar === "string" && effectiveIdentity.avatar.length <= 8 ? effectiveIdentity.avatar : null,
        state: identityError ? "unavailable" : "ready",
      },
      role: localProfile?.role
        ? { state: "configured", value: localProfile.role, source: "julie" }
        : { state: "not_configured", value: null, source: "julie" },
      model: { ...model, utility: text(agent.utilityModel, 300) },
      runtime: {
        id: text(agent.agentRuntime?.id, 120),
        source: text(agent.agentRuntime?.source, 120),
        cloudPlacementSupported: agent.agentRuntime?.cloudPlacementSupported === true,
        devicePlacementSupported: agent.agentRuntime?.devicePlacementSupported === true,
      },
      thinkingDefault: text(agent.thinkingDefault, 80),
      permissionMode: text(agent.defaultPermissionMode, 80),
      provenance: {
        createdVia: text(agent.createdVia, 80),
        creatorAgentId: text(agent.creatorAgentId, 200),
        createdAt: optionalNumber(agent.createdAt),
      },
      workspace: {
        gatewayConfigured: typeof agent.workspace === "string" && agent.workspace.length > 0,
        git: agent.workspaceGit === true,
        bootstrapFiles: files,
        filesState: filesError ? "unavailable" : "ready",
        julieAssignments: localProfile?.workspaceAssignments ?? [],
        assignmentState: localProfile?.workspaceAssignments.length ? "configured" : "not_configured",
      },
      hr: localProfile ? {
        source: "julie",
        personality: localProfile.personality,
        scheduleMode: localProfile.scheduleMode,
        timezone: localProfile.timezone,
        requestedTools: localProfile.requestedTools,
        requestedSkills: localProfile.requestedSkills,
        createdAt: localProfile.createdAt,
        updatedAt: localProfile.updatedAt,
      } : null,
      soul: parseSoul(soulRead.status === "fulfilled" ? soulRead.value : null, soulError),
      activity: {
        state: activityState,
        snapshotComplete: sessionsData.complete,
        visibleSessions: sessionsData.rows.length,
        activeSessions: activeSessions.length,
        sessions: sessionsData.rows.slice(0, 20).map(sanitizeSession),
        totalSessions: sessionsData.rows.length,
        error: sessionsError,
      },
      usage: aggregateUsage(usageRead.status === "fulfilled" ? usageRead.value : null, usageError),
      tools: {
        state: toolsError ? "unavailable" : "ready",
        total: tools.length,
        groups: new Set(tools.map((tool) => tool.group).filter(Boolean)).size,
        items: tools,
        error: toolsError,
      },
      skills: {
        state: skillsError ? "unavailable" : "ready",
        total: skills.length,
        eligible: skills.filter((skill: any) => skill.eligible).length,
        unavailable: skills.filter((skill: any) => !skill.eligible).length,
        items: skills,
        error: skillsError,
      },
      commands: {
        state: commandsError ? "unavailable" : "ready",
        total: commands.length,
        items: commands,
        error: commandsError,
      },
      taskHistory: {
        state: "not_linked",
        items: [],
        reason: "Julie tasks do not yet have an agent assignment field.",
      },
    },
    partialErrors,
  };
}

const cache = new Map<string, { expiresAt: number; value: Awaited<ReturnType<typeof buildAgentDetail>> }>();
const inFlight = new Map<string, Promise<Awaited<ReturnType<typeof buildAgentDetail>>>>();

export async function getAgentDetail(agentId: string, force = false) {
  const cached = cache.get(agentId);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = inFlight.get(agentId);
  if (pending) return pending;
  const request = buildAgentDetail(agentId)
    .then((value) => {
      cache.set(agentId, { expiresAt: Date.now() + 30_000, value });
      return value;
    })
    .finally(() => { inFlight.delete(agentId); });
  inFlight.set(agentId, request);
  return request;
}

export function invalidateAgentDetail(agentId: string): void {
  cache.delete(agentId);
}
