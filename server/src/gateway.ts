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

interface ChatEventPayload {
  runId?: string;
  sessionKey?: string;
  state?: string;
  message?: { role: string; content?: Array<{ type: string; text?: string }> };
  deltaText?: string;
  replace?: boolean;
  stopReason?: string;
}

// Reduced chat-stream event forwarded to SSE subscribers.
export interface ChatStreamEvent {
  sessionKey?: string;
  state: "delta" | "final" | "error";
  runId?: string;
  deltaText?: string; // append payload (delta state)
  replace: boolean; // deltaText is a full replacement, not an append
  snapshot: string | null; // authoritative full text when a message snapshot was present
  text: string | null; // full final text on final state
}

function extractText(content: Array<{ type: string; text?: string }> | undefined): string {
  if (!content) return "";
  return content
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text!)
    .join("")
    .trim();
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
      if (state === "delta") {
        // Per protocol: a message snapshot on a frame is authoritative and already
        // includes deltaText — never append on top of a snapshot.
        const hasSnapshot = Array.isArray(payload.message?.content) && payload.message!.content!.length > 0;
        handler({
          sessionKey: payload.sessionKey,
          state: "delta",
          runId: payload.runId,
          deltaText: payload.deltaText,
          replace: payload.replace === true,
          snapshot: hasSnapshot ? extractText(payload.message?.content) : null,
          text: null,
        });
      } else if (state === "final" || state === "error") {
        handler({
          sessionKey: payload.sessionKey,
          state: state === "final" ? "final" : "error",
          runId: payload.runId,
          deltaText: undefined,
          replace: false,
          snapshot: null,
          text: state === "final" ? extractText(payload.message?.content) : null,
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
      // Live liveness proof: cheap read RPC through the open socket.
      await this.rpc("system.get-health", {}, 10000).catch(async () => {
        // Fall back to sessions.list (documented operator RPC) if system.get-health is unavailable.
        await this.rpc("sessions.list", { limit: 1 }, 10000);
      });
      return { ...this.status, latencyMs: Date.now() - start };
    } catch (e: any) {
      return { connected: false, error: e.message };
    }
  }

  // Submit a chat turn and wait for the agent's final assistant text.
  async chat(sessionKey: string, message: string, timeoutMs = 180000): Promise<{ runId?: string; text: string }> {
    await this.ensureConnected();
    const idempotencyKey = `julie-${crypto.randomBytes(8).toString("hex")}`;
    const sendRes = await this.rpc<{ runId?: string; status?: string; runStarted?: boolean }>(
      "chat.send", { sessionKey, message, idempotencyKey }, 30000
    );
    const runId = sendRes?.runId;
    return await this.awaitFinalReply(sessionKey, runId, timeoutMs);
  }

  private awaitFinalReply(sessionKey: string, runId: string | undefined, timeoutMs: number): Promise<{ runId?: string; text: string }> {
    return new Promise((resolve, reject) => {
      let settled = false;
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
        }
      };
      this.onEvent(listener);
      const poll = setInterval(async () => {
        try {
          const h = await this.rpc<{ messages?: Array<{ role: string; content?: Array<{ type: string; text?: string }> }> }>(
            "chat.history", { sessionKey }, 15000
          );
          const last = h.messages?.[h.messages.length - 1];
          if (last?.role === "assistant") {
            const text = extractText(last.content);
            if (text) finishOk(text);
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
    const h = await this.rpc<{ messages?: Array<{ role: string; content?: Array<{ type: string; text?: string }>; timestamp?: number }> }>(
      "chat.history", { sessionKey }, 15000
    );
    return (h.messages ?? []).map((m) => ({ role: m.role, text: extractText(m.content), timestamp: m.timestamp }));
  }

  async listAgents(): Promise<Array<{ id: string; name?: string; model?: string; status?: string }>> {
    await this.ensureConnected();
    try {
      const res = await this.rpc<any>("agents.list", {}, 15000);
      return Array.isArray(res) ? res : (res?.agents ?? []);
    } catch {
      try {
        const res = await this.rpc<any>("sessions.list", {}, 15000);
        return Array.isArray(res) ? res : (res?.sessions ?? []).map((s: any) => ({
          id: s.key ?? s.id,
          name: s.agentId ?? s.name ?? s.key,
          status: s.status ?? "unknown",
          model: s.model ?? "unknown",
        }));
      } catch (e: any) {
        throw new Error(`Gateway agents listing unavailable: ${e.message}`);
      }
    }
  }

  async listTools(): Promise<Array<{ id: string; name?: string; description?: string; status?: string; group?: string }>> {
    await this.ensureConnected();
    try {
      const res = await this.rpc<any>("tools.catalog", { agentId: "main", includePlugins: true }, 15000);
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

  shutdown(): void {
    this.closedByUs = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close(1000, "julie shutdown");
  }
}

export const gateway = new GatewayClient();