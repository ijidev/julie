# Integrations

## OpenClaw Gateway (AI execution backend)

Target: the real OpenClaw Gateway 2026.10.5 at `ws://127.0.0.1:18789`
(loopback only, HTTP+WS multiplex port, token auth).
Docs consulted: `~/.npm-global/lib/node_modules/openclaw/docs/gateway/protocol/*.md`,
`openai-http-api.md`, `tools-invoke-http-api.md`.

### What JULIE uses
| Feature | Interface | Status |
|---|---|---|
| Connection check | WS handshake → `hello-ok` + liveness RPC (`system.get-health`, fallback `sessions.list`) | ✅ works |
| Chat | WS RPC `chat.send {sessionKey, message, idempotencyKey}` → wait for `chat` event `state:"final"`; fallback poll `chat.history` every 3s (≤180s) | ✅ works |
| History | WS RPC `chat.history {sessionKey}` (display-normalized) | ✅ works |
| HTTP `/tools/invoke` | tested with `sessions_list`; works with the runtime token | ✅ works (used only in early testing) |
| HTTP `/v1/chat/completions` | OpenAI-compatible surface | ❌ disabled on this gateway (`gateway.http.endpoints` unset); NOT used, and we must not modify OpenClaw config to enable it |

### Authentication
- Auth mode: `gateway.auth.mode = "token"`.
- The **runtime** secret is the `OPENCLAW_GATEWAY_TOKEN` environment variable of the
  running gateway process (64 hex chars). The token stored in
  `~/.openclaw/openclaw.json` under `gateway.auth.token` is **rejected** by the live
  gateway (verified: HTTP 401 + WS `AUTH_TOKEN_MISMATCH`). JULIE therefore stores the
  runtime token in its own `.env` (`GATEWAY_TOKEN`).
- WS handshake additionally requires **device identity**: Ed25519 keypair,
  `device.id = sha256(raw 32-byte pubkey)`, signature over the v3 payload
  `v3|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce|platform|deviceFamily`,
  `signedAt` = challenge `ts`, `nonce` from `connect.challenge`. Identity is persisted
  at `data/device-identity.json` (0600). On loopback with shared-secret auth the
  gateway silently pairs this device (verified live: hello-ok role=operator,
  scopes operator.read+operator.write).
- Client identity sent: `client.id "gateway-client"`, `client.mode "backend"` (the
  documented trusted local backend profile), protocol v4.

### Proven round-trips (2026-10-26)
1. Direct WS probe: message "This is a JULIE connectivity test…" → agent reply
   **"JULIE LINK OK"** (provider openrouter, model qwen/qwen3.5-35b-a3b).
2. Through JULIE backend API (`POST /api/conversations/1/messages`): reply
   **"BACKEND CHAT OK"**, runId `julie-b39ef7c5ed6b944b`, ~6.2s, persisted to SQLite
   and retrievable via `GET /api/conversations/1/messages`.

### Failures encountered (honest log)
- `chat.send` without `idempotencyKey` → `INVALID_REQUEST` (required property).
- Connect frames sent before the `connect.challenge` event → handshake timeout
  (the challenge must be awaited; it arrives as a `type:"event"` frame).
- WS probes that sent an empty token (shell expansion bug in the test harness)
  surfaced as `NOT_PAIRED`/`device identity required` — misleading error; the
  correct error for a bad token is `AUTH_TOKEN_MISMATCH`.
- `GET /v1/models` → 404 (chat-completions endpoint disabled).

### What JULIE deliberately does NOT do
- Modify any OpenClaw config, state, or processes.
- Expose the gateway token to the browser (all gateway calls are server-side).
- Use reserved session namespaces (`subagent:`, `cron:`, `acp:`).