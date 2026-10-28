import { gateway, type GatewayAgent } from "./gateway.js";
import { aggregateModelUsage } from "./usage-projection.js";
import { getAgentProfileMap, getAgentWorkspaceAssignmentMap } from "./agent-profiles.js";
import { db } from "./db.js";

type Availability = "ready" | "pending" | "no_data" | "unavailable";

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeString(value: unknown, max = 500): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function safeAvatar(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/^https:\/\/[^\s"'<>]+$/i.test(value) && value.length <= 2048) return value;
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(value) && value.length <= 350_000) return value;
  // Never send Gateway-host filesystem paths to the browser.
  return null;
}

function agentIdForSession(row: any): string | null {
  if (typeof row?.agentId === "string" && row.agentId) return row.agentId;
  const key = typeof row?.key === "string" ? row.key : "";
  const match = /^agent:([^:]+):/.exec(key);
  return match?.[1] ?? null;
}

function modelForAgent(agent: GatewayAgent): { primary: string | null; fallbacks: string[] } {
  if (typeof agent.model === "string") return { primary: agent.model, fallbacks: [] };
  if (agent.model && typeof agent.model === "object") {
    return {
      primary: safeString(agent.model.primary, 300),
      fallbacks: Array.isArray(agent.model.fallbacks)
        ? agent.model.fallbacks.filter((value): value is string => typeof value === "string").map((value) => value.slice(0, 300)).slice(0, 20)
        : [],
    };
  }
  return { primary: null, fallbacks: [] };
}

