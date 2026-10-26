# Changelog

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