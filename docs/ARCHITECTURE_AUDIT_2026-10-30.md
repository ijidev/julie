# Architecture Audit — OpenClaw coupling, duplicated ownership, and installability

Date: 2026-10-30
Scope: `/home/admin/julie` server, web, deploy, docs
Method: source read, live SQLite inspection, live OpenClaw roster/identity inspection,
`openclaw gateway status --json` (no secret values printed), permission checks.
No files outside the repository were modified.

## Verdict on the owner's claim

**Partly correct, and the correct part matters.**

1. **"We are building another system to pair with OpenClaw" — directionally true.**
   `docs/PROJECT_CONSTITUTION.md` explicitly defines Julie as a *sibling application*
   that "does not manage OpenClaw". The code follows that: agents, models, tools,
   skills, sessions, and chat execution come from the Gateway. But Julie also keeps
   its own copy of some things OpenClaw already owns (agent names, transcripts), and
   those copies drift.

2. **"We have two databases" — true, but not automatically a defect.**
   Julie's SQLite is the right home for Julie-only domains (tasks, rooms, queue,
   workspace plans, audit). The defect is not "two databases"; it is **duplicated
   ownership** of data that belongs to one side, with no reconciliation. Merging the
   databases would be worse and unsafe.

3. **"Most data are hardcoded instead of variables" — partly true.**
   Business data (human names, roles, departments, workspaces) is in SQLite and
   editable, which is good. What is hardcoded is **deployment identity**: host paths,
   the `main` agent assumption, the engineering department name, OpenCode model IDs,
   the Gateway URL/token, the systemd user and path, and the terminal root.

## What is genuinely well designed (do not "fix" this)

- Live OpenClaw data is fetched through the Gateway API: roster, models, tools,
  skills, sessions, history, usage (`server/src/gateway.ts`, `agent-overview.ts`,
  `agent-onboarding.ts`, `agent-detail.ts`).
- Julie-only domains are local and coherent: tasks, task activity, rooms, room
  membership, turn queue, workspace plans, audit log.
- No code writes to `~/.openclaw`, Caddy, or OpenClaw config. Verified by search:
  the only filesystem writes in `server/src` are Julie's own `data/` artifacts.
- Single process, single port, authenticated mutations, honest "unavailable" states.
- The new `agent-actions.ts` reads real Gateway `agent` frames instead of inventing
  progress, and `agent-directory.ts` builds the roster from live data.

## Findings, by severity

### P0-1 — Agent identity has two owners and already drifted

Evidence:
- `agent_profiles.human_name` is the Julie display name (`agent-profiles.ts`,
  `configureAgentHumanNames` in `agent-organization.ts`) and is written **only to
  SQLite**.
- OpenClaw `agents.entries.<id>.identity.name` is a separate value. Live comparison:
  `dev-builder` → Gateway identity **"Engineering Lead"**, Julie human name **"Victor"**.
- `updateManagedAgent` (`agent-update.ts`) can patch the Gateway `name` and the Julie
  profile through a different path, so there are two rename surfaces.
- Julie's UI prefers `humanName` over the Gateway identity
  (`agent-detail.ts`, `agent-overview.ts`).

Consequence: Julie shows Victor, Telegram/OpenClaw shows Engineering Lead. The same
agent has two public names. This is exactly why an external channel and Julie can
disagree about who an agent is.

Recommended target: **Gateway owns the public display name** (`identity.name` =
human name). Julie owns org metadata (`role`, `department`, `reports_to`, schedule).
One rename path writes both, Gateway first, and Julie reports a partial failure
honestly if the Gateway patch fails.

### P0-2 — External channels bypass Julie entirely

Evidence: OpenClaw bindings route Telegram `default` and `*` to agent `main`
(`/home/admin/.openclaw/openclaw.json`, configuration, not this repo). Julie lists
sessions from the Gateway, but the Telegram conversation is not a Julie conversation,
does not carry the Julie roster context, does not appear in Julie rooms, and does not
use Julie's aliases.

Consequence: there are two front doors with different identities and different
history. This is the strongest version of the owner's "another system" concern.

Recommended target: choose one explicitly.
- **Option A (Julie front door):** an OpenClaw-side ingress binding/hook/plugin
  forwards channel messages to a Julie API endpoint, and Julie dispatches through the
  Gateway. Requires an OpenClaw config change, backup, and owner approval.
- **Option B (OpenClaw front door):** accept that channels talk to OpenClaw, and make
  Julie a control plane that observes those sessions. Then Julie must not pretend it
  owns channel conversations.
- Doing neither is the current, inconsistent state.

### P1-1 — Transcript ownership is ambiguous and unreconciled

Evidence:
- `conversations.gateway_session_key` links to a real Gateway session, but Julie's
  chat view reads only `messages` in SQLite (`routes.ts` conversation endpoints).
  `gateway.chatHistory` is used only for agent chats (`agent-chat.ts`).
