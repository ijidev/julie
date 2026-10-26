# Project State

Last updated: 2026-10-26 (Phase B backlog: B-1 TLS routing + loopback, B-2 streaming, B-3 task bridge)

## Current milestone
**MVP vertical slice — Phase A–E** ✅ shipped 2026-10-26

| Phase | Scope | Status |
|-------|-------|--------|
| A | Backend core: health, workspaces CRUD, tasks (7 statuses), conversations | ✅ done |
| B | OpenClaw integration adapter (WS protocol, real chat round-trip) | ✅ done |
| C | Frontend command center (glassmorphism, orb, chat, board, status pills) | ✅ done |
| D | Auth gate (owner password → HttpOnly session cookie) | ✅ done |
| E | Deployment (systemd `julie.service`, port 3000, external reachability) | ✅ done |

## Verified facts (2026-10-26, Phase B backlog)
- Service `julie.service` is active, enabled, `Restart=always`, user `admin`.
- JULIE now binds **127.0.0.1:3000 only** (`BIND_HOST=127.0.0.1` in `.env`).
  Public IPv4/IPv6 :3000 refuse connections (verified: connection refused both).
- Caddy (v2.11.7) serves `julie.ijihost.com` → 127.0.0.1:3000 (new site block;
  pre-existing `Juli.ijihost.com` → 127.0.0.1:18789 gateway route untouched and
  re-verified working). HTTP→HTTPS redirect for julie returns 308.
- ACME issuance for julie.ijihost.com retries in the background (Caddy, up to 30
  days) and completes automatically once the DNS record exists — **the record
  cannot be created from this server**: no Cloudflare API credentials exist
  anywhere on the host (checked env files, openclaw config/state, gateway
  process env, crontabs). Operator must add in Cloudflare DNS:
  `julie A 169.58.118.108` and `julie AAAA 2a02:c207:2365:275::1` (proxied or
  DNS-only both work; HTTP-01 reaches origin either way).
- B-2 streaming verified: SSE endpoint `GET /api/conversations/:id/events`
  forwards gateway `chat` events (delta/replace/snapshot/final) for the
  conversation's session key. Real round-trips confirmed delta frames arriving
  before `final` (runId julie-ee799d0f164b327a, julie-12fbc5d392559b94,
  julie-4aa42ccaf6c3ed9c). Frame granularity follows the upstream model; the
  currently routed model returns whole text (1 snapshot delta + clearing
  replace + final), the reducer handles all protocol shapes.
- Orb "speaking" state wired: speaking while deltas arrive, idle otherwise.
- B-3 task bridge verified end-to-end: POST /api/tasks/:id/run on a `ready`
  task → in_progress (runningTaskIds exposed) → chat.send to the orchestrator
  session `agent:main:julie-task-<id>` → pending_review with output `BRIDGE-OK`.
  Guards verified: re-run while running/non-ready → 409; unauthenticated run
  and SSE → 401.
- Fixed pre-existing frontend bug: `web/src/main.tsx` had no `createRoot` mount
  and never imported `styles.css`, so the built SPA rendered a blank page
  (present in git HEAD). Now mounts `<App/>` and imports the stylesheet;
  bundle went from a 9 kB react-only stub to 235 kB app + 10.6 kB CSS.
- Auth checks re-verified on loopback after the TLS/rebind change: health ok,
  unauthenticated mutation 401, wrong password 401, login 200 + HttpOnly cookie.
- ufw is inactive on this host.

## Known limitations (not yet implemented)
- HTTPS on julie.ijihost.com activates automatically once the operator adds the
  DNS record (see above); until then there is no external URL for JULIE.
- Sessions don't expire; logout clears the cookie only client-side (B-4).
- No user-scoped multi-owner support (by design, single owner).
- Task run output is stored on the task; no push notification on completion.