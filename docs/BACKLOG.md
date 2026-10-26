# Backlog

## B-1 — TLS in front of JULIE (priority: high) — ✅ done 2026-10-26
Caddy site block `julie.ijihost.com` → 127.0.0.1:3000 added (automatic TLS,
ACME retrying until DNS record exists); JULIE rebound to 127.0.0.1 only.
Remaining operator step: add Cloudflare DNS records `julie A 169.58.118.108`
and `julie AAAA 2a02:c207:2365:275::1` (no CF credentials on this server).

## B-2 — Streaming chat (priority: high) — ✅ done 2026-10-26
SSE `GET /api/conversations/:id/events` (auth-gated) forwards gateway chat
deltas/snapshots/finals; chat UI renders progressively; orb in "speaking"
state while deltas arrive, idle otherwise. Verified with real round-trips.

## B-3 — Task automation bridge (priority: high) — ✅ done 2026-10-26
"▶ run" action on `ready` tasks (confirm dialog = approval UX) →
POST /api/tasks/:id/run → chat.send to orchestrator session
`agent:main:julie-task-<id>`; lifecycle ready → in_progress → pending_review
(blocked on failure), output persisted in `last_run_output`. Auth-gated,
409 on double-run/non-ready, board polls while running.

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