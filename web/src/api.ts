// API client. All calls go to same-origin /api (served by the Express process).
async function jfetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error ?? `HTTP ${res.status}`), { status: res.status, body });
  return body as T;
}

async function uploadBinary<T>(path: string, body: Blob, contentType: string): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": contentType, "X-Julie-Confirm": "true" },
    credentials: "same-origin",
    body,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(payload?.error ?? `HTTP ${res.status}`), { status: res.status, body: payload });
  return payload as T;
}

async function uploadForm<T>(path: string, body: FormData): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    body,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(payload?.error ?? `HTTP ${res.status}`), { status: res.status, body: payload });
  return payload as T;
}

export type WorkspacesResponse = { ok: boolean; workspaces: Workspace[]; activeWorkspaceId: number | null };
export type WorkspacePlan = {
  summary: string;
  teamModeRationale: string;
  recommendedAgents: Array<{ agentId: string; reason: string }>;
  newRoles: Array<{ name: string; role: string; emoji: string; reason: string; personality: string }>;
  environment: { projectDirectory: string; runtime: string; setupSteps: string[] };
  model: string | null;
  tools: string[];
  skills: string[];
  operatingRules: string[];
  acceptanceChecks: string[];
  risks: string[];
};
export type WorkspacePlanResponse = {
  ok: true;
  source: "gateway+local";
  planToken: string;
  status: "planned" | "applied";
  name: string;
  purpose: string;
  teamMode: "shared" | "dedicated";
  plan: WorkspacePlan;
  catalog: {
    agents: Array<{ agentId: string; displayName: string; role: string; department: string; level: string | null; model: string | null; workspaces: string[] }>;
    models: Array<{ id: string; name: string; available: boolean }>;
    existingWorkspaces: Array<{ id: number; name: string; description: string }>;
  };
  julie: { sessionId: string; title?: string };
  warnings: string[];
  policy?: string;
};
export type WorkspacePlanAppliedResponse = {
  ok: true;
  source: "gateway+local";
  planToken: string;
  status: "applied";
  appliedAt: string;
  workspace: Workspace;
  teamMode: "shared" | "dedicated";
  julie: { sessionId: string };
  assignedAgentIds: string[];
  createdAgents: Array<{ agentId: string; name: string; role: string }>;
  setupTaskId: number;
  rooms: Array<{ id: number; title: string; kind: "task" | "department"; members: number }>;
  warnings: string[];
};
export type WorkspaceCreatedResponse = { ok: boolean; workspace: Workspace };
export type WorkspaceActivatedResponse = { ok: boolean; activeWorkspaceId: number };
export type TaskSummary = {
  total: number;
  open: number;
  done: number;
  active: number;
  blocked: number;
  highPriority: number;
  assigned: number;
  unassigned: number;
  completionRate: number;
  byStatus: Record<(typeof TASK_STATUSES)[number], number>;
};
export type TasksResponse = { ok: boolean; tasks: Task[]; runningTaskIds: number[]; summary: TaskSummary };
export type ConversationsResponse = { ok: boolean; conversations: Conversation[] };
export type ConversationCreatedResponse = { ok: boolean; conversation: Conversation };
export type AgentRunAction = {
  id: number;
  sessionKey: string;
  sessionId: string;
  runId: string;
  kind: "tool" | "run" | "note";
  phase: string;
  name: string;
  title: string;
  status: "running" | "completed" | "failed" | "blocked" | "stopped" | "unknown";
  detail: string;
  output: string;
  isError: boolean;
  createdAt: string;
  updatedAt: string;
};
export type ChatRunSnapshot = {
  state: "sending" | "accepted" | "status" | "responding" | "finalizing";
  phase: string | null;
  retry: { attempt?: number; maxAttempts?: number; reason?: string } | null;
  text: string;
  startedAt: number;
};
export type MessagesResponse = { ok: boolean; messages: Message[]; activeRun: ChatRunSnapshot | null };
export type ChatSendAcceptedResponse = {
  ok: true;
  status: "accepted" | "queued";
  gatewayStatus?: string;
  userMessage: Message;
};
export type ChatUploadAcceptedResponse = ChatSendAcceptedResponse & {
  attachment: { fileName: string; mimeType: string; sizeBytes: number };
};
export type InsightsResponse = { ok: boolean; insights: Insights };

