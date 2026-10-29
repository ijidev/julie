// OpenClaw Gateway integration adapter.
// Real interface, per installed OpenClaw 2026.10.5 docs (docs/gateway/protocol/*):
//  - Transport: WebSocket ws://127.0.0.1:18789 (HTTP+WS multiplex port)
//  - Handshake: connect.challenge event -> connect req with Ed25519 device identity
//    (device.id = sha256(raw pubkey) hex, signature over v3 payload, signedAt = challenge ts)
//  - Auth: gateway shared token (OPENCLAW_GATEWAY_TOKEN of the running gateway process)
//  - Chat: RPC chat.send { sessionKey, message, idempotencyKey }, completion detected via
//    chat events (state "final") with chat.history polling fallback.
// Session keys use agent-qualified form: agent:main:julie-conv-<id> (avoids reserved namespaces).
import WebSocket from "ws";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

interface DeviceIdentity {
  deviceId: string;
  publicKeyB64u: string;
  privateKeyPem: string;
}

function loadOrCreateDeviceIdentity(): DeviceIdentity {
  fs.mkdirSync(path.dirname(config.deviceIdentityPath), { recursive: true });
  if (fs.existsSync(config.deviceIdentityPath)) {
    return JSON.parse(fs.readFileSync(config.deviceIdentityPath, "utf8")) as DeviceIdentity;
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pubRaw = publicKey.export({ type: "spki", format: "der" }).subarray(12); // strip 12-byte SPKI header -> 32 raw bytes
  const identity: DeviceIdentity = {
    deviceId: crypto.createHash("sha256").update(pubRaw).digest("hex"),
    publicKeyB64u: pubRaw.toString("base64url"),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
  fs.writeFileSync(config.deviceIdentityPath, JSON.stringify(identity), { mode: 0o600 });
  return identity;
}

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

export interface GatewayStatus {
  connected: boolean;
  serverVersion?: string;
  protocol?: number;
  latencyMs?: number;
  error?: string;
}

export interface GatewayAgentIdentity {
  name?: string;
  theme?: string;
  emoji?: string;
  avatar?: string;
}

export interface GatewayAgent {
  id: string;
  name?: string;
  identity?: GatewayAgentIdentity;
  model?: string | { primary?: string; fallbacks?: string[] };
  utilityModel?: string;
  agentRuntime?: { id?: string; source?: string; cloudPlacementSupported?: boolean; devicePlacementSupported?: boolean };
  thinkingDefault?: string;
  defaultPermissionMode?: string;
  workspaceGit?: boolean;
  createdVia?: string;
  creatorAgentId?: string | null;
  createdAt?: number;
  kind?: string;
  [key: string]: unknown;
}

export interface GatewayAgentRoster {
  agents: GatewayAgent[];
  defaultId?: string;
  mainKey?: string;
  ownership?: string;
  scope?: string;
  selectionRequired?: boolean;
}

export interface GatewayChatAttachment {
  type: "image" | "file";
  mimeType: string;
  fileName: string;
  origin: "file";
  content: string;
  sizeBytes: number;
}

interface ChatEventPayload {
  runId?: string;
  sessionKey?: string;
  state?: string;
  message?: { role: string; content?: unknown };
  deltaText?: string;
  replace?: boolean;
  phase?: string;
  retry?: { attempt?: number; maxAttempts?: number; reason?: string };
  seq?: number;
  errorMessage?: string;
  errorKind?: string;
  stopReason?: string;
}

// Reduced chat-stream event forwarded to SSE subscribers.
export interface ChatStreamEvent {
  sessionKey?: string;
  state: "status" | "delta" | "final" | "aborted" | "error";
  runId?: string;
  seq?: number;
  phase?: string;
  retry?: { attempt?: number; maxAttempts?: number; reason?: string };
  deltaText?: string; // append payload (delta state)
  replace: boolean; // deltaText is a full replacement, not an append
  snapshot: string | null; // authoritative full text when a message snapshot was present
  text: string | null; // full final text on final state
  errorMessage?: string;
  errorKind?: string;
  stopReason?: string;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const row = part as { type?: unknown; text?: unknown; content?: unknown };
        if ((row.type === "text" || row.type === "input_text" || row.type === "output_text") && typeof row.text === "string") return row.text;
        return row.content !== undefined ? extractText(row.content) : "";
      })
      .join("")
      .trim();
  }
  if (content && typeof content === "object") {
    const row = content as { text?: unknown; content?: unknown };
    if (typeof row.text === "string") return row.text.trim();
    if (row.content !== undefined) return extractText(row.content);
  }
  return "";
}