- Rooms store `agent_room_messages` locally while also dispatching real Gateway turns
  (`agent-rooms.ts`), with no history merge.
- External-channel sessions never enter the local transcript.

Consequence: compaction, channel traffic, or a Gateway-side reply can leave Julie's
history different from the Gateway's. For a distributable product this is the main
"why are there two systems?" symptom.

Recommended target: OpenClaw is the transcript system of record. Julie keeps:
- a durable **outbox/queue** and local-only annotations (delivery state, local
  removal), and
- a **cache** reconciled from `chat.history` on conversation open and after
  reconnect, with a visible "local only" state for messages the Gateway never saw.

### P1-2 — Workspace membership is stored twice inside Julie

Evidence:
- `agent_profiles.workspace_id` (legacy "primary workspace") and
  `workspace_agents` (many-to-many) both encode membership. Both are written in
  `setAgentWorkspaceAssignments`, and a repair path in `agent-assignments.ts` rewrites
  the legacy column.
- Live data: every profile has `workspace_id = 1` while the join table shows 1–2
  workspaces each. The column is already only a hint, not the truth.

Recommended target: keep `workspace_agents` as the only membership source. If a
"primary space" is useful, make it an explicit boolean on the join row, not a second
foreign key.

### P1-3 — "Workspace" means two different things

- Julie workspace = access scope for Julie conversations/agents/tasks.
- OpenClaw workspace = an agent's filesystem working directory
  (`agents.entries.<id>.workspace`, e.g. `…/agents/dev-builder`).

They are not synchronized. `workspace-plan.ts` creates Julie workspaces and
assignments only; it does not create OpenClaw directories (correct, given the
containment rule), but the shared word makes the product hard to explain.

Recommended target: rename the Julie concept in UI/docs to **Space** or **Project**,
or add an explicit mapping field when an OpenClaw workspace path is intended. Do not
silently equate them.

### P1-4 — Installability is currently host-specific

Evidence:
- No `README.md`, no `.env.example`, no `LICENSE`, `"private": true`, no `engines`.
- `deploy/julie.service` hardcodes `User=admin`, `/home/admin/julie`.
- `/home/admin` is hardcoded in `server/src/terminal.ts`.
- `/home/admin/julie` is embedded in the engineering policy prompt
  (`engineering-policy.ts`) and docs.
- `GATEWAY_URL` defaults to `ws://127.0.0.1:18789`; the live Gateway rejects the token
  in `openclaw.json` and requires the runtime `OPENCLAW_GATEWAY_TOKEN`
  (`docs/INTEGRATIONS.md`). Discovery is manual.
- Schema setup is ad hoc: `CREATE TABLE IF NOT EXISTS` at boot plus per-module
  `ensureTable()` (`agent-actions.ts`). Running services do not get schema upgrades
  until restart; there is no schema version.
- No automated tests and no CI; verification is ad-hoc scripts.

Consequence: a new user cannot install this without reading the maintainer's private
notes and editing host-specific files.

### P1-5 — Local data permissions are too open for distribution

Evidence: `data/` is mode `775` and `data/julie.db` is `644` (world-readable), while
`.env` is correctly `600`. Backups under `data/backups/` are `600` but one contains
OpenClaw configuration material (token/API-key markers were found by key name only).

Recommended target: create `data/` at `700`, the database at `600`, and document that
backups never ship. Keep the existing containment rule.

### P2-1 — Deployment identity is hardcoded in code

- `main` is assumed in at least nine places: delegation gate
  (`agent-chat-live.ts`), directory ordering, org validation
  (`agent-organization.ts`), room membership (`agent-rooms.ts`), default tool agent
  (`gateway.ts`), task default agent (`routes.ts`), workspace lead selection
  (`workspace-plan.ts`).
- `ENGINEERING_DEPARTMENT = "Product & Technology"` hardcodes a department name.
- `OPENCODE_PRIMARY_MODEL` / `OPENCODE_FALLBACK_MODEL` hardcode model IDs.
- `terminal.ts` hardcodes `/home/admin` and a denylist.

Recommended target: resolve the executive agent once from the Gateway roster
(`defaultId` / `mainKey`) into `config.executiveAgentId`; move department and model
policy to config/env with documented defaults; make the terminal optional and
root-configurable.

### P2-2 — Hand-rolled Gateway protocol client

`gateway.ts` implements the handshake, device identity, capability negotiation, chat
reduction, and session lifecycle directly (about 740 lines). It works and is
well-commented, but it is the component most likely to break on an OpenClaw upgrade
and the least portable part of the product. OpenClaw documents an official client
surface (`@openclaw/gateway-protocol`, `GatewayClientHostDeps`). Evaluate adopting it
or, at minimum, add a protocol contract test and a supported-version check in
`/api/health`.

