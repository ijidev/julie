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

export type WorkspacesResponse = { ok: boolean; workspaces: Workspace[]; activeWorkspaceId: number | null };
export type WorkspaceCreatedResponse = { ok: boolean; workspace: Workspace };
export type WorkspaceActivatedResponse = { ok: boolean; activeWorkspaceId: number };
export type TasksResponse = { ok: boolean; tasks: Task[]; runningTaskIds: number[] };
export type ConversationsResponse = { ok: boolean; conversations: Conversation[] };
export type ConversationCreatedResponse = { ok: boolean; conversation: Conversation };
export type MessagesResponse = { ok: boolean; messages: Message[]; gatewaySessionKey: string };
export type InsightsResponse = { ok: boolean; insights: Insights };

export const api = {
  session: () => jfetch("/api/session"),
  login: (password: string) => jfetch("/api/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => jfetch("/api/logout", { method: "POST" }),
  gatewayStatus: () => jfetch<GatewayStatus>("/api/gateway/status"),
  workspaces: () => jfetch<WorkspacesResponse>("/api/workspaces"),
  createWorkspace: (name: string, description = "") => jfetch<WorkspaceCreatedResponse>("/api/workspaces", { method: "POST", body: JSON.stringify({ name, description }) }),
  activateWorkspace: (id: number) => jfetch<WorkspaceActivatedResponse>(`/api/workspaces/${id}/activate`, { method: "POST" }),
  tasks: (workspaceId: number) => jfetch<TasksResponse>(`/api/tasks?workspaceId=${workspaceId}`),
  createTask: (workspaceId: number, title: string, status = "backlog") => jfetch("/api/tasks", { method: "POST", body: JSON.stringify({ workspaceId, title, status }) }),
  updateTask: (id: number, patch: Record<string, unknown>) => jfetch(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteTask: (id: number) => jfetch(`/api/tasks/${id}`, { method: "DELETE" }),
  runTask: (id: number) => jfetch(`/api/tasks/${id}/run`, { method: "POST", body: JSON.stringify({}) }),
  conversations: (workspaceId: number) => jfetch<ConversationsResponse>(`/api/conversations?workspaceId=${workspaceId}`),
  createConversation: (workspaceId: number, title: string) => jfetch<ConversationCreatedResponse>("/api/conversations", { method: "POST", body: JSON.stringify({ workspaceId, title }) }),
  messages: (conversationId: number) => jfetch<MessagesResponse>(`/api/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: number, text: string) => jfetch(`/api/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify({ text }) }),
  agents: () => jfetch("/api/agents"),
  agentOverview: (refresh = false) => jfetch<AgentOverviewResponse>(`/api/agents/overview${refresh ? "?refresh=1" : ""}`),
  agentDetail: (id: string, refresh = false) => jfetch<AgentDetailResponse>(`/api/agents/${encodeURIComponent(id)}${refresh ? "?refresh=1" : ""}`),
  updateAgent: (id: string, input: AgentUpdateInput) => jfetch<AgentUpdateResult>(`/api/agents/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }),
  agentHistory: (id: string, sessionId: string) => jfetch<AgentHistoryResponse>(`/api/agents/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sessionId)}/history`),
  sendAgentMessage: (id: string, text: string, sessionId: string | null) => jfetch<AgentChatResponse>(`/api/agents/${encodeURIComponent(id)}/chat`, { method: "POST", body: JSON.stringify({ text, sessionId }) }),
  agentOnboardingOptions: (refresh = false) => jfetch<AgentOnboardingOptions>(`/api/agents/onboarding/options${refresh ? "?refresh=1" : ""}`),
  createAgent: (input: AgentOnboardingInput) => jfetch<AgentOnboardingResult>("/api/agents", { method: "POST", body: JSON.stringify(input) }),
  agentAssignments: (workspaceId?: number) => jfetch<AgentAssignmentsResponse>(`/api/agents/assignments${workspaceId ? `?workspaceId=${workspaceId}` : ""}`),
  setAgentAssignments: (workspaceId: number, agentIds: string[]) => jfetch<AgentAssignmentsResponse>("/api/agents/assignments", { method: "PUT", body: JSON.stringify({ workspaceId, agentIds, confirmed: true }) }),
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
  devices: () => jfetch("/api/devices"),
  insights: () => jfetch<InsightsResponse>("/api/insights"),
  promptUsage: (limit = 3) => jfetch<{ ok: boolean; prompts: Array<{ prompt_hash: string; prompt: string; uses: number; last_used: string }>; total: number }>(`/api/prompt-usage?limit=${limit}`),
  avatar: () => jfetch<{ ok: boolean; avatar: string | null }>("/api/settings/avatar"),
  setAvatar: (image: string | null) => jfetch<{ ok: boolean; avatar: string | null }>("/api/settings/avatar", { method: "PUT", body: JSON.stringify({ image }) }),
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
    currentTask: null;
    taskState: "not_linked";
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
    policies: { membership: "explicit"; sharedAgents: number; taskAssignment: "not_configured"; projectAccess: "not_configured" };
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
    taskHistory: { state: "not_linked"; items: never[]; reason: string };
  };
};
export type AgentChatSession = {
  sessionId: string | null;
  displayName: string;
  status: string | null;
  hasActiveRun: boolean;
  lastActivityAt: number | null;
  model: string | null;
};
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
  models3d: AgentAvatarModel[];
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
export type AgentAvatarModel = {
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
  model: AgentAvatarModel;
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
export type Task = { id: number; workspace_id: number; title: string; description: string; status: string; priority: number; gateway_session_key?: string; last_run_output?: string; run_started_at?: string | null; created_at: string; updated_at: string };
export type Conversation = { id: number; workspace_id: number; title: string; gateway_session_key: string; updated_at: string };
export type Message = { id: number; role: string; text: string; created_at: string };
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

export const TASK_STATUSES = ["backlog", "ready", "in_progress", "waiting_input", "pending_review", "done", "blocked"] as const;