export class GatewayClient {
  private ws: WebSocket | null = null;
  private identity = loadOrCreateDeviceIdentity();
  private pending = new Map<string, Pending>();
  private reqSeq = 0;
  private connecting: Promise<void> | null = null;
  private status: GatewayStatus = { connected: false };
  private eventListeners: Array<(event: string, payload: any) => void> = [];
  private closedByUs = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  onEvent(listener: (event: string, payload: any) => void): void {
    this.eventListeners.push(listener);
  }

  // Subscribe to reduced gateway chat stream events (deltas, finals, errors).
  // Returns an unsubscribe function. Listener errors must not affect the socket.
  subscribeChat(handler: (e: ChatStreamEvent) => void): () => void {
    const listener = (event: string, payload: ChatEventPayload) => {
      if (event !== "chat") return;
      const state = payload?.state;
      if (state === "status") {
        handler({
          sessionKey: payload.sessionKey,
          state: "status",
          runId: payload.runId,
          seq: payload.seq,
          phase: payload.phase,
          retry: payload.retry,
          replace: false,
          snapshot: null,
          text: null,
        });
      } else if (state === "delta") {
        // Per protocol: a message snapshot on a frame is authoritative and already
        // includes deltaText — never append on top of a snapshot.
        const hasSnapshot = payload.message?.content !== undefined && extractText(payload.message.content).length > 0;
        handler({
          sessionKey: payload.sessionKey,
          state: "delta",
          runId: payload.runId,
          seq: payload.seq,
          deltaText: payload.deltaText,
          replace: payload.replace === true,
          snapshot: hasSnapshot ? extractText(payload.message?.content) : null,
          text: null,
        });
      } else if (state === "final" || state === "aborted" || state === "error") {
        handler({
          sessionKey: payload.sessionKey,
          state,
          runId: payload.runId,
          seq: payload.seq,
          deltaText: undefined,
          replace: false,
          snapshot: null,
          text: state === "final" ? extractText(payload.message?.content) : null,
          errorMessage: payload.errorMessage,
          errorKind: payload.errorKind,
          stopReason: payload.stopReason,
        });
      }
    };
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter((l) => l !== listener);
    };
  }

  getStatus(): GatewayStatus {
    return { ...this.status };
  }

  async ensureConnected(): Promise<void> {
    if (this.ws && this.ws.readyState === 1) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.connect().finally(() => (this.connecting = null));
    return this.connecting;
  }

  private connect(): Promise<void> {
    this.closedByUs = false;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(config.gatewayUrl) as WebSocket & { __helloId?: string };
      this.ws = ws;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        this.status = { connected: false, error: err.message };
        reject(err);
      };
      const timeout = setTimeout(() => fail(new Error("gateway handshake timeout")), 15000);

      ws.on("error", (e: Error) => fail(new Error(`gateway ws error: ${e.message}`)));
      ws.on("close", () => {
        clearTimeout(timeout);
        this.status = { connected: false };
        for (const p of this.pending.values()) {
          clearTimeout(p.timer);
          p.reject(new Error("gateway connection closed"));
        }
        this.pending.clear();
        if (!this.closedByUs) this.scheduleReconnect();
        if (!settled) { settled = true; reject(new Error("gateway connection closed during handshake")); }
      });
      ws.on("message", (raw: unknown) => {
        let frame: any;
        try { frame = JSON.parse(String(raw)); } catch { return; }
        if (frame.type === "event" && frame.event === "connect.challenge") {
          ws.send(JSON.stringify(this.buildConnectFrame(frame.payload)));
          return;
        }
        if (frame.type === "res" && this.pending.has(frame.id)) {
          const p = this.pending.get(frame.id)!;
          this.pending.delete(frame.id);
          clearTimeout(p.timer);
          if (frame.ok) p.resolve(frame.payload);
          else p.reject(new Error(`gateway rpc ${frame.error?.code ?? "ERROR"}: ${frame.error?.message ?? "unknown"}`));
          return;
        }
        if (frame.type === "event") {
          for (const l of this.eventListeners) {
            try { l(frame.event, frame.payload); } catch { /* listener errors must not kill the socket */ }
          }
        }
      });
      ws.on("open", () => { /* wait for challenge */ });
      // resolve when hello-ok arrives (handled via pending 'connect' req id)
      const helloId = `c${++this.reqSeq}`;
      this.pending.set(helloId, {
        resolve: (payload: any) => {
          clearTimeout(timeout);
          settled = true;
          this.status = {
            connected: true,
            serverVersion: payload?.server?.version,
            protocol: payload?.protocol,
          };
          resolve();
        },
        reject: (e) => fail(e),
        timer: setTimeout(() => {}, 0),
      });
      // buildConnectFrame must use helloId
      (ws as any).__helloId = helloId;
    });
  }

  private buildConnectFrame(challenge: { nonce: string; ts: number }): any {
    const scopes = ["operator.read", "operator.write", "operator.admin"];
    const platform = "linux";
    const payload = [
      "v3",
      this.identity.deviceId,
      "gateway-client",
      "backend",
      "operator",
      scopes.join(","),
      String(challenge.ts),
      config.gatewayToken,
      challenge.nonce,
      platform.toLowerCase(),
      "",
    ].join("|");
    const signature = crypto
      .sign(null, Buffer.from(payload, "utf8"), { key: this.identity.privateKeyPem, format: "pem", type: "pkcs8" })
      .toString("base64url");
    const helloId = (this.ws as any)?.__helloId ?? `c0`;
    return {
      type: "req",
      id: helloId,
      method: "connect",
      params: {
        minProtocol: 4,
        maxProtocol: 4,
        client: { id: "gateway-client", version: "0.1.0", platform, mode: "backend" },
        role: "operator",
        scopes,
        caps: [],
        commands: [],
        permissions: {},
        auth: { token: config.gatewayToken },
        locale: "en-US",
        userAgent: "julie-ai-os/0.1.0",
        device: {
          id: this.identity.deviceId,
          publicKey: this.identity.publicKeyB64u,
          signature,
          signedAt: challenge.ts,
          nonce: challenge.nonce,
        },
      },
    };
  }

  private rpc<T = any>(method: string, params: any, timeoutMs = 30000): Promise<T> {
    if (!this.ws || this.ws.readyState !== 1) return Promise.reject(new Error("gateway not connected"));
    const id = `r${++this.reqSeq}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`gateway rpc timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify({ type: "req", id, method, params }));
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected().catch(() => { /* status already updated; retried on next use */ });
    }, 5000);
  }

  async checkConnection(): Promise<GatewayStatus> {
    const start = Date.now();
    try {
      await this.ensureConnected();
      // Live liveness proof through a documented cheap read RPC. The previous
      // system.get-health probe is not implemented by Gateway 2026.10.5 and
      // produced an INVALID_REQUEST log every 30 seconds before this fallback.
      await this.rpc("sessions.list", { limit: 1 }, 10000);
      return { ...this.status, latencyMs: Date.now() - start };
    } catch (e: any) {
      return { connected: false, error: e.message };
    }
  }

  // Submit a chat turn and return as soon as the Gateway acknowledges it.
  // Callers that own UI state can stream events and persist the final reply
  // without holding an HTTP request open for the entire agent run.
  async startChat(
    sessionKey: string,
    message: string,
    attachments: GatewayChatAttachment[] = [],
    idempotencyKey = `julie-${crypto.randomBytes(8).toString("hex")}`
  ): Promise<{ runId: string; status: string; startedAt: number }> {
    await this.ensureConnected();
    const startedAt = Date.now();
    const sendRes = await this.rpc<{ runId?: string; status?: string; runStarted?: boolean }>(
      "chat.send", {
        sessionKey,
        message,
        idempotencyKey,
        ...(attachments.length > 0 ? { attachments } : {}),
      }, 60000
    );
    return {
      runId: sendRes?.runId ?? idempotencyKey,
      status: sendRes?.status ?? "started",
      startedAt,
    };
  }

  // Submit a chat turn and wait for the agent's final assistant text. This
  // remains the convenience path for task automation and agent-profile chat.
  async chat(
    sessionKey: string,
    message: string,
    timeoutMs = 180000,
    attachments: GatewayChatAttachment[] = []
  ): Promise<{ runId?: string; text: string }> {
    const started = await this.startChat(sessionKey, message, attachments);
    return await this.waitForChatReply(sessionKey, started.runId, timeoutMs, message, started.startedAt);
  }

  waitForChatReply(
    sessionKey: string,
    runId: string | undefined,
    timeoutMs: number,
    expectedUserMessage = "",
    startedAt = Date.now()
  ): Promise<{ runId?: string; text: string }> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let observedExpectedUser = false;
      const expected = expectedUserMessage.trim().replace(/\s+/g, " ");
      const finishOk = (text: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ runId, text });
      };
      const finishErr = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };
      const listener = (event: string, payload: ChatEventPayload) => {
        if (event !== "chat") return;
        if (payload?.sessionKey !== sessionKey) return;
        if (runId && payload.runId && payload.runId !== runId) return;
        if (payload.state === "final") {
          const text = extractText(payload.message?.content);
          if (text) finishOk(text);
        } else if (payload.state === "error" || payload.state === "aborted") {
          finishErr(new Error(payload.errorMessage || payload.stopReason || (payload.state === "aborted" ? "chat run aborted" : "chat run failed")));
        }
      };
      this.onEvent(listener);
      const poll = setInterval(async () => {
        try {
          const h = await this.rpc<{ messages?: Array<{ role: string; content?: unknown; timestamp?: number }> }>(
            "chat.history", { sessionKey }, 15000
          );
          const rows = h.messages ?? [];
          const last = rows[rows.length - 1];
          let precedingUser: { role: string; content?: unknown; timestamp?: number } | undefined;
          for (let index = rows.length - 2; index >= 0; index--) {
            if (rows[index]?.role === "user") {
              precedingUser = rows[index];
              break;
            }
          }
          const userText = precedingUser ? extractText(precedingUser.content).replace(/\s+/g, " ") : "";
          const userMatches = Boolean(expected && userText.includes(expected));
          if (last?.role === "user") {
            const latestUserText = extractText(last.content).replace(/\s+/g, " ");
            if (!expected || latestUserText.includes(expected)) observedExpectedUser = true;
          }
          if (last?.role === "assistant") {
            const text = extractText(last.content);
            const rawTimestamp = typeof last.timestamp === "number" ? last.timestamp : 0;
            const timestampMs = rawTimestamp > 0 && rawTimestamp < 10_000_000_000 ? rawTimestamp * 1000 : rawTimestamp;
            const recent = timestampMs >= startedAt - 5000;
            if (text && (recent || userMatches || observedExpectedUser)) finishOk(text);
          }
        } catch { /* transient poll failure: keep waiting */ }
      }, 3000);
      const timeout = setTimeout(() => finishErr(new Error("chat reply timeout")), timeoutMs);
      const cleanup = () => {
        this.eventListeners = this.eventListeners.filter((l) => l !== listener);
        clearInterval(poll);
        clearTimeout(timeout);
      };
    });
  }

  async chatHistory(sessionKey: string): Promise<Array<{ role: string; text: string; timestamp?: number }>> {
    await this.ensureConnected();
    const h = await this.rpc<{ messages?: Array<{ role: string; content?: unknown; timestamp?: number }> }>(
      "chat.history", { sessionKey }, 15000
    );
    return (h.messages ?? []).map((m) => ({ role: m.role, text: extractText(m.content), timestamp: m.timestamp }));
  }

  async getAgentRoster(): Promise<GatewayAgentRoster> {
    await this.ensureConnected();
    try {
      const res = await this.rpc<any>("agents.list", {}, 15000);
      if (Array.isArray(res)) return { agents: res };
      return {
        agents: Array.isArray(res?.agents) ? res.agents : [],
        defaultId: typeof res?.defaultId === "string" ? res.defaultId : undefined,
        mainKey: typeof res?.mainKey === "string" ? res.mainKey : undefined,
        ownership: typeof res?.ownership === "string" ? res.ownership : undefined,
        scope: typeof res?.scope === "string" ? res.scope : undefined,
        selectionRequired: typeof res?.selectionRequired === "boolean" ? res.selectionRequired : undefined,
      };
    } catch {
      try {
        const res = await this.rpc<any>("sessions.list", {}, 15000);
        const sessions = Array.isArray(res) ? res : (res?.sessions ?? []);
        return { agents: sessions.map((s: any) => ({
          id: s.key ?? s.id,
          name: s.agentId ?? s.name ?? s.key,
          status: s.status ?? "unknown",
          model: s.model ?? "unknown",
        })) };
      } catch (e: any) {
        throw new Error(`Gateway agents listing unavailable: ${e.message}`);
      }
    }
  }

  async listAgents(): Promise<GatewayAgent[]> {
    return (await this.getAgentRoster()).agents;
  }

  async listTools(agentId = "main"): Promise<Array<{ id: string; name?: string; description?: string; status?: string; group?: string }>> {
    await this.ensureConnected();
    try {
      const res = await this.rpc<any>("tools.catalog", { agentId, includePlugins: true }, 15000);
      if (Array.isArray(res?.groups)) {
        // Flatten grouped tool catalog (e.g. { groups: [{ id: 'fs', tools: [...] }] })
        return res.groups.flatMap((g: any) =>
          (g.tools ?? []).map((t: any) => ({
            id: t.id,
            name: t.label ?? t.id,
            description: t.description,
            status: "available",
            group: g.label ?? g.id,
          }))
        );
      }
      return Array.isArray(res) ? res : (res?.tools ?? []);
    } catch (e: any) {
      throw new Error(`Gateway tools listing unavailable: ${e.message}`);
    }
  }

  async listSkills(agentId: string): Promise<any> {
    await this.ensureConnected();
    return this.rpc<any>("skills.status", { agentId }, 30000);
  }

  async listSessions(params: Record<string, unknown>): Promise<any> {
    await this.ensureConnected();
    return this.rpc<any>("sessions.list", params, 30000);
  }

  async getSessionsUsage(params: Record<string, unknown>): Promise<any> {
    await this.ensureConnected();
    return this.rpc<any>("sessions.usage", params, 60000);
  }

  async getAgentIdentity(agentId: string): Promise<any> {
    await this.ensureConnected();
    return this.rpc<any>("agent.identity.get", { agentId }, 15000);
  }

  async listAgentFiles(agentId: string): Promise<any> {
    await this.ensureConnected();
    return this.rpc<any>("agents.files.list", { agentId }, 15000);
  }

  async getAgentFile(agentId: string, name: string): Promise<any> {
    await this.ensureConnected();
    return this.rpc<any>("agents.files.get", { agentId, name }, 15000);
  }

  async listCommands(agentId: string): Promise<any> {
    await this.ensureConnected();
    return this.rpc<any>("commands.list", { agentId, includeArgs: false }, 30000);
  }

  async listModels(): Promise<any> {
    await this.ensureConnected();
    return this.rpc<any>("models.list", { view: "configured", includeDetails: true }, 60000);
  }

  async invokeTool(params: {
    name: string;
    agentId: string;
    sessionKey: string;
    args: Record<string, unknown>;
    confirm?: boolean;
    timeoutMs?: number;
  }): Promise<any> {
    await this.ensureConnected();
    return this.rpc<any>("tools.invoke", {
      name: params.name,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      args: params.args,
      ...(params.confirm === true ? { confirm: true } : {}),
    }, params.timeoutMs ?? 60000);
  }

  async createAgent(params: { name: string; model?: string; emoji?: string; avatar?: string }): Promise<any> {
    await this.ensureConnected();
    return this.rpc<any>("agents.create", params, 120000);
  }

  async updateAgent(params: { agentId: string; name?: string; model?: string | null; emoji?: string; avatar?: string }): Promise<any> {
    await this.ensureConnected();
    return this.rpc<any>("agents.update", params, 120000);
  }

  async setAgentFile(agentId: string, name: string, content: string, expectedHash?: string, expectedMissing = false): Promise<any> {
    await this.ensureConnected();
    return this.rpc<any>("agents.files.set", {
      agentId,
      name,
      content,
      ...(expectedHash ? { expectedHash } : expectedMissing ? { expectedMissing: true } : {}),
    }, 30000);
  }

  async deleteAgent(agentId: string, deleteFiles = true): Promise<any> {
    await this.ensureConnected();
    return this.rpc<any>("agents.delete", { agentId, deleteFiles }, 120000);
  }

  // Real paired-node/presence data for the Home dashboard "Connected devices" widget.
  // Primary: node.list (known/connected node state). Fallback: system-presence snapshot
  // (connected operator/node devices). Throws if neither is available so the route can
  // serve its honest single-row fallback. No fields are invented.
  async listNodes(): Promise<Array<{ id: string; name: string; connected: boolean; lastSeenAtMs?: number }>> {
    await this.ensureConnected();
    const toList = (raw: any): any[] => {
      if (Array.isArray(raw)) return raw;
      if (raw && typeof raw === "object") {
        if (Array.isArray(raw.nodes)) return raw.nodes;
        if (Array.isArray(raw.devices)) return raw.devices;
        // Presence snapshot is keyed by device id.
        const out: any[] = [];
        for (const [k, v] of Object.entries(raw)) {
          if (v && typeof v === "object") out.push({ id: k, ...(v as object) });
        }
        if (out.length > 0) return out;
      }
      return [];
    };
    try {
      const res = await this.rpc<any>("node.list", {}, 15000);
      return toList(res)
        .map((n: any) => ({
          id: String(n.nodeId ?? n.id ?? n.deviceId ?? ""),
          name: String(n.name ?? n.label ?? n.deviceName ?? n.nodeId ?? n.id ?? "Node"),
          connected: n.connected === true || n.state === "connected" || n.status === "connected",
          lastSeenAtMs: typeof n.lastSeenAtMs === "number" ? n.lastSeenAtMs : undefined,
        }))
        .filter((n) => n.id !== "" || n.name !== "Node");
    } catch {
      const res = await this.rpc<any>("system-presence", {}, 15000);
      return toList(res).map((n: any) => ({
        id: String(n.deviceId ?? n.id ?? ""),
        name: String(n.deviceName ?? n.name ?? "Paired device"),
        connected: true, // system-presence only lists currently connected devices
      }));
    }
  }

  shutdown(): void {
    this.closedByUs = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close(1000, "julie shutdown");
  }
}

export const gateway = new GatewayClient();