function sessionTime(row: any): number {
  for (const value of [row?.lastActivityAt, row?.lastInteractionAt, row?.updatedAt, row?.startedAt, row?.createdAt]) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function sessionSummary(row: any) {
  if (!row) return null;
  return {
    sessionId: safeString(row.sessionId, 200),
    displayName: safeString(row.displayName, 500) ?? "Untitled session",
    status: safeString(row.status, 80),
    hasActiveRun: row.hasActiveRun === true,
    activeRunCount: Array.isArray(row.activeRunIds) ? row.activeRunIds.length : null,
    lastActivityAt: optionalNumber(row.lastActivityAt) ?? optionalNumber(row.updatedAt),
    startedAt: optionalNumber(row.startedAt),
    runtimeMs: optionalNumber(row.runtimeMs),
    model: safeString(row.model, 300),
    inputTokens: optionalNumber(row.inputTokens),
    outputTokens: optionalNumber(row.outputTokens),
    totalTokens: optionalNumber(row.totalTokens),
    estimatedCostUsd: optionalNumber(row.estimatedCostUsd),
  };
}

async function loadVisibleSessions(): Promise<{ rows: any[]; complete: boolean }> {
  const rows: any[] = [];
  let offset = 0;
  let complete = false;
  for (let page = 0; page < 5; page += 1) {
    const result = await gateway.listSessions({
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
  return { rows, complete };
}

function usageForAgent(report: any, agentId: string, reportError: string | null) {
  if (reportError) {
    return { state: "unavailable" as Availability, range: "30d", error: reportError };
  }
  const rows = (Array.isArray(report?.sessions) ? report.sessions : []).filter((row: any) => row?.agentId === agentId);
  const readyRows = rows.filter((row: any) => row?.usage && typeof row.usage === "object");
  const hasPending = rows.some((row: any) => row?.usage == null);
  const totals = readyRows.reduce((sum: any, row: any) => {
    const usage = row.usage;
    sum.input += finiteNumber(usage.input);
    sum.output += finiteNumber(usage.output);
    sum.cacheRead += finiteNumber(usage.cacheRead);
    sum.cacheWrite += finiteNumber(usage.cacheWrite);
    sum.totalTokens += finiteNumber(usage.totalTokens);
    sum.totalCost += finiteNumber(usage.totalCost);
    sum.missingCostEntries += finiteNumber(usage.missingCostEntries);
    return sum;
  }, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, totalCost: 0, missingCostEntries: 0 });

  const state: Availability = hasPending ? "pending" : rows.length === 0 ? "no_data" : "ready";
  return {
    state,
    range: "30d",
    sessions: rows.length,
    readySessions: readyRows.length,
    ...totals,
    startDate: safeString(report?.startDate, 40),
    endDate: safeString(report?.endDate, 40),
    models: aggregateModelUsage(readyRows).slice(0, 5),
  };
}

async function capabilityCounts(agentId: string) {
  const [toolsResult, skillsResult] = await Promise.allSettled([
    gateway.listTools(agentId),
    gateway.listSkills(agentId),
  ]);

  const tools = toolsResult.status === "fulfilled"
    ? {
        state: "ready" as Availability,
        total: toolsResult.value.length,
        groups: new Set(toolsResult.value.map((tool) => tool.group).filter(Boolean)).size,
      }
    : { state: "unavailable" as Availability, total: null, groups: null, error: toolsResult.reason?.message ?? "Tool catalog unavailable" };

  const skillRows = skillsResult.status === "fulfilled" && Array.isArray(skillsResult.value?.skills)
    ? skillsResult.value.skills
    : null;
  const skills = skillRows
    ? {
        state: "ready" as Availability,
        total: skillRows.length,
        eligible: skillRows.filter((skill: any) => skill?.eligible === true).length,
        unavailable: skillRows.filter((skill: any) => skill?.eligible !== true).length,
      }
    : { state: "unavailable" as Availability, total: null, eligible: null, unavailable: null, error: skillsResult.status === "rejected" ? skillsResult.reason?.message ?? "Skill inventory unavailable" : "Skill inventory unavailable" };

  return { tools, skills };
}

async function buildAgentOverview(workspaceId: number, workspaceName: string) {
  const roster = await gateway.getAgentRoster();
  const assignmentMap = getAgentWorkspaceAssignmentMap();
  const workspaceAgents = roster.agents.filter((agent) => assignmentMap.get(agent.id)?.some((workspace) => workspace.id === workspaceId));
  const [sessionsResult, usageResult] = await Promise.allSettled([
    loadVisibleSessions(),
    gateway.getSessionsUsage({ range: "30d", agentScope: "all" }),
  ]);

  const sessions = sessionsResult.status === "fulfilled" ? sessionsResult.value.rows : [];
  const sessionsComplete = sessionsResult.status === "fulfilled" && sessionsResult.value.complete;
  const sessionsError = sessionsResult.status === "rejected" ? sessionsResult.reason?.message ?? "Session inventory unavailable" : null;
  const usageReport = usageResult.status === "fulfilled" ? usageResult.value : null;
  const usageError = usageResult.status === "rejected" ? usageResult.reason?.message ?? "Usage report unavailable" : null;

  const counts = await Promise.all(workspaceAgents.map((agent) => capabilityCounts(agent.id)));
  const localProfiles = getAgentProfileMap();
  const agents = workspaceAgents.map((agent, index) => {
    const localProfile = localProfiles.get(agent.id) ?? null;
    const agentAssignments = assignmentMap.get(agent.id) ?? [];
    const agentSessions = sessions
      .filter((row) => agentIdForSession(row) === agent.id)
      .sort((a, b) => Number(b?.hasActiveRun === true) - Number(a?.hasActiveRun === true) || sessionTime(b) - sessionTime(a));
    const activeSessions = agentSessions.filter((row) => row?.hasActiveRun === true);
    const activityState = sessionsError
      ? "unknown"
      : activeSessions.length > 0
        ? "working"
        : agentSessions.length > 0
          ? "no_active_run"
          : "no_sessions";
    const model = modelForAgent(agent);
    const identity = agent.identity && typeof agent.identity === "object" ? agent.identity : {};
    const configuredName = safeString(agent.name, 200);
    const identityName = safeString(identity.name, 200);

    return {
      id: agent.id,
      configuredName,
      displayName: identityName ?? configuredName ?? agent.id,
      identity: {
        name: identityName,
        theme: safeString(identity.theme, 500),
        emoji: safeString(identity.emoji, 20),
        avatar: safeAvatar(identity.avatar),
      },
      role: localProfile?.role || null,
      roleState: localProfile?.role ? "configured" : "not_configured",
      model: {
        ...model,
        utility: safeString(agent.utilityModel, 300),
      },
      runtime: {
        id: safeString(agent.agentRuntime?.id, 120),
        source: safeString(agent.agentRuntime?.source, 120),
      },
      thinkingDefault: safeString(agent.thinkingDefault, 80),
      permissionMode: safeString(agent.defaultPermissionMode, 80),
      workspaceGit: agent.workspaceGit === true,
      provenance: {
        createdVia: safeString(agent.createdVia, 80),
        creatorAgentId: safeString(agent.creatorAgentId, 200),
        createdAt: optionalNumber(agent.createdAt),
      },
      activity: {
        state: activityState,
        sessionSnapshotComplete: sessionsComplete,
        visibleSessions: agentSessions.length,
        activeSessions: activeSessions.length,
        latestActivityAt: agentSessions.length > 0 ? sessionTime(agentSessions[0]) || null : null,
        currentSession: sessionSummary(activeSessions[0] ?? agentSessions[0]),
        currentTask: null,
        taskState: "not_linked",
        error: sessionsError,
      },
      office: activityState === "working"
        ? {
            zone: "desk",
            classification: "verified",
            label: "At desk · active run",
            evidence: "OpenClaw sessions.list reports hasActiveRun=true.",
            semanticAction: null,
            dutyState: "unknown",
          }
        : {
            zone: "staging",
            classification: "unclassified",
            label: "Roster lobby · activity unclassified",
            evidence: sessionsError
              ? "Session activity could not be read."
              : activityState === "no_active_run"
                ? "The visible session snapshot reports no active direct run; duty state is unknown."
                : "No visible session provides activity or duty evidence.",
            semanticAction: null,
            dutyState: "unknown",
          },
      usage: usageForAgent(usageReport, agent.id, usageError),
      capabilities: counts[index],
      hr: localProfile || agentAssignments.length ? {
        source: "julie",
        scheduleMode: localProfile?.scheduleMode ?? null,
        timezone: localProfile?.timezone ?? null,
        workspaceId: agentAssignments[0]?.id ?? null,
        workspaceName: agentAssignments[0]?.name ?? null,
        workspaceAssignments: agentAssignments,
        sharedAcrossWorkspaces: agentAssignments.length > 1,
        requestedToolCount: localProfile?.requestedTools.length ?? 0,
        requestedSkillCount: localProfile?.requestedSkills.length ?? 0,
      } : null,
      isDefault: roster.defaultId === agent.id,
    };
  });

  const partialErrors = [sessionsError, usageError, ...agents.flatMap((agent) => [
    agent.capabilities.tools.state === "unavailable" ? `${agent.id}: tools unavailable` : null,
    agent.capabilities.skills.state === "unavailable" ? `${agent.id}: skills unavailable` : null,
  ])].filter((value): value is string => Boolean(value));

  const usageRows = Array.isArray(usageReport?.sessions) ? usageReport.sessions : [];
  const assignedIds = new Set(agents.map((agent) => agent.id));
  const assignedUsageRows = usageRows.filter((row: any) => assignedIds.has(String(row?.agentId ?? "")));
  const assignedUsageTotals = agents.reduce((sum, agent) => {
    sum.totalTokens += finiteNumber(agent.usage.totalTokens);
    sum.totalCost += finiteNumber(agent.usage.totalCost);
    sum.missingCostEntries += finiteNumber(agent.usage.missingCostEntries);
    return sum;
  }, { totalTokens: 0, totalCost: 0, missingCostEntries: 0 });
  const taskRows = db.prepare("SELECT status, COUNT(*) AS count FROM tasks WHERE workspace_id = ? GROUP BY status").all(workspaceId) as Array<{ status: string; count: number }>;
  const conversationCount = (db.prepare("SELECT COUNT(*) AS count FROM conversations WHERE workspace_id = ?").get(workspaceId) as { count: number }).count;
  const taskCount = taskRows.reduce((sum, row) => sum + row.count, 0);
  const openTaskCount = taskRows.filter((row) => row.status !== "done").reduce((sum, row) => sum + row.count, 0);
  return {
    ok: true,
    source: "gateway",
    generatedAt: new Date().toISOString(),
    defaultAgentId: roster.defaultId ?? null,
    selectionRequired: roster.selectionRequired ?? null,
    workspace: { id: workspaceId, name: workspaceName },
    workspaceContext: {
      conversations: conversationCount,
      tasks: { total: taskCount, open: openTaskCount, byStatus: taskRows },
      projects: { state: "not_configured", count: null },
      policies: {
        membership: "explicit",
        sharedAgents: agents.filter((agent) => agent.hr?.sharedAcrossWorkspaces).length,
        taskAssignment: "not_configured",
        projectAccess: "not_configured",
      },
    },
    agents,
    summary: {
      configuredAgents: agents.length,
      gatewayRosterTotal: roster.agents.length,
      unassignedAgents: roster.agents.filter((agent) => (assignmentMap.get(agent.id) ?? []).length === 0).length,
      workingAgents: agents.filter((agent) => agent.activity.state === "working").length,
      visibleSessions: agents.reduce((sum, agent) => sum + agent.activity.visibleSessions, 0),
      sessionSnapshotComplete: sessionsComplete,
      usage: usageError
        ? { state: "unavailable", range: "30d", error: usageError }
        : {
            state: assignedUsageRows.some((row: any) => row?.usage == null) ? "pending" : assignedUsageRows.length === 0 ? "no_data" : "ready",
            range: "30d",
            ...assignedUsageTotals,
            models: aggregateModelUsage(assignedUsageRows).slice(0, 8),
          },
    },
    partialErrors,
  };
}

const cache = new Map<number, { expiresAt: number; value: Awaited<ReturnType<typeof buildAgentOverview>> }>();
const inFlight = new Map<number, Promise<Awaited<ReturnType<typeof buildAgentOverview>>>>();

export async function getAgentOverview(workspaceId: number, workspaceName: string, force = false) {
  const cached = cache.get(workspaceId);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = inFlight.get(workspaceId);
  if (pending) return pending;
  const request = buildAgentOverview(workspaceId, workspaceName)
    .then((value) => {
      cache.set(workspaceId, { expiresAt: Date.now() + 30_000, value });
      return value;
    })
    .finally(() => { inFlight.delete(workspaceId); });
  inFlight.set(workspaceId, request);
  return request;
}

export function invalidateAgentOverview(): void {
  cache.clear();
}
