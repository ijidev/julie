# JULIE AI OS — Coding-Agent Instructions (AGENTS.md)

Canonical instructions for any coding agent working in this repository.

## What this project is
JULIE is a single-owner "AI OS" command center: one Node process (port 3000) serving
both the REST API and the built web app, persisting to SQLite, and talking to the
**real** OpenClaw Gateway over its documented WebSocket protocol.

## Non-negotiable rules
1. **Never fabricate status.** Every status shown in the UI must come from an actual
   backend call (health, gateway status, task rows). No fake "connected" states.
2. **Secrets never leave the machine.** `.env` (mode 0600, gitignored) holds
   `ADMIN_PASSWORD`, `ADMIN_TOKEN`, `GATEWAY_TOKEN`. Never print, log, or commit them.
   Never copy anything into `/home/admin/.openclaw` or modify OpenClaw/OmniRoute state.
3. **One process.** The Express server serves `/api/*` and the static `web/dist` build.
   Do not introduce a second runtime port in production.
4. **Auth gate.** All mutating/executing endpoints require the owner session cookie.
   Only `/api/health`, `/api/login`, `/api/logout`, `/api/session` are public, and
   none of them mutate anything. Never add an unauthenticated AI-execution endpoint.
5. **Back up before you change.** Anything outside `/home/admin/julie` (Caddyfile,
   OpenClaw config, systemd units beyond `julie.service`) requires an explicit backup
   and a stated reason first.
6. **Verify claims.** Build must pass; health check must return ok; integration
   changes require a real gateway round-trip before being called "working".

## Layout
```
/home/admin/julie
├── server/          Express + TypeScript backend (src → dist via `npm run build`)
├── web/             Vite + React frontend (`npm run web:build` → web/dist)
├── data/            SQLite DB + device identity (gitignored, mode 600)
├── deploy/julie.service   systemd unit (installed at /etc/systemd/system/)
└── docs/            Project constitution, state, decisions, backlog, deployment…
```

## Commands
- Build backend: `npm run build` (root)
- Build frontend: `npm run web:build`
- Dev backend: `npm run dev` (tsx watch)
- Service: `sudo systemctl {start|stop|restart|status} julie`
- Logs: `journalctl -u julie -f`
- Smoke test: `curl -s localhost:3000/api/health`

## Working agreements
- Keep `docs/PROJECT_STATE.md` current after each milestone; append to
  `docs/CHANGELOG.md`; record architecture choices in `docs/DECISIONS.md`.
- Dependencies stay minimal. Justify every new package in `docs/DECISIONS.md`.
- Task statuses are a closed set: backlog, ready, in_progress, waiting_input,
  pending_review, done, blocked (enforced by a SQLite CHECK constraint).
- Frontend uses plain CSS (no Tailwind) and a ~30-line History-API router (no
  react-router). Don't add frameworks without a decision record.