export const api = {
  session: () => jfetch("/api/session"),
  login: (password: string) => jfetch("/api/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => jfetch("/api/logout", { method: "POST" }),
  gatewayStatus: () => jfetch<GatewayStatus>("/api/gateway/status"),
  workspaces: () => jfetch<WorkspacesResponse>("/api/workspaces"),
  createWorkspace: (name: string, description = "") => jfetch<WorkspaceCreatedResponse>("/api/workspaces", { method: "POST", body: JSON.stringify({ name, description }) }),
  activateWorkspace: (id: number) => jfetch<WorkspaceActivatedResponse>(`/api/workspaces/${id}/activate`, { method: "POST" }),
  planWorkspace: (input: { name: string; purpose: string; teamMode: "shared" | "dedicated" }) => jfetch<WorkspacePlanResponse>("/api/workspaces/plan", { method: "POST", body: JSON.stringify(input) }),
  applyWorkspacePlan: (token: string) => jfetch<WorkspacePlanAppliedResponse>(`/api/workspaces/plans/${encodeURIComponent(token)}/apply`, { method: "POST", body: JSON.stringify({ confirmed: true }) }),
  workspacePlan: (token: string) => jfetch<WorkspacePlanResponse>(`/api/workspaces/plans/${encodeURIComponent(token)}`),
  tasks: (workspaceId: number) => jfetch<TasksResponse>(`/api/tasks?workspaceId=${workspaceId}`),
  createTask: (input: TaskCreateInput) => jfetch<{ ok: true; task: Task }>("/api/tasks", { method: "POST", body: JSON.stringify(input) }),
  updateTask: (id: number, patch: Record<string, unknown>) => jfetch(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteTask: (id: number) => jfetch(`/api/tasks/${id}`, { method: "DELETE" }),
  runTask: (id: number) => jfetch(`/api/tasks/${id}/run`, { method: "POST", body: JSON.stringify({}) }),
  taskActivity: (id: number) => jfetch<TaskActivityResponse>(`/api/tasks/${id}/activity`),
  conversations: (workspaceId: number) => jfetch<ConversationsResponse>(`/api/conversations?workspaceId=${workspaceId}`),
  createConversation: (workspaceId: number, title: string) => jfetch<ConversationCreatedResponse>("/api/conversations", { method: "POST", body: JSON.stringify({ workspaceId, title }) }),
  deleteConversation: (id: number) => jfetch<{ ok: true }>(`/api/conversations/${id}`, { method: "DELETE" }),
  messages: (conversationId: number) => jfetch<MessagesResponse>(`/api/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: number, text: string) => jfetch<ChatSendAcceptedResponse>(`/api/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify({ text }) }),
  abortConversation: (conversationId: number) => jfetch<{ ok: true; status: "abort_requested" }>(`/api/conversations/${conversationId}/abort`, { method: "POST", body: JSON.stringify({}) }),
  removeConversationMessage: (conversationId: number, messageId: number, localOnlyConfirmed = false) => jfetch<{ ok: true; status: "recalled_before_dispatch" | "removed_from_julie_only"; message?: Message }>(`/api/conversations/${conversationId}/messages/${messageId}`, { method: "DELETE", body: JSON.stringify({ localOnlyConfirmed }) }),
  uploadChatAttachment: (conversationId: number, message: string, file: File) => {
    const body = new FormData();
    body.append("conversationId", String(conversationId));
    body.append("message", message);
    body.append("file", file, file.name);
    return uploadForm<ChatUploadAcceptedResponse>("/api/upload", body);
  },
  agents: () => jfetch("/api/agents"),
  agentOverview: (refresh = false) => jfetch<AgentOverviewResponse>(`/api/agents/overview${refresh ? "?refresh=1" : ""}`),
  agentDetail: (id: string, refresh = false) => jfetch<AgentDetailResponse>(`/api/agents/${encodeURIComponent(id)}${refresh ? "?refresh=1" : ""}`),
  updateAgent: (id: string, input: AgentUpdateInput) => jfetch<AgentUpdateResult>(`/api/agents/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }),
  agentHistory: (id: string, sessionId: string) => jfetch<AgentHistoryResponse>(`/api/agents/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sessionId)}/history`),
  sendAgentMessage: (id: string, text: string, sessionId: string | null, title?: string) => jfetch<AgentTurnAcceptedResponse>(`/api/agents/${encodeURIComponent(id)}/chat`, { method: "POST", body: JSON.stringify({ text, sessionId, title }) }),
  agentTurns: (id: string, sessionId: string) => jfetch<AgentTurnsResponse>(`/api/agents/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sessionId)}/turns`),
  cancelAgentTurn: (id: string, sessionId: string, turnId: string) => jfetch<{ ok: true; source: "gateway"; turn: AgentChatTurn }>(`/api/agents/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}`, { method: "DELETE" }),
  uploadAgentAttachment: (id: string, sessionId: string | null, title: string, message: string, file: File) => {
    const body = new FormData();
    if (sessionId) body.append("sessionId", sessionId);
    if (title) body.append("title", title);
    body.append("message", message);
    body.append("file", file, file.name);
    return uploadForm<AgentTurnAcceptedResponse & { attachment: { fileName: string; mimeType: string; sizeBytes: number } }>(`/api/agents/${encodeURIComponent(id)}/upload`, body);
  },
  renameAgentSession: (id: string, sessionId: string, title: string) => jfetch<AgentSessionMutationResponse>(`/api/agents/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sessionId)}`, { method: "PATCH", body: JSON.stringify({ title }) }),
  archiveAgentSession: (id: string, sessionId: string, archived: boolean) => jfetch<AgentSessionMutationResponse>(`/api/agents/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sessionId)}`, { method: "PATCH", body: JSON.stringify({ archived }) }),
  abortAgentSession: (id: string, sessionId: string) => jfetch<{ ok: true; source: "gateway"; agentId: string; sessionId: string; status: "abort_requested" }>(`/api/agents/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sessionId)}/abort`, { method: "POST", body: JSON.stringify({}) }),
  deleteAgentSession: (id: string, sessionId: string) => jfetch<AgentSessionDeleteResponse>(`/api/agents/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE", body: JSON.stringify({ confirmed: true }) }),
  agentOnboardingOptions: (refresh = false) => jfetch<AgentOnboardingOptions>(`/api/agents/onboarding/options${refresh ? "?refresh=1" : ""}`),
  createAgent: (input: AgentOnboardingInput) => jfetch<AgentOnboardingResult>("/api/agents", { method: "POST", body: JSON.stringify(input) }),
  agentAssignments: (workspaceId?: number) => jfetch<AgentAssignmentsResponse>(`/api/agents/assignments${workspaceId ? `?workspaceId=${workspaceId}` : ""}`),
  setAgentAssignments: (workspaceId: number, agentIds: string[]) => jfetch<AgentAssignmentsResponse>("/api/agents/assignments", { method: "PUT", body: JSON.stringify({ workspaceId, agentIds, confirmed: true }) }),
  agentOrganization: (workspaceId?: number) => jfetch<AgentOrganizationResponse>(`/api/agents/organization${workspaceId ? `?workspaceId=${workspaceId}` : ""}`),
  setAgentOrganization: (workspaceId: number, members: AgentOrganizationInput[]) => jfetch<AgentOrganizationResponse>("/api/agents/organization", { method: "PUT", body: JSON.stringify({ workspaceId, members, confirmed: true }) }),
  setAgentNames: (workspaceId: number, names: Record<string, string>) => jfetch<AgentOrganizationResponse>("/api/agents/names", { method: "PUT", body: JSON.stringify({ workspaceId, names, confirmed: true }) }),
  agentRooms: (workspaceId: number) => jfetch<AgentRoomsResponse>(`/api/agent-rooms?workspaceId=${workspaceId}`),
  agentRoom: (id: number) => jfetch<AgentRoomResponse>(`/api/agent-rooms/${id}`),
  createAgentRoom: (input: { workspaceId: number; taskId: number; title?: string; agentIds: string[] }) => jfetch<AgentRoomResponse>("/api/agent-rooms", { method: "POST", body: JSON.stringify({ ...input, confirmed: true }) }),
  ensureDepartmentRooms: (workspaceId: number) => jfetch<{ ok: true; source: "local+gateway"; rooms: AgentRoomDetail[] }>("/api/agent-rooms/department-rooms", { method: "POST", body: JSON.stringify({ workspaceId, confirmed: true }) }),
  setAgentRoomMembers: (id: number, agentIds: string[]) => jfetch<AgentRoomResponse>(`/api/agent-rooms/${id}/members`, { method: "PUT", body: JSON.stringify({ agentIds, confirmed: true }) }),
  sendAgentRoomMessage: (id: number, text: string, agentIds?: string[]) => jfetch<AgentRoomSendResponse>(`/api/agent-rooms/${id}/messages`, { method: "POST", body: JSON.stringify({ text, ...(agentIds ? { agentIds } : {}) }) }),
  uploadAgentRoomAttachment: (id: number, message: string, agentIds: string[] | undefined, file: File) => {
    const body = new FormData();
    body.append("message", message);
    if (agentIds) body.append("agentIds", JSON.stringify(agentIds));
    body.append("file", file, file.name);
    return uploadForm<AgentRoomSendResponse & { attachment: { fileName: string; mimeType: string; sizeBytes: number } }>(`/api/agent-rooms/${id}/upload`, body);
  },
  archiveAgentRoom: (id: number, archived: boolean) => jfetch<AgentRoomResponse>(`/api/agent-rooms/${id}`, { method: "PATCH", body: JSON.stringify({ archived, confirmed: true }) }),
  agentAvatarStudio: (id: string, refresh = false) => jfetch<AgentAvatarStudioResponse>(`/api/agents/${encodeURIComponent(id)}/avatar${refresh ? "?refresh=1" : ""}`),
  previewAgentAvatar: (id: string, input: AgentAvatarPreviewInput) => jfetch<AgentAvatarPreviewResponse>(`/api/agents/${encodeURIComponent(id)}/avatar/preview`, { method: "POST", body: JSON.stringify(input) }),
  generateAgentAvatar: (id: string, input: AgentAvatarGenerateInput) => jfetch<AgentAvatarGenerateResult>(`/api/agents/${encodeURIComponent(id)}/avatar/generate`, { method: "POST", body: JSON.stringify(input) }),
  applyAgentAvatar: (id: string, assetId: number) => jfetch<AgentAvatarApplyResult>(`/api/agents/${encodeURIComponent(id)}/avatar/apply`, { method: "POST", body: JSON.stringify({ assetId, confirmed: true }) }),
  importAgentAvatarImage: (id: string, image: string) => jfetch<AgentAvatarImportResult>(`/api/agents/${encodeURIComponent(id)}/avatar/import`, { method: "POST", body: JSON.stringify({ image, confirmed: true }) }),
  applyAgentAvatarUrl: (id: string, url: string) => jfetch<AgentAvatarUrlApplyResult>(`/api/agents/${encodeURIComponent(id)}/avatar/apply-url`, { method: "POST", body: JSON.stringify({ url, confirmed: true }) }),
  uploadAgentAvatarModel: (id: string, file: File) => uploadBinary<AgentAvatarModelResult>(`/api/agents/${encodeURIComponent(id)}/avatar/model`, file, "model/gltf-binary"),
  addAgentAvatarModelUrl: (id: string, url: string) => jfetch<AgentAvatarModelResult>(`/api/agents/${encodeURIComponent(id)}/avatar/model-url`, { method: "POST", body: JSON.stringify({ url, confirmed: true }) }),
  agentAvatarFallbackUrl: (id: string) => `/api/agents/${encodeURIComponent(id)}/avatar/fallback.svg`,
  tools: () => jfetch("/api/tools"),
  appPreferences: () => jfetch<{ ok: boolean; preferences: Record<string, boolean> }>("/api/apps/preferences"),
  setAppEnabled: (id: string, enabled: boolean) => jfetch<{ ok: boolean; id: string; enabled: boolean; preferences: Record<string, boolean> }>(`/api/apps/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
  analytics: () => jfetch("/api/analytics"),
  weather: () => jfetch("/api/weather"),
  trending: () => jfetch<TrendingResponse>("/api/trending"),
  opencodeStatus: () => jfetch<OpencodeStatus>("/api/opencode/status"),
  opencodeSessions: () => jfetch<OpencodeSessionsResponse>("/api/opencode/sessions"),
  opencodeMessages: (sid: string) => jfetch<OpencodeMessagesResponse>(`/api/opencode/sessions/${encodeURIComponent(sid)}/messages`),
  opencodeStats: () => jfetch<OpencodeStatsResponse>("/api/opencode/stats"),
  opencodeActive: () => jfetch<OpencodeActiveResponse>("/api/opencode/active"),
  opencodeProjects: () => jfetch<OpencodeProjectsResponse>("/api/opencode/projects"),
  devices: () => jfetch("/api/devices"),
  insights: () => jfetch<InsightsResponse>("/api/insights"),
  promptUsage: (limit = 3) => jfetch<{ ok: boolean; prompts: Array<{ prompt_hash: string; prompt: string; uses: number; last_used: string }>; total: number }>(`/api/prompt-usage?limit=${limit}`),
  avatar: () => jfetch<{ ok: boolean; avatar: string | null }>("/api/settings/avatar"),
  setAvatar: (image: string | null) => jfetch<{ ok: boolean; avatar: string | null }>("/api/settings/avatar", { method: "PUT", body: JSON.stringify({ image }) }),
  // --- Projects ---
  projects: () => jfetch<ProjectsResponse>("/api/projects"),
  projectDirs: () => jfetch<ProjectDirsResponse>("/api/projects/dirs"),
  project: (slug: string) => jfetch<ProjectResponse>(`/api/projects/${encodeURIComponent(slug)}`),
  updateProject: (slug: string, input: ProjectUpdateInput) => jfetch<ProjectResponse>(`/api/projects/${encodeURIComponent(slug)}`, { method: "PUT", body: JSON.stringify(input) }),
  startProject: (slug: string) => jfetch<ProjectResponse>(`/api/projects/${encodeURIComponent(slug)}/start`, { method: "POST" }),
  stopProject: (slug: string) => jfetch<ProjectResponse>(`/api/projects/${encodeURIComponent(slug)}/stop`, { method: "POST" }),
  projectLogs: (slug: string) => jfetch<ProjectLogsResponse>(`/api/projects/${encodeURIComponent(slug)}/logs`),
  // --- Feature Lab ---
  featureIdeas: (params?: { status?: string; category?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.category) qs.set("category", params.category);
    return jfetch<FeatureIdeasResponse>(`/api/feature-ideas${qs.toString() ? "?" + qs.toString() : ""}`);
  },
  createFeatureIdea: (input: FeatureIdeaCreateInput) => jfetch<FeatureIdeaResponse>("/api/feature-ideas", { method: "POST", body: JSON.stringify(input) }),
  updateFeatureIdea: (id: number, patch: FeatureIdeaPatch) => jfetch<FeatureIdeaResponse>(`/api/feature-ideas/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  voteFeatureIdea: (id: number, delta: 1 | -1) => jfetch<FeatureIdeaResponse>(`/api/feature-ideas/${id}/vote`, { method: "POST", body: JSON.stringify({ delta }) }),
  requestFeatureIdeaTask: (id: number) => jfetch<{ ok: boolean; task: Task }>(`/api/feature-ideas/${id}/request-task`, { method: "POST" }),
  deleteFeatureIdea: (id: number) => jfetch<{ ok: boolean }>(`/api/feature-ideas/${id}`, { method: "DELETE" }),
  // --- Settings ---
  settingsHealth: () => jfetch<SettingsHealthResponse>("/api/settings/health"),
  settingsBackup: () => jfetch<SettingsBackupResponse>("/api/settings/backup", { method: "POST" }),
  settingsBackups: () => jfetch<SettingsBackupsResponse>("/api/settings/backups"),
  restoreBackup: (file: string) => jfetch<SettingsRestoreResponse>(`/api/settings/backups/${encodeURIComponent(file)}/restore`, { method: "POST" }),
  clearAuditLogs: () => jfetch<{ ok: boolean; cleared: boolean }>("/api/settings/audit/clear", { method: "POST" }),
  clearPromptUsage: () => jfetch<{ ok: boolean; cleared: boolean }>("/api/settings/prompt-usage/clear", { method: "POST" }),
  settings: () => jfetch<SettingsResponse>("/api/settings"),
  saveSettings: (settings: Record<string, string>) => jfetch<{ ok: boolean }>("/api/settings", { method: "PUT", body: JSON.stringify({ settings }) }),
  engineeringPolicy: () => jfetch<EngineeringPolicyResponse>("/api/settings/engineering"),
  // --- Profile ---
  profileStats: () => jfetch<ProfileStatsResponse>("/api/profile/stats"),
  profileActivity: (limit = 50) => jfetch<ProfileActivityResponse>(`/api/profile/activity?limit=${limit}`),
  profileSessions: (limit = 20) => jfetch<ProfileSessionsResponse>(`/api/profile/sessions?limit=${limit}`),
};