### P2-3 — Terminal bridge is a public-install liability

The owner-only terminal executes arbitrary `bash` with a regex denylist
(`terminal.ts`). A denylist cannot prevent exfiltration (`cp .env /tmp/x` is not
matched), and the feature is enabled by default. For a distributable build it should
be disabled unless `TERMINAL_ENABLED=1`, with an explicit allowlist and per-command
confirmation, or removed from the public distribution.

## Target ownership matrix

| Data | Owner | Julie behavior |
|---|---|---|
| Agent ID, public name, emoji, model, agent workspace dir, tool/skill policy | OpenClaw | Read live; write through Gateway APIs; never cache the public name |
| Agent role, department, reporting line, schedule, human-name policy | Julie | Local org metadata; human name also written to Gateway identity |
| Sessions and transcripts | OpenClaw | Link by `sessionKey`; reconcile from `chat.history`; local rows are cache + outbox only |
| Julie conversations, queue, delivery state | Julie | Local, keyed to a Gateway session |
| Tasks, task activity, rooms, room messages, workspace plans, audit | Julie | Local (no OpenClaw equivalent) |
| Spaces/projects (current "workspaces") and membership | Julie | Local; membership only in `workspace_agents`; never imply an OpenClaw workspace path |
| Channels (Telegram, etc.) | OpenClaw | Either ingress to Julie (approved config change) or explicitly observed, not owned |
| Secrets and device identity | Julie (local) | `.env` 0600, `data/` 0700, DB 0600; never ship backups |

## Recommended sequence

### Phase 0 — make it installable without breaking current use
1. Add `README.md`, `.env.example`, `LICENSE` decision, `engines: node >=22.19`.
2. Add `npm run setup`: discover the Gateway URL/port from
   `openclaw gateway status --json --no-probe`, prompt for the runtime token, generate
   `ADMIN_TOKEN`, write `.env` at `0600`, never overwrite silently.
3. Replace `/home/admin/julie` in prompts/service/docs with `config.root` and a
   systemd template plus `scripts/install.sh`.
4. Harden permissions: `data/` 0700, DB 0600, uploads 0700.
5. Disable the terminal bridge by default.
6. Introduce a real migration runner (`PRAGMA user_version`) and stop creating tables
   at module import.
7. `/api/health` reports gateway version, protocol, schema version, and Julie agent id.

### Phase 1 — remove duplicated ownership
1. Human name is written to OpenClaw `identity.name`; role/department remain Julie.
   One rename path, Gateway-first, partial-failure reporting.
2. Remove `agent_profiles.workspace_id`; keep `workspace_agents` only.
3. Rename Julie "workspace" to "space/project" in UI and docs (or add explicit
   OpenClaw workspace mapping).
4. Resolve `main` from the Gateway roster into config; remove the nine hardcoded
   assumptions.
5. Move engineering department/model policy and terminal root to config.

### Phase 2 — one coherent conversation story
1. Reconcile Julie conversations from `chat.history` on open/reconnect; label
   local-only rows.
2. Decide the channel front door (Option A or B above) and implement it with an
   OpenClaw backup and owner approval.
3. Make channel-originated sessions visible in Julie with honest provenance.

### Phase 3 — distributable product
1. Installer/quickstart, upgrade guide, supported OpenClaw version range.
2. CI: build, typecheck, schema migration test, auth smoke test.
3. Gateway protocol contract test; evaluate the official client.
4. Release hygiene: no `data/backups`, no host-specific docs, license and repository
   metadata, versioned releases.

## Decisions the owner must make

1. **Display name ownership:** Gateway `identity.name` = human name (recommended), or
   Julie-only aliases with the known channel mismatch.
2. **Channel front door:** route Telegram and others into Julie (requires an OpenClaw
   change, backup, approval), or accept OpenClaw as the channel owner and make Julie
   observational.
3. **Distribution shape:** single-owner self-host (current constitution) or public
   multi-user. This decides whether the terminal, auth, and DB permissions are
   acceptable.
4. **License/visibility:** the repository is currently `private` with no license.

## Acceptance checks for "anyone can install and use"

- Fresh clone on a clean host: `npm ci && npm run build && npm run web:build &&
  npm run setup && npm start` reaches `/api/health` with `gateway.connected: true`.
- No file outside the checkout is required to boot; all host paths come from config.
- A new owner can rename an agent once and see the same name in Julie and in a
  Telegram/OpenClaw session.
- A conversation opened after a Gateway-side change (`chat.history`) shows the same
  transcript in Julie, with local-only messages clearly labeled.
- `git archive` of a release contains no `data/`, no `.env`, and no backups.
- Removing `main`, renaming the engineering department, or changing the OpenCode model
  requires configuration only, not a source edit.
