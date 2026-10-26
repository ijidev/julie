# Changelog

## 0.2.0 — 2026-10-26 (Phase B backlog: B-1, B-2, B-3)
### Added
- TLS routing: new Caddy site `julie.ijihost.com` → 127.0.0.1:3000 with automatic
  ACME TLS (Caddyfile backup at /etc/caddy/Caddyfile.backup-pre-julie-*; existing
  `Juli.ijihost.com` gateway route untouched). JULIE rebound to 127.0.0.1:3000
  via `BIND_HOST`; public IPv4/IPv6 :3000 no longer respond. HTTPS activates
  automatically once the operator adds the julie DNS records (no Cloudflare
  credentials exist on this server — documented in PROJECT_STATE).
- Streaming chat (SSE): `GET /api/conversations/:id/events` forwards gateway
  `chat` events (delta append / replace / snapshot / final) per conversation,
  auth-gated, heartbeated, EventSource auto-reconnect. Chat UI renders replies
  progressively; orb shows "speaking" while deltas arrive (Shell-level state).
- Task automation bridge: `POST /api/tasks/:id/run` (auth-gated, 409 on
  non-ready/double-run) runs `ready` tasks through the real orchestrator
  (`chat.send` to `agent:main:julie-task-<id>`), lifecycle
  ready → in_progress → pending_review (blocked on failure), output persisted
  in `tasks.last_run_output`; `runningTaskIds` in task list; board polls while
  running; "▶ run" button with confirm dialog on ready tasks.
- Schema: tasks gained `gateway_session_key`, `last_run_output`, `run_started_at`
  (idempotent ALTER migration for existing DBs).

### Fixed
- Frontend SPA never mounted: `web/src/main.tsx` was committed without
  `createRoot(...).render(<App/>)` and never imported `styles.css`, so the built
  bundle was a 9 kB react-only stub and the served page was blank (bug present
  in git HEAD, predating this change). App now mounts and styles load
  (235 kB JS + 10.6 kB CSS).

### Verified
- tsc + vite builds pass; service active; health ok with gateway connected.
- Real streaming round-trips through the gateway (delta frames observed before
  final; upstream model currently returns whole-text frames — reducer handles
  all protocol shapes).
- Real task run: ready → in_progress → pending_review, output `BRIDGE-OK`,
  orchestrator session `agent:main:julie-task-2`.
- 401 on unauthenticated run/SSE/mutations; 409 guards; login + HttpOnly cookie
  on loopback; public :3000 refused; existing gateway route re-verified intact.

## 0.1.0 — 2026-10-26 (MVP vertical slice, Phases A–E)
### Added
- Backend (Node 24 + Express + TypeScript, better-sqlite3 WAL):
  - `GET /api/health` (public, reflects live gateway link)
  - Workspaces CRUD + activation (SQLite-persisted, default workspace seeded)
  - Tasks with closed status set: backlog, ready, in_progress, waiting_input,
    pending_review, done, blocked (CHECK-enforced); create/list/update/delete
  - Conversations + message history, per-conversation stable gateway session keys
  - Settings key/value store
- OpenClaw Gateway adapter (server-side only):
  - WS protocol v4 handshake with Ed25519 device identity + challenge signing
  - `chat.send` / `chat.history` with final-event + polling completion detection
  - Auto-reconnect; health check with liveness RPC
- Frontend (Vite + React + TS, plain CSS, ~9 kB gzipped):
  - Dark glassmorphism command center (bg #070B14, panel rgba(20,30,48,.62),
    orange #FF7A1A, cyan #67DDDF, violet #A78BFA)
  - Animated holographic assistant orb with reduced-motion fallback
  - Chat view wired to the real gateway through the backend
  - Workspace switcher + task board (7 columns, drag & drop + status dropdown)
  - Live gateway status pill, SPA routing (History API), mobile layout
- Auth: owner password → HttpOnly session cookie; all mutating endpoints gated
- Deployment: systemd `julie.service` (enabled, active), port 3000, verified
  externally at http://169.58.118.108:3000/api/health
- Docs: PROJECT_CONSTITUTION, PROJECT_STATE, DECISIONS, BACKLOG, DEPLOYMENT,
  INTEGRATIONS, CHANGELOG, AGENTS.md

### Verified tests (all real, no mocks)
- tsc build passes; vite build passes
- health endpoint OK on loopback and public IP
- 401 on unauthenticated mutations (loopback + public IP), 401 on wrong password
- two real gateway chat round-trips ("JULIE LINK OK", "BACKEND CHAT OK")

### Known gaps → docs/BACKLOG.md (TLS, streaming, task automation, session expiry)