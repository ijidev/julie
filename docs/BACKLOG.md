# Backlog

## B-1 — TLS in front of JULIE (priority: high)
Terminate TLS (Caddy site block on a subdomain, or a second Caddy listener) and bind
JULIE to loopback only. Password auth over plain HTTP is the biggest current risk.

## B-2 — Streaming chat (priority: high)
Forward gateway `chat` delta events to the browser (SSE or WebSocket) so replies
render progressively; show the orb in "speaking" state while streaming.

## B-3 — Task automation bridge (priority: high)
Let JULIE act on tasks: a "run with JULIE" action on tasks that submits a prompt to
the gateway and writes results back to the task (status transitions
ready → in_progress → pending_review). Requires the auth gate + approval UX.

## B-4 — Session hardening
Random per-login session values stored in SQLite with expiry + rotation; secure
cookie flag when TLS lands; optional session revoke list.

## B-5 — Gateway event wiring in the UI
Live task status from gateway activity (sessions.changed), reconnect banner using
the client's auto-reconnect state instead of 30s polling.

## B-6 — Conversation titles from first message
Use the first user message (or gateway title generation) to auto-name conversations.

## B-7 — Attachments
Support file attachments respecting gateway policy.attachments limits.

## B-8 — Tests
Add a tiny node:test suite: DB migrations, auth middleware, routes contract, and a
mock-gateway mode for the adapter so CI doesn't need the real gateway.