# Decision Records

## D-001 — Single process, port 3000, Express serves static build
Date: 2026-10-26
One Node process handles `/api/*` and serves `web/dist` with an SPA fallback.
Rationale: simplest deployment, one systemd unit, no CORS, no second port.

## D-002 — Gateway integration via native WS protocol, not HTTP /v1
Date: 2026-10-26
The OpenAI-compatible `/v1/chat/completions` endpoint exists but is **disabled**
(`gateway.http.endpoints` unset) and enabling it would require modifying OpenClaw
config, which is forbidden. The Gateway WebSocket protocol (docs/gateway/protocol/*)
is always enabled. Verified live: `hello-ok` (protocol 4, server 2026.10.5,
operator role), `chat.send`, `chat.history`.

## D-003 — Device identity (Ed25519) for the WS handshake
Date: 2026-10-26
Gateway requires a device identity for operator WS connections unless the caller is
a trusted local backend client; we sign the connect challenge (payload v3:
`v3|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce|platform|deviceFamily`)
with an Ed25519 keypair persisted at `data/device-identity.json` (mode 0600).
The gateway silently pairs the local device on loopback with shared-secret auth.

## D-004 — Gateway token source
Date: 2026-10-26
The token in `~/.openclaw/openclaw.json` (`gateway.auth.token`, 25 chars) is NOT the
runtime secret: HTTP `/tools/invoke` rejects it (401) while the
`OPENCLAW_GATEWAY_TOKEN` env var of the running gateway process (64 hex chars)
authenticates (200). JULIE stores the working runtime token in its own `.env` as
`GATEWAY_TOKEN`. Never printed or committed.

## D-005 — Chat completion detection: `chat` final event + history polling fallback
Date: 2026-10-26
`chat.send` returns `{runId,status:"started"}` immediately. JULIE listens for the
`chat` event with `state:"final"` for the same sessionKey/runId and concurrently
polls `chat.history` every 3s as fallback (max 180s). Both were exercised live;
polling alone was proven to recover the assistant message.

## D-006 — Session key naming
Date: 2026-10-26
Each JULIE conversation maps to a stable gateway session key
`agent:main:julie-conv-<base36 time>-<hex>`. Avoids reserved namespaces
(`subagent:`, `cron:`, `acp:`) and keeps per-conversation continuity (documented
behavior: same session key ⇒ same agent session).

## D-007 — Auth model
Date: 2026-10-26
Single-owner: `ADMIN_PASSWORD` verified with timing-safe compare → HttpOnly
`julie_session` cookie whose value is the constant `ADMIN_TOKEN` (timing-safe
compared per request). Simple, no session store; logout clears the cookie.
Limitations (documented, accepted for MVP): fixed 7-day cookie lifetime, no CSRF
token (mitigated by SameSite=Lax + JSON content-type + no GET mutations).

## D-008 — Plain CSS + hand-rolled router on the frontend
Date: 2026-10-26
No Tailwind, no react-router. Keeps web bundle at ~9 kB JS. Reduced-motion media
query disables the orb animation.

## D-009 — No firewall change
Date: 2026-10-26
`ufw` is inactive on this host; opening port 3000 required no rule. We deliberately
did NOT touch Caddy (:80/:443) — JULIE is reachable over plain HTTP :3000 for the
MVP; TLS termination is backlog item B-2.