export type Agent = { id: string; name?: string; model?: string; status?: string; [key: string]: unknown };
export type AgentActivityState = "working" | "no_active_run" | "no_sessions" | "unknown";
export type AgentAvailability = "ready" | "pending" | "no_data" | "unavailable";
export type AgentModelUsage = {
  provider: string | null;
  model: string;
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
  missingCostEntries: number;
};
export type AgentOverviewItem = {
  id: string;
  configuredName: string | null;
  displayName: string;
  identity: { name: string | null; theme: string | null; emoji: string | null; avatar: string | null };
  role: string | null;
  roleState: "configured" | "not_configured";
  model: { primary: string | null; fallbacks: string[]; utility: string | null };
  runtime: { id: string | null; source: string | null };
  thinkingDefault: string | null;
  permissionMode: string | null;
  workspaceGit: boolean;
  provenance: { createdVia: string | null; creatorAgentId: string | null; createdAt: number | null };
  activity: {
    state: AgentActivityState;
    sessionSnapshotComplete: boolean;
    visibleSessions: number;
    activeSessions: number;
    latestActivityAt: number | null;
    currentSession: null | {
      sessionId: string | null;
      displayName: string;
      status: string | null;
      hasActiveRun: boolean;
      activeRunCount: number | null;
      lastActivityAt: number | null;
      startedAt: number | null;
      runtimeMs: number | null;
      model: string | null;
      inputTokens: number | null;
      outputTokens: number | null;
      totalTokens: number | null;
      estimatedCostUsd: number | null;
    };
    currentTask: null | { id: number; assigned_agent_id: string; title: string; status: Task["status"]; priority: Task["priority"]; updated_at: string };
    taskState: "linked";
    error: string | null;
  };
  office: {
    zone: "desk" | "library" | "lounge" | "home" | "staging";
    classification: "verified" | "unclassified";
    label: string;
    evidence: string;
    semanticAction: string | null;
    dutyState: "unknown" | "on_duty" | "off_duty";
  };
  usage: {
    state: AgentAvailability;
    range: "30d";
    sessions?: number;
    readySessions?: number;
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
    totalCost?: number;
    missingCostEntries?: number;
    startDate?: string | null;
    endDate?: string | null;
    models?: AgentModelUsage[];
    error?: string;
  };
  capabilities: {
    tools: { state: AgentAvailability; total: number | null; groups: number | null; error?: string };
    skills: { state: AgentAvailability; total: number | null; eligible: number | null; unavailable: number | null; error?: string };
  };
  hr: null | {
    source: "julie";
    scheduleMode: "always_available" | "weekdays" | "manual" | null;
    timezone: string | null;
    workspaceId: number | null;
    workspaceName: string | null;
    workspaceAssignments: Array<{ id: number; name: string }>;
    sharedAcrossWorkspaces: boolean;
    requestedToolCount: number;
    requestedSkillCount: number;
  };
  isDefault: boolean;
};
export type AgentOverviewResponse = {
  ok: true;
  source: "gateway";
  generatedAt: string;
  defaultAgentId: string | null;
  selectionRequired: boolean | null;
  agents: AgentOverviewItem[];
  summary: {
    configuredAgents: number;
    gatewayRosterTotal: number;
    unassignedAgents: number;
    workingAgents: number;
    visibleSessions: number;
    sessionSnapshotComplete: boolean;
    usage: { state: AgentAvailability; range: "30d"; totalTokens?: number; totalCost?: number; missingCostEntries?: number; models?: AgentModelUsage[]; error?: string };
  };
  workspace: { id: number; name: string };
  workspaceContext: {
    conversations: number;
    tasks: { total: number; open: number; byStatus: Array<{ status: string; count: number }> };
    projects: { state: "not_configured"; count: null };
    policies: { membership: "explicit"; sharedAgents: number; taskAssignment: "configured"; projectAccess: "not_configured" };
  };
  partialErrors: string[];
};
export type AgentSessionSummary = {
  sessionId: string | null;
  displayName: string;
  status: string | null;
  hasActiveRun: boolean;
  activeRunCount: number | null;
  model: string | null;
  modelProvider: string | null;
  channel: string | null;
  chatType: string | null;
  startedAt: number | null;
  endedAt: number | null;
  lastActivityAt: number | null;
  runtimeMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  archived: boolean;
  pinned: boolean;
};
export type AgentDetailResponse = {
  ok: true;
  source: "gateway";
  generatedAt: string;
  partialErrors: Array<{ source: string; message: string }>;
  agent: {
    id: string;
    configuredName: string | null;
    displayName: string;
    isDefault: boolean;
    identity: {
      name: string | null;
      theme: string | null;
      emoji: string | null;
      avatar: string | null;
      effectiveName: string | null;
      effectiveNameSource: string | null;
      effectiveAvatarLabel: string | null;
      state: "ready" | "unavailable";
    };
    role: { state: "configured" | "not_configured"; value: string | null; source: "julie" };
    model: { primary: string | null; fallbacks: string[]; utility: string | null };
    runtime: { id: string | null; source: string | null; cloudPlacementSupported: boolean; devicePlacementSupported: boolean };
    thinkingDefault: string | null;
    permissionMode: string | null;
    provenance: { createdVia: string | null; creatorAgentId: string | null; createdAt: number | null };
    workspace: {
      gatewayConfigured: boolean;
      git: boolean;
      bootstrapFiles: Array<{ name: string; missing: boolean; size: number | null; updatedAt: number | null }>;
      filesState: "ready" | "unavailable";
      julieAssignments: Array<{ id: number; name: string }>;
      assignmentState: "configured" | "not_configured";
    };
    hr: null | {
      source: "julie";
      personality: string;
      scheduleMode: "always_available" | "weekdays" | "manual";
      timezone: string;
      requestedTools: string[];
      requestedSkills: string[];
      createdAt: string;
      updatedAt: string;
    };
    soul: {
      state: "ready" | "missing" | "unavailable";
      source: "SOUL.md";
      title?: string | null;
      excerpt?: string | null;
      sections?: string[];
      size?: number | null;
      updatedAt?: number | null;
      error?: string;
    };
    activity: {
      state: AgentActivityState;
      snapshotComplete: boolean;
      visibleSessions: number;
      activeSessions: number;
      sessions: AgentSessionSummary[];
      totalSessions: number;
      error: string | null;
    };
    usage: {
      state: AgentAvailability;
      range: "30d";
      sessions?: number;
      readySessions?: number;
      startDate?: string | null;
      endDate?: string | null;
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
      totalTokens?: number;
      totalCost?: number;
      inputCost?: number;
      outputCost?: number;
      cacheReadCost?: number;
      cacheWriteCost?: number;
      missingCostEntries?: number;
      models?: AgentModelUsage[];
      error?: string;
    };
    tools: {
      state: "ready" | "unavailable";
      total: number;
      groups: number;
      items: Array<{ id: string; name: string; description: string | null; group: string | null; status: string | null }>;
      error: string | null;
    };
    skills: {
      state: "ready" | "unavailable";
      total: number;
      eligible: number;
      unavailable: number;
      items: Array<{ id: string; name: string; description: string | null; emoji: string | null; source: string | null; eligible: boolean; disabled: boolean; userInvocable: boolean; reason: string | null }>;
      error: string | null;
    };
    commands: {
      state: "ready" | "unavailable";
      total: number;
      items: Array<{ name: string; description: string | null; category: string | null; source: string | null; scope: string | null; acceptsArgs: boolean }>;
      error: string | null;
    };
    taskHistory: {
      state: "linked";
      items: Array<Pick<Task, "id" | "workspace_id" | "title" | "description" | "status" | "priority" | "assigned_agent_id" | "last_run_output" | "run_started_at" | "created_at" | "updated_at">>;
      reason: null;
    };
  };
};
export type AgentChatSession = {
  sessionId: string | null;
  displayName: string;
  status: string | null;
  hasActiveRun: boolean;
  lastActivityAt: number | null;
  model: string | null;
  archived: boolean;
};
export type AgentSessionMutationResponse = { ok: true; source: "gateway"; agentId: string; session: AgentChatSession };
export type AgentSessionDeleteResponse = { ok: true; source: "gateway"; agentId: string; sessionId: string; deleted: boolean; transcriptArchived: boolean };
export type AgentChatMessage = { id: number; role: "user" | "assistant"; text: string; timestamp: number | null };
export type AgentHistoryResponse = {
  ok: true;
  source: "gateway";
  agentId: string;
  session: AgentChatSession;
  messages: AgentChatMessage[];
  truncated: boolean;
};
export type AgentChatResponse = AgentHistoryResponse & {
  status: "completed";
  reply: string;
};
export type AgentChatTurn = {
  turnId: string;
  state: "queued" | "accepted" | "streaming" | "complete" | "cancel_requested" | "cancelled" | "error";
  text: string;
  createdAt: number;
  updatedAt: number;
  reply?: string;
  error?: string;
};
export type AgentTurnAcceptedResponse = {
  ok: true;
  source: "gateway";
  status: "queued" | "accepted";
  agentId: string;
  session: AgentChatSession;
  turn: AgentChatTurn;
};
export type AgentTurnsResponse = { ok: true; source: "gateway"; agentId: string; sessionId: string; turns: AgentChatTurn[] };
export type AgentOnboardingOptions = {
  ok: true;
  source: "gateway+local";
  generatedAt: string;
  creationSupported: true;
  gatewayAppliedFields: string[];
  julieManagedFields: string[];
  policyNote: string;
  existingAgentIds: string[];
  defaultModel: string | null;
  roles: Array<{ id: string; label: string; description: string }>;
  schedules: Array<{ id: "always_available" | "weekdays" | "manual"; label: string; description: string }>;
  models: Array<{ id: string; provider: string; modelId: string; name: string; available: boolean; reasoning: boolean; contextWindow: number | null; input: string[] }>;
  tools: Array<{ id: string; name: string; description: string | null; group: string | null }>;
  skills: Array<{ id: string; name: string; description: string | null; emoji: string | null; eligible: boolean; reason: string | null }>;
  workspaces: Array<{ id: number; name: string; description: string }>;
};
export type AgentOnboardingInput = {
  name: string;
  role: string;
  personality: string;
  emoji: string;
  model: string;
  scheduleMode: "always_available" | "weekdays" | "manual";
  timezone: string;
  workspaceId: number | null;
  requestedTools: string[];
  requestedSkills: string[];
  confirmed: boolean;
};
export type AgentOnboardingResult = {
  ok: true;
  source: "gateway+local";
  agent: { id: string; name: string; model: string };
  applied: { gatewayCreated: true; profileSaved: boolean; soulSaved: boolean; capabilityPolicyChanged: false };
  onboardingRequests: { tools: number; skills: number };
  warnings: string[];
};
export type AgentUpdateInput = Omit<AgentOnboardingInput, "confirmed" | "workspaceId"> & { workspaceIds: number[]; updateSoul: boolean; confirmed: boolean };
export type AgentUpdateResult = {
  ok: true;
  source: "gateway+local";
  agentId: string;
  applied: { gatewayUpdated: boolean; profileSaved: boolean; soulSaved: boolean; soulSkipped: boolean; capabilityPolicyChanged: false };
  warnings: string[];
};
export type AgentAssignmentRow = {
  id: string;
  displayName: string;
  emoji: string | null;
  model: string | null;
  role: string | null;
  assigned: boolean;
  assignments: Array<{ id: number; name: string }>;
  shared: boolean;
  isDefault: boolean;
};
export type AgentAssignmentsResponse = {
  ok: true;
  source: "gateway+local";
  workspace: { id: number; name: string; description?: string };
  agents: AgentAssignmentRow[];
  summary: { assigned: number; unassigned: number; shared: number; gatewayRosterTotal: number };
};
export type AgentOrganizationLevel = "executive" | "lead" | "specialist";
export type AgentOrganizationMember = {
  agentId: string;
  displayName: string;
  gatewayIdentityName: string;
  emoji: string | null;
  model: string | null;
  role: string | null;
  department: string | null;
  reportsTo: string | null;
  level: AgentOrganizationLevel | null;
  configured: boolean;
  isDefault: boolean;
};
export type AgentOrganizationInput = {
  agentId: string;
  role: string;
  department: string;
  reportsTo: string;
  level: AgentOrganizationLevel;
};
export type AgentOrganizationResponse = {
  ok: true;
  source: "gateway+local";
  workspace: { id: number; name: string; description: string };
  owner: { id: "owner"; displayName: string; role: "CEO" };
  members: AgentOrganizationMember[];
  summary: {
    rosterMembers: number;
    configured: number;
    unconfigured: number;
    departments: number;
    leads: number;
    specialists: number;
    complete: boolean;
  };
};
export type AgentRoomMember = {
  agentId: string;
  displayName: string;
  emoji: string | null;
  identityState: "ready" | "unavailable";
  role: string | null;
  department: string | null;
  level: AgentOrganizationLevel | null;
  sortOrder: number;
  joinedAt: string;
};
export type AgentRoomMessage = {
  id: number;
  roomId: number;
  senderType: "owner" | "agent" | "system";
  senderId: string;
  text: string;
  deliveryState: "local" | "confirmed" | "failed";
  createdAt: string;
};
export type AgentRoomActiveRun = {
  state: "dispatching";
  startedAt: number;
  currentAgentId: string | null;
  recipients: string[];
  completed: number;
  failed: number;
  remaining: number;
};
export type AgentRoom = {
  id: number;
  workspaceId: number;
  task: null | { id: number; title: string; status: Task["status"] | null; assignedAgentId: string | null };
  kind: "task" | "department";
  department: string | null;
  title: string;
  status: "open" | "archived";
  members: AgentRoomMember[];
  messageCount: number;
  latestMessage: AgentRoomMessage | null;
  activeRun: AgentRoomActiveRun | null;
  createdAt: string;
  updatedAt: string;
};
export type AgentRoomDetail = AgentRoom & { messages: AgentRoomMessage[] };
export type AgentRoomsResponse = { ok: true; source: "local+gateway"; workspace: { id: number; name: string }; rooms: AgentRoom[] };
export type AgentRoomResponse = { ok: true; source: "local+gateway"; room: AgentRoomDetail };
export type AgentRoomSendResponse = { ok: true; status: "queued"; ownerMessage: AgentRoomMessage; activeRun: AgentRoomActiveRun };
export type AgentAvatarDirection = "synthetic_hologram" | "abstract_core" | "emblematic_guardian";
export type AgentAvatarPreviewInput = { direction: AgentAvatarDirection; ownerNotes: string };
export type AgentAvatarPreview = AgentAvatarPreviewInput & {
  prompt: string;
  promptHash: string;
  sources: string[];
  inferredAppearance: false;
  guardrail: string;
};
export type AgentAvatarCost = {
  state: "not_reported";
  estimateUsd: null;
  currency: "USD";
  mayCharge: true;
  disclosure: string;
  pricingUrl: string | null;
};
export type AgentAvatarModel = {
  id: string;
  ref: string;
  isDefault: boolean;
  generateMaxCount: number;
  supports: {
    size: boolean;
    aspectRatio: boolean;
    resolution: boolean;
    sizes: string[];
    aspectRatios: string[];
    resolutions: string[];
    formats: string[];
    qualities: string[];
    backgrounds: string[];
  };
  cost: AgentAvatarCost;
};
export type AgentAvatarProvider = {
  id: string;
  label: string;
  configured: boolean;
  runtimeState: "not_configured" | "not_supported" | "configured_unverified" | "last_attempt_failed" | "generation_succeeded";
  lastAttemptAt: string | null;
  unavailableReason: string | null;
  defaultModel: string | null;
  models: AgentAvatarModel[];
};
export type AgentAvatarAsset = {
  id: number;
  url: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  sizeBytes: number;
  sha256: string;
  provider: string;
  model: string;
  promptHash: string;
  cost: { state: "reported" | "not_reported"; usd: number | null };
  applied: boolean;
  createdAt: string;
  appliedAt: string | null;
  canApply: boolean;
};
export type AgentAvatarStudioResponse = {
  ok: true;
  source: "gateway+local";
  generatedAt: string;
  agent: { id: string; displayName: string; gatewayAvatarConfigured: boolean };
  readiness: { tool: "image_generate"; available: boolean; configuredProviderCount: number; verifiedUsableProviderCount: number; failedProviderCount: number; policy: string };
  providers: AgentAvatarProvider[];
  directions: Array<{ id: AgentAvatarDirection; label: string; description: string }>;
  preview: AgentAvatarPreview;
  fallback: { kind: "deterministic_svg"; url: string; billed: false; inferredAppearance: false };
  assets: AgentAvatarAsset[];
  activeAsset: AgentAvatarAsset | null;
  models3d: AgentAvatarModel3D[];
  model3dBoundary: string;
};
export type AgentAvatarPreviewResponse = {
  ok: true;
  source: "gateway+local";
  preview: AgentAvatarPreview;
  fallback: AgentAvatarStudioResponse["fallback"];
};
export type AgentAvatarGenerateInput = AgentAvatarPreviewInput & {
  promptHash: string;
  provider: string;
  model: string;
  confirmed: boolean;
  costAcknowledged: boolean;
};
export type AgentAvatarGenerateResult = {
  ok: true;
  source: "gateway+local";
  status: "stored";
  applied: false;
  provider: { id: string; label: string };
  model: string;
  promptHash: string;
  asset: AgentAvatarAsset;
  disclosure: string;
};
export type AgentAvatarApplyResult = {
  ok: true;
  source: "gateway+local";
  agentId: string;
  applied: true;
  asset: AgentAvatarAsset;
};
export type AgentAvatarImportResult = {
  ok: true;
  source: "local";
  status: "stored";
  applied: false;
  asset: AgentAvatarAsset;
  disclosure: string;
};
export type AgentAvatarUrlApplyResult = {
  ok: true;
  source: "gateway+owner_input";
  agentId: string;
  applied: true;
  kind: "https_image_url";
  host: string;
  disclosure: string;
};
export type AgentAvatarModel3D = {
  id: number;
  sourceType: "upload" | "https_url";
  url: string;
  mimeType: "model/gltf-binary";
  sizeBytes: number | null;
  sha256: string | null;
  createdAt: string;
  gatewayCompatible: false;
  viewerState: "not_configured";
};
export type AgentAvatarModelResult = {
  ok: true;
  source: "local" | "owner_input";
  model: AgentAvatarModel3D;
  boundary: string;
};
export type Tool = { id: string; name?: string; description?: string; status?: string; [key: string]: unknown };
export type Analytics = {
  tasksByStatus: Array<{ status: string; count: number }>;
  taskRunsPerDay: Array<{ day: string; count: number }>;
  messagesPerDay: Array<{ day: string; count: number }>;
  conversationCount: number;
  gatewaySessions: number;
  taskCount: number;
};

export type Workspace = { id: number; name: string; description: string };
export type Task = {
  id: number;
  workspace_id: number;
  title: string;
  description: string;
  status: (typeof TASK_STATUSES)[number];
  priority: 1 | 2 | 3;
  assigned_agent_id: string;
  session_linked: boolean;
  last_run_output?: string;
  run_started_at?: string | null;
  created_at: string;
  updated_at: string;
};
export type TaskCreateInput = {
  workspaceId: number;
  title: string;
  description?: string;
  status?: (typeof TASK_STATUSES)[number];
  priority?: 1 | 2 | 3;
  assignedAgentId?: string | null;
};
export type TaskActivity = {
  id: number;
  task_id: number;
  actor_type: "owner" | "agent" | "system";
  actor_id: string;
  event_type: string;
  details: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
};
export type TaskActivityResponse = { ok: true; activity: TaskActivity[]; source: "local" };
export type Conversation = { id: number; workspace_id: number; title: string; created_at: string; updated_at: string };
export type Message = { id: number; role: string; text: string; delivery_state: "queued" | "sending" | "accepted" | "complete" | "cancelled" | "failed"; created_at: string };
export type GatewayStatus = { connected: boolean; serverVersion?: string | null; latencyMs?: number; error?: string };

export type WeatherForecastDay = { day: string; tempC: number; minC: number; icon: string };
export type Weather = {
  ok: true;
  city: string;
  tempC: number;
  condition: string;
  humidity: number;
  windKph: number;
  forecast: WeatherForecastDay[];
  fetchedAt: string;
  source: string;
};
export type Device = { id: string; name: string; connected: boolean; detail: string; lastSeenAtMs: number | null };
export type Devices = { ok: boolean; source: string; error?: string; devices: Device[] };
export type TrendingItem = {
  id: number;
  title: string;
  url: string;
  thumbnail: string;
  category: string;
  readTimeMinutes: number;
  publishedAt: string;
  reactions: number;
};
export type TrendingResponse = { ok: true; items: TrendingItem[]; fetchedAt: string; source: string };
export type Insights = {
  spark: Array<{ day: string; count: number }>;
  productivity: {
    today: number;
    yesterday: number;
    pct: number | null;
    completedToday: number;
    evidencedRunsToday: number;
  };
  score: number | null;
  totals: { totalTasks: number; doneTasks: number; inProgressTasks: number };
};

// --- OpenCode bridge (real service data; read-only) ---
export type OpencodeStatus = {
  ok: boolean;
  available: boolean;
  version: string | null;
  pid: number | null;
  webUiUrl: string | null;
  checkedAt: string;
  error?: string;
};
export type OpencodeSessionRow = {
  id: string;
  title: string | null;
  agent: string | null;
  model: { providerID: string | null; id: string | null };
  cost: number | null;
  tokens: { input: number | null; output: number | null; reasoning: number | null; cacheRead: number | null; cacheWrite: number | null };
  outcome: string | null;
  time: { created: number | null; updated: number | null };
};
export type OpencodeSessionsResponse = { ok: boolean; sessions: OpencodeSessionRow[]; error?: string; source: string };
export type OpencodePart =
  | { type: "text" | "reasoning"; text: string; truncated: boolean }
  | { type: "tool"; name: string | null; executed: boolean; state: { status: string | null; input: string | null; output: string | null } }
  | { type: string; preview: string };
export type OpencodeMessageRow = {
  id: string | null;
  type: string | null;
  agent: string | null;
  model: { providerID: string | null; id: string | null };
  tokens: { input: number | null; output: number | null; reasoning: number | null; cacheRead: number | null; cacheWrite: number | null };
  cost: number | null;
  time: { created: number | null; updated: number | null };
  text: string | null;
  parts: OpencodePart[];
};
export type OpencodeMessagesResponse = { ok: boolean; messages: OpencodeMessageRow[]; error?: string; source: string };
export type OpencodeStatsResponse = {
  ok: boolean;
  stats: {
    range: { from: number | null; to: number | null };
    sessions: number;
    subagents: number;
    prompts: number;
    steps: number;
    tokens: { input: number | null; output: number | null; reasoning: number | null; cacheRead: number | null; cacheWrite: number | null };
    cost: number | null;
    tools: { calls: number; succeeded: number; failed: number; unfinished: number };
    activeDays: number;
    streak: number;
    activity: Array<{ date: string; steps: number }>;
    models: Array<{ model: { providerID: string | null; id: string | null }; steps: number; tokens: { input: number | null; output: number | null; reasoning: number | null; cacheRead: number | null; cacheWrite: number | null }; cost: number | null }>;
  } | null;
  error?: string;
  source: string;
};
export type OpencodeActiveResponse = { ok: boolean; active: Array<{ id: string; state: string | null }>; error?: string; source: string };
export type OpencodeProjectRow = {
  id: string | null;
  name: string;
  vcs: string | null;
  created: number | null;
  updated: number | null;
  lastActive: number | null;
  sandboxes: number;
  sessions: number;
};
export type OpencodeProjectsResponse = {
  ok: boolean;
  projects: OpencodeProjectRow[];
  coverage: { projects: number; sessionsScanned: number };
  error?: string;
  source: string;
};

// --- Projects ---
export type ProjectAgent = {
  id: string;
  humanName: string;
  role: string;
};
export type Project = {
  id: number;
  slug: string;
  name: string;
  path: string;
  description: string;
  workspace_id: number | null;
  port: number | null;
  team_mode: "inherit" | "custom";
  process_status: "stopped" | "starting" | "running" | "stopping" | "failed";
  process_pid: number | null;
  process_command: string;
  last_started_at: string | null;
  last_stopped_at: string | null;
  last_error: string;
  created_at: string;
  updated_at: string;
  kind: "node" | "static" | "unknown";
  framework: string;
  package_manager: string | null;
  dev_script: string | null;
  build_script: string | null;
  node_modules: boolean;
  exists: boolean;
  workspace_name: string | null;
  agent_ids: string[];
  agents: ProjectAgent[];
  team_source: "project" | "workspace";
  local_url: string | null;
  subpath_url: string;
  uptime_seconds: number | null;
};
export type ProjectsResponse = { ok: true; projects: Project[] };
export type ProjectDirsResponse = { ok: true; dirs: string[] };
export type ProjectResponse = { ok: true; project: Project };
export type ProjectUpdateInput = {
  workspaceId?: number | null;
  teamMode?: "inherit" | "custom";
  agentIds?: string[];
  port?: number | null;
  description?: string;
};
export type ProjectLogsResponse = { ok: true; slug: string; lines: string[]; source: string };

// --- Feature Lab ---
export type FeatureIdea = {
  id: number;
  title: string;
  description: string;
  category: string;
  source: "owner" | "julie" | "agent" | "system";
  status: "proposed" | "planned" | "in_progress" | "shipped" | "declined";
  votes: number;
  task_id: number | null;
  created_at: string;
  updated_at: string;
};
export type FeatureIdeasResponse = { ok: true; ideas: FeatureIdea[] };
export type FeatureIdeaResponse = { ok: true; idea: FeatureIdea };
export type FeatureIdeaCreateInput = {
  title: string;
  description?: string;
  category?: string;
  source?: "owner" | "julie" | "agent" | "system";
};
export type FeatureIdeaPatch = {
  title?: string;
  description?: string;
  category?: string;
  status?: "proposed" | "planned" | "in_progress" | "shipped" | "declined";
};

// --- Settings ---
export type SettingsHealthResponse = {
  ok: true;
  health: {
    uptime_seconds: number;
    memory_mb: number;
    data_dir: string;
    db_exists: boolean;
    db_size_bytes: number;
    backup_count: number;
    latest_backup: { file: string; size: number; created_at: string } | null;
    gateway: { connected: boolean; serverVersion?: string | null; latencyMs?: number; error?: string };
    node_version: string;
    schema_version: number;
    terminal_enabled: boolean;
    restore_pending: string | null;
  };
};
export type SettingsBackupResponse = {
  ok: true;
  backup: { file: string; path: string; size: number; created_at: string };
};
export type SettingsBackupsResponse = { ok: true; backups: Array<{ file: string; size: number; created_at: string }> };
export type SettingsRestoreResponse = {
  ok: true;
  staged: true;
  restartRequired: boolean;
  note: string;
};
export type SettingsResponse = { ok: true; settings: Record<string, string> };
export type EngineeringPolicyResponse = {
  ok: true;
  source: "local";
  policy: { primary: string; fallback: string; department: string; note: string };
};

// --- Profile ---
export type ProfileStatsResponse = {
  ok: true;
  stats: {
    workspaces: number;
    tasks: number;
    tasks_done: number;
    tasks_running: number;
    conversations: number;
    messages: number;
    projects: number;
    projects_running: number;
    agents: number;
    ideas: number;
    ideas_planned: number;
  };
};
export type ProfileActivityResponse = {
  ok: true;
  activity: Array<{
    id: number;
    task_id: number;
    actor_type: "owner" | "agent" | "system";
    actor_id: string;
    event_type: string;
    details: string;
    from_status: string | null;
    to_status: string | null;
    created_at: string;
    task_title: string | null;
  }>;
};
export type ProfileSessionsResponse = {
  ok: true;
  sessions: Array<{
    id: number;
    title: string;
    gateway_session_key: string;
    workspace_id: number;
    created_at: string;
    updated_at: string;
    workspace_name: string | null;
  }>;
};

export const TASK_STATUSES = ["backlog", "ready", "in_progress", "waiting_input", "pending_review", "done", "blocked"] as const;
