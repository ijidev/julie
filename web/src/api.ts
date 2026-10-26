// API client. All calls go to same-origin /api (served by the Express process).
async function jfetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error ?? `HTTP ${res.status}`), { status: res.status, body });
  return body;
}

export const api = {
  session: () => jfetch("/api/session"),
  login: (password: string) => jfetch("/api/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => jfetch("/api/logout", { method: "POST" }),
  gatewayStatus: () => jfetch("/api/gateway/status"),
  workspaces: () => jfetch("/api/workspaces"),
  createWorkspace: (name: string, description = "") => jfetch("/api/workspaces", { method: "POST", body: JSON.stringify({ name, description }) }),
  activateWorkspace: (id: number) => jfetch(`/api/workspaces/${id}/activate`, { method: "POST" }),
  tasks: (workspaceId: number) => jfetch(`/api/tasks?workspaceId=${workspaceId}`),
  createTask: (workspaceId: number, title: string, status = "backlog") => jfetch("/api/tasks", { method: "POST", body: JSON.stringify({ workspaceId, title, status }) }),
  updateTask: (id: number, patch: Record<string, unknown>) => jfetch(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteTask: (id: number) => jfetch(`/api/tasks/${id}`, { method: "DELETE" }),
  runTask: (id: number) => jfetch(`/api/tasks/${id}/run`, { method: "POST", body: JSON.stringify({}) }),
  conversations: (workspaceId: number) => jfetch(`/api/conversations?workspaceId=${workspaceId}`),
  createConversation: (workspaceId: number, title: string) => jfetch("/api/conversations", { method: "POST", body: JSON.stringify({ workspaceId, title }) }),
  messages: (conversationId: number) => jfetch(`/api/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: number, text: string) => jfetch(`/api/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify({ text }) }),
};

export type Workspace = { id: number; name: string; description: string };
export type Task = { id: number; workspace_id: number; title: string; description: string; status: string; priority: number; gateway_session_key?: string; last_run_output?: string; run_started_at?: string | null; updated_at: string };
export type Conversation = { id: number; workspace_id: number; title: string; gateway_session_key: string; updated_at: string };
export type Message = { id: number; role: string; text: string; created_at: string };
export type GatewayStatus = { connected: boolean; serverVersion?: string | null; latencyMs?: number; error?: string };

export const TASK_STATUSES = ["backlog", "ready", "in_progress", "waiting_input", "pending_review", "done", "blocked"] as const;