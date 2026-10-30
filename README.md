# Julie AI OS

A single-owner command center for a team of AI agents. One Node process serves the
REST API and the built web app on one port, persists its own state in SQLite, and
talks to a real **OpenClaw Gateway** over its documented WebSocket protocol.

Julie does not simulate an AI. Every agent, model, tool, skill, session, and
transcript is read from the Gateway. Julie owns the things OpenClaw does not:
tasks, rooms, the owner's conversations and their durable turn queue, workspace
plans, org metadata, and an audit trail.

## What you need

- **Node.js >= 20.11** (`engines` in `package.json`)
- **npm** (the repo is a plain npm workspace-free project; `web/` has its own lockfile)
- A running **OpenClaw Gateway** and its shared token
- Linux or macOS; the systemd helper is Linux-only

## Architecture

```
browser ──HTTP/SSE──► Julie (Express, :3000) ──WebSocket──► OpenClaw Gateway
                          │                                     │
                          └── SQLite (data/julie.db)             └── agents, models,
                              tasks, rooms, queue, audit            tools, sessions
```

- `server/` — Express + TypeScript backend, compiled to `server/dist`
- `web/` — Vite + React frontend, built to `web/dist` and served by the same process
- `data/` — SQLite database, device identity, generated assets (gitignored, owner-only)

## Quick start

```bash
git clone <this-repo> julie && cd julie
npm ci
npm --prefix web ci

cp .env.example .env
chmod 600 .env
# Fill in ADMIN_PASSWORD, ADMIN_TOKEN, GATEWAY_TOKEN (see below)

npm run build          # backend  -> server/dist
npm run web:build      # frontend -> web/dist
npm run doctor         # read-only setup discovery
npm start              # http://127.0.0.1:3000
```

Generate the two Julie secrets instead of inventing them:

```bash
node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"  # ADMIN_PASSWORD
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"        # ADMIN_TOKEN
```

`GATEWAY_TOKEN` is the OpenClaw Gateway shared secret. Read it from your OpenClaw
configuration; do not copy it into this repository.

## Configuration

All values live in `.env` (gitignored, mode 0600). Environment variables win over
the file. Secrets are validated for presence and minimum length, never logged.

| Variable | Default | Purpose |
|---|---|---|
| `ADMIN_PASSWORD` | — (required) | Owner login password, >= 12 chars |
| `ADMIN_TOKEN` | — (required) | Session-cookie secret, >= 24 chars |
| `GATEWAY_TOKEN` | — (required) | OpenClaw Gateway shared secret |
| `PORT` | `3000` | Single HTTP port for API + web |
| `BIND_HOST` | `0.0.0.0` | Set `127.0.0.1` to keep it behind a reverse proxy |
| `GATEWAY_URL` | `ws://127.0.0.1:18789` | Gateway WebSocket endpoint |
| `JULIE_DATA_DIR` | `data` | Database, identity, backups, assets |
| `DB_PATH` | `julie.db` | Database file, inside the data directory unless absolute |
| `JULIE_TERMINAL_ENABLED` | `false` | Owner shell execution (high risk) |
| `JULIE_TERMINAL_ROOT` | repository root | Only directory the terminal may run in |
| `OPENCLAW_BIN` | `openclaw` | CLI used by `npm run doctor` |

If a required secret is missing, Julie refuses to boot (fail closed).

## Setup doctor

```bash
npm run doctor
```

Read-only checks: Node version, `.env` presence/permissions, required secrets,
data/database permissions and integrity, schema version, both builds, OpenClaw
CLI and Gateway service discovery, Gateway URL consistency, and the running
Julie health endpoint. It prints only non-secret metadata.

## Run as a service

```bash
sudo ./deploy/install-service.sh      # renders deploy/julie.service.template
sudo systemctl status julie
journalctl -u julie -f
```

The installer substitutes the real checkout path, service user, and node binary,
then enables the unit. It writes only `julie.service`; it never touches OpenClaw,
Caddy, or other units. `deploy/julie.service` is the concrete unit currently
installed on the reference host.

## Security model

- **Auth gate.** Only `/api/health`, `/api/login`, `/api/logout`, and `/api/session`
  are public and none mutate state. Every other API route requires the owner
  session cookie. There is no unauthenticated AI-execution endpoint.
- **Secrets.** `.env` is gitignored and must be 0600. The app validates presence,
  never logs values, and redacts credentials, private keys, and OpenClaw paths
  from agent transcripts it serves.
- **Data.** The data directory is created 0700 and the database files are set to
  0600 at boot.
- **Terminal.** Owner shell execution is **off by default**. Enabling it requires
  `JULIE_TERMINAL_ENABLED=true`; commands are then owner-authenticated,
  rate-limited, blocked on secret-exposing patterns, and confined to
  `JULIE_TERMINAL_ROOT` with symlink resolution.
- **Containment.** Julie reads OpenClaw state through the Gateway API. It does not
  write OpenClaw configuration or copy its state. Changes outside the Julie
  repository require a backup, a stated reason, and owner approval.
- **Migrations.** Schema changes are versioned with `PRAGMA user_version`; each
  step runs once. `/api/health` reports the applied version.

## What is honest, and what is not there yet

- The UI never fabricates connection, delivery, or run state. A status shown in
  the interface comes from a real backend or Gateway call.
- Agent activity (commands, edits, approvals, output, failures) is reduced from
  real Gateway `agent` frames into durable rows and live SSE events.
- External channels such as Telegram currently reach OpenClaw directly, not
  Julie. They do not yet use Julie's aliases, rooms, tasks, or activity trail.
  That front-door decision is deliberately deferred (see
  `docs/ARCHITECTURE_AUDIT_2026-10-30.md`).

## Documentation

- `docs/JULIE_OPERATIONS_GUIDE.md` — delegation, tools, files, setup, orchestration
- `docs/ENGINEERING_OPERATING_SYSTEM.md` — OpenCode-first engineering policy
- `docs/ARCHITECTURE_AUDIT_2026-10-30.md` — ownership, duplication, installability
- `docs/DECISIONS.md` — architecture decision records
- `docs/PROJECT_STATE.md` — current milestone and verification
- `docs/DEPLOYMENT.md` — host, network, and unit details

## License

Proprietary; all rights reserved. See `LICENSE` and decision D-033.
