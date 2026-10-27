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

export type WorkspacesResponse = { ok: boolean; workspaces: Workspace[]; activeWorkspaceId: number | null };
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
  createWorkspace: (name: string, description = "") => jfetch("/api/workspaces", { method: "POST", body: JSON.stringify({ name, description }) }),
  activateWorkspace: (id: number) => jfetch(`/api/workspaces/${id}/activate`, { method: "POST" }),
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
