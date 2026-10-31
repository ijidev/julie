# Changelog

## Wayfairs — complete customer and admin workspace redesign (2026-10-31)
### Added
- Consolidated customer `/transactions` and administrator
  `/admin/transactions` pages with persisted-record metrics, search, currency /
  status filters, amount direction, and links to the relevant receipt or
  customer profile.
- A shared authenticated-app design system in `public/assets/app.css`: desktop
  context bar, responsive page framing, metrics, action tiles, form panels,
  record lists, transaction rows, destination cards, verification states,
  collapsible currency editors, decision queues, and print treatment.
- Real customer directory metadata (account and active-restriction counts),
  customer account hold details, and observed account/session facts for the
  security page.

### Changed
- Rebuilt every customer surface: overview, currency statement, transactions,
  receipt, deposit, withdrawal, transfer, invoices, verification, and security.
  The overview still presents exactly one selected-currency balance; no
  cross-currency balance is invented.
- Rebuilt every administrator surface: operations dashboard, customers,
  customer detail, transactions, deposit and withdrawal decisions, currencies,
  site information, and audit log.
- Receipt page now renders as a print-ready transaction document with persisted
  status, amount direction, account, fee, counterparty, timestamps, and copyable
  public reference instead of a generic definition list.
- Deposit and withdrawal forms now expose selected-currency minimum, fee, and
  available facts in structured summaries, publish destination details in
  responsive cards, and disable mutation controls when KYC is not verified.
- Currency management no longer renders every large form at once. Each asset
  has a compact live-state summary and an independently expandable editor;
  creation and destructive removal remain explicit.
- Shared navigation now includes Transactions, highlights receipts as part of
  transaction history, and provides consistent desktop/mobile account context.

### Verified
- `php -l` clean across all PHP sources; CSS brace check 746/746; `git diff
  --check` clean; integration suite 28/28.
- Fresh authenticated crawl of 20 customer/admin routes, including both new
  transaction pages, customer detail, currency statements, and receipt: all
  HTTP 200 with zero PHP warnings under `display_errors=1`.
- Live redesigned withdrawal flow: BTC 0.001 changed available/held from
  `100000/0` to `0/100000`; admin rejection restored `100000/0` and persisted
  `rejected`.
- Live redesigned deposit flow: BTC 0.001 entered the operations queue and an
  administrator rejection persisted `rejected` with its decision reason.
- Customer pages continue to omit disabled NGN, and the overview renders one
  selected balance card with its real account selector.

### Honest limits
- Visual responsiveness is implemented and route-rendered, but this host has no
  browser binary for screenshot comparison; final aesthetic approval on the
  owner's physical target devices remains an owner review.
- Settlement remains manual and SQLite remains preview-only. No provider,
  blockchain confirmation, reconciliation, or MySQL concurrency result is
  inferred by the redesign.

## Wayfairs — banking UI and workflow repair (2026-10-31)
### Added
- `project/wayfairs`: admin deposit and withdrawal queues now use dedicated
  decision cards with labelled reason and external-reference fields, amount,
  destination, customer, and date facts, plus a separate decision-history table.
- `project/wayfairs/tests/run.php`: regression coverage for signed flash
  payloads containing punctuation and for required withdrawal destination
  fields.
- `/admin/assets`: per-asset deposit destinations (bank details or wallet and
  network) editable in major units with missing-destination warnings.

### Changed
- Customer dashboard shows one active-currency balance card with available,
  reserved, and total ledger figures, account switching, KYC/restriction state,
  and real recent activity instead of a currency grid.
- Deposit and withdraw pages are type-aware: published destinations, minimums,
  fees, availability, no-JS first-panel fallback, and empty states are all read
  from persisted asset configuration.
- Landing page rebuilt around real enabled assets and the manual settlement
  flow; all sample balances and NGN references were removed.
- Admin dashboard now reports live customer, verification, deposit, withdrawal,
  and restriction counts with real work queues.
- Ending administrative impersonation restores a fresh administrator session
  instead of signing the administrator out.
- Mobile navigation closes on link selection as well as outside click/Escape.

### Fixed
- Flash messages containing periods never displayed because the payload was
  split at the first `.` inside the JSON; the separator now comes from
  `strrpos`, with tamper rejection retained.
- Customer dashboard returned 500 because the route closure did not capture the
  database handle used to read held amounts.
- Withdrawal submission accepted empty destinations; fiat and crypto fields are
  now validated server-side by asset type.
- Admin asset limits and fees were edited in minor units; they now use plain
  major-unit decimal inputs with the asset scale.

### Verified
- `php -l` clean across `app/`, `public/`, and `tests/`; 28 integration tests pass.
- Authenticated crawl of `/`, `/dashboard`, `/deposit`, `/withdraw`, `/transfer`,
  `/invoices`, `/kyc`, `/security`, `/accounts/{code}`, `/admin`, `/admin/users`,
  `/admin/deposits`, `/admin/withdrawals`, `/admin/assets`, `/admin/settings`,
  `/admin/audit`, a customer detail page, and a receipt returns 200 with no PHP
  warnings under `display_errors=1`.
- Live BTC withdrawal round-trip: submit 0.001 reserved funds, admin rejection
  released the hold and restored the balance.
- Live deposit queue round-trip: submit 0.001 BTC, reject with reason, decision
  history recorded, dashboard count returned to zero.
- Live impersonation lifecycle: banner shown, withdrawal mutation blocked, and
  stop-impersonation returned to the administrator session.

## Fintech FIN-020 — secure application foundation (2026-10-30)
### Added
- npm-workspace modular monolith under `project/fintech`: NestJS 12 API and one
  launch process serving the React 19/Vite build under Julie's authenticated
  project subpath.
- Backend-sourced health/readiness/capability APIs, request IDs, strict request
  validation, security headers, shutdown hooks, subpath-safe assets/API calls,
  and a responsive evidence shell. All eight product capabilities are explicitly
  unavailable and financial execution remains disabled.
- Owner-selected local SQLite build with checksum-tracked migrations, 0700/0600
  storage, integrity probes, and database-enforced append-only audit events.
- Matching MySQL 8.4+/InnoDB `database/mysql/001_foundation.sql` plus an import
  guide for phpMyAdmin/MySQL CLI. It contains only implemented persistence;
  real-MySQL behavior remains an explicit pre-hosting verification gate.
- API/migration and subpath URL tests, local secret-pattern and paired-dialect
  migration checks, GitHub CI, and Dependabot configuration.

### Changed
- Replaced the provisional PostgreSQL/Prisma choice with the owner's SQLite-now,
  MySQL-hosting decision across guardrails, architecture, delivery, decisions,
  task #127, runtime evidence, and docs.
- Upgraded NestJS to the non-advisory release line and removed Prisma after npm
  exposed five high-severity transitive advisories. Final audit: zero
  vulnerabilities; install scripts are limited to reviewed exact
  `better-sqlite3` and `esbuild` versions.

### Fixed
- The first launch exited `ERR_MODULE_NOT_FOUND` because compiled API code sat
  outside the npm workspace owning one runtime dependency; Julie correctly
  surfaced failed/502. API output/start now stay in the workspace, and the
  corrected process listens on port 4100.
- Nest/Vitest tests now use explicit injection tokens. Migration scratch data
  stays in project-local gitignored `data/` after `/tmp/opencode` proved
  non-writable for this account.

### Verified
- Full `npm run verify`: secret scan, SQLite/MySQL artifact validation, strict
  API/web typechecks, 8 tests, and both production builds.
- SQLite quick/integrity checks, migration checksum, modes 0700/0600, zero npm
  advisories, and no unreviewed install scripts.
- Project `running`; unauthenticated route 401; authenticated page, JS asset,
  health, and capabilities 200; project subpath base verified.
- Runtime evidence: SQLite connected with one migration, MySQL target not
  connected, financial operations disabled, all eight capabilities unavailable.

### Honest limits
- No financial/customer domain endpoint or provider integration exists. The
  MySQL migration has not run against a real MySQL server because none is
  configured; SQLite results are not represented as MySQL concurrency proof.

## Fintech project planning baseline (2026-10-30)
### Added
- `project/fintech/`: an owner-gated, responsive kickoff page and scoped
  `AGENTS.md` guardrails for a ledger-first fintech banking platform.
- Product requirements for customer/operations roles, KYC, fiat and crypto
  movement, transfers, invoices/receipts, restrictions, history, audit, and
  reconciliation.
- Proposed NestJS/PostgreSQL/React modular-monolith architecture with immutable
  double-entry ledger invariants, provider adapters, durable inbox/outbox,
  server-side authorization/restrictions, dual control, privacy, and one
  subpath-aware launch entry point.
- Phased delivery, security/compliance baseline, and project decision log with
  six explicit owner decisions and production blockers.
- Web Development workspace tasks #125–#138 (`FIN-000`–`FIN-130`) with observed
  initial states and valid assigned workspace agents.

### Configured
- Registered slug `fintech` in Julie's real project registry, linked it to Web
  Development (workspace #3), inherited the seven-member workspace team, and
  launched the static project at `/project/fintech/`.
- Used the configured `/home/admin/julie/project` root because the requested
  literal `/Julie/project` path does not exist. Preserved the prior
  `project/fintech-tech-stack-recommendation.md` draft unchanged.

### Verified
- Backend TypeScript and Vite production builds pass.
- Auth gate (401 unauthenticated), authenticated project HTML/CSS (200), project
  API registry/workspace/team projection, 14 persisted task rows, local-link
  integrity, SQLite integrity, and Julie/Gateway health.

### Honest limits
- The launchable artifact is the reviewed planning baseline. It does not yet
  implement or simulate banking, KYC, payment, custody, ledger, or transaction
  APIs, and no live funds, mainnet keys, production provider credentials, or
  customer PII were introduced.

## Phase 0 — installability and security slice (2026-10-30)
### Added
- `README.md`: prerequisites, one-process architecture, quick start, full
  configuration table, doctor, systemd install, security model, and an explicit
  "what is honest / what is not there yet" section.
- `.env.example` with the three required secrets and every optional override.
- `LICENSE` (proprietary, all rights reserved) plus `package.json` `license`,
  `engines` (Node >= 20.11), and a `doctor` script.
- `scripts/julie-doctor.mjs`: read-only discovery for Node version, `.env`
  permissions, required-secret presence (never values), data/database
  permissions and integrity, schema version, both builds, OpenClaw CLI, Gateway
  service state/port, Gateway URL consistency, and running Julie health.
- `deploy/julie.service.template` and `deploy/install-service.sh`: the unit is
  rendered with the real checkout path, service user, and node binary instead of
  committing one host's paths.

### Changed
- Configuration no longer assumes `/home/admin/julie`. The repository root is
  derived from the module location; `JULIE_DATA_DIR`, `DB_PATH`, `GATEWAY_URL`,
  `JULIE_TERMINAL_ROOT`, and `OPENCLAW_BIN` are overridable. The engineering
  prompt now uses the real root, and the terminal confinement uses the configured
  root instead of `/home/admin`.
- Schema creation is versioned with `PRAGMA user_version`; the old ad-hoc
  `migrate*()` functions are now one guarded migration. `run_actions` moved from
  an import side effect in `agent-actions.ts` into the schema.
- The data directory is forced to 0700 and the database/WAL/SHM files to 0600 at
  boot.
- Owner terminal is disabled by default (`JULIE_TERMINAL_ENABLED=false`). When
  disabled, the WebSocket upgrade is not attached and the UI shows an honest
  disabled state. When enabled, symlink-resolved confinement replaces the old
  `/home/admin` prefix check. Removed duplicate per-upgrade connection-handler
  registration that could re-execute a command.
- `/api/health` reports `version` from `package.json`, `schemaVersion`, and
  `terminal.enabled` instead of a hardcoded version.
- `docs/DEPLOYMENT.md` uses the installer and template and documents storage,
  permissions, migration version, and the updated verification checklist.

### Verified
- Backend build and web typecheck/build.
- Migration applied to the live database (`user_version` 0 → 1) with tables and
  data intact; data directory 0700 and database 0600.
- Health reports version, schema version, and terminal state; terminal disabled
  by default; unauthenticated reads still 401.

## Phase E6 — OpenCode-first collaboration and real activity streaming (2026-10-30)
### Added
- OpenCode-first engineering execution: project-native `.opencode` agent/skill
  configuration, reviewed primary/fallback model policy, and
  `docs/ENGINEERING_OPERATING_SYSTEM.md`.
- Reviewed human names for the office roster while canonical Gateway IDs remain
  the runtime identity.
- Runtime-enforced delegation: owner `@mentions` resolve to canonical agent IDs,
  open a named durable session before Julie's turn, persist delegation and
  completion/failure system messages, and direct Julie to report rather than
  repeat the work. Delegated sessions claim a durable Gateway label.
- Default-chat controls: durable local FIFO queue, Gateway abort/Stop,
  pre-dispatch recall, local-only removal, copy, attachment gating, @mentions,
  and conversation deletion.
- Room membership editing, @mentions, department rooms, and a lead team room.
- Two-step workspace wizard with explicit shared-pool vs dedicated-team choice,
  Julie planning, review, confirmation token, apply, and receipt.
- `server/src/agent-actions.ts`: real Gateway `agent` frames reduced to durable
  `run_actions` rows and live SSE `action` events; `tool-events` capability
  advertised by the Gateway client.
- Shared `AgentActivity` timeline in Chat and Agent Messenger showing commands,
  file edits, approvals, outputs, and terminal failed/stopped states.
- System coordination messages are visually distinct from owner/assistant chat.
- `server/src/agent-directory.ts` and `server/src/julie-operations.ts`: live
  roster context, mention resolution, delegation directive, and Julie's
  operating rules injected into prompts.
- `docs/JULIE_OPERATIONS_GUIDE.md` and `docs/ARCHITECTURE_AUDIT_2026-10-30.md`.

### Changed
- Conversation turns now compose the runtime prompt (operations context, live
  roster, delegation directive) and dispatch mentions before Julie's own turn.
- Chat header shows honest live state, queued follow-up custody, and composer
  behavior; delegation notes render as system notes.
- New direct/delegated sessions claim a unique Gateway label so a failed
  background title generation cannot leave a real session unnamed.

### Verified
- Backend build, web typecheck, web build, restart, health (Gateway 2026.10.5).
- Auth gate: unauthenticated conversation/tool reads return 401.
- Live API reads and conversation SSE `hello` with `actions`.
- Real `@Victor` delegation round-trip: resolved to `dev-builder`, durable named
  session created, honest failure reported by Julie; test data cleaned up.

### Known limits
- The delegated child run failed on OpenClaw provider auth; task 108 stays
  `pending_review` until a live agent/OpenCode run succeeds.
- Channel front door and structural audit fixes remain future phases.

## Phase E5 — Office operations, hierarchy, messenger, and rooms (2026-10-29)
### Added
- Nine high-priority E5 milestones (tasks 95–103), with real assignees and status
  transitions recorded before implementation. Lower-priority backlog work stayed
  paused.
- Authoritative optional task assignee (`assigned_agent_id`), append-only task
  activity, server-derived statistics, workspace/live-roster validation, and
  assigned-agent execution. Task and conversation Gateway session keys are no
  longer browser fields.
- Modern responsive Task Operations page: KPI strip, search/status/priority/
  assignee filters, board/list modes, ownership, live-run evidence, safe task
  editor, agent result, and activity timeline.
- Explicit office hierarchy API/UI: owner/CEO → Julie (`main`) → Product &
  Technology and Business & Growth leads → seven specialists. All 10 active
  workspace agents now have a configured role, department, reporting parent,
  role-specific identity, SOUL, and operating charter.
- Main-agent lifecycle training (`OFFICE_ORG.md`, `AGENT_LIFECYCLE.md`, and
  `AGENT_TEMPLATE.md`) plus hierarchy-scoped OpenClaw spawn allowlists. A fresh
  real `main` session reproduced the complete create/delete safety sequences.
- `/agent-messenger`: real per-agent inbox, multiple Gateway sessions per agent,
  explicit unsent new-session drafts, bounded sanitized history, exact run state,
  open assigned-task counts, and direct owner DMs.
- Persistent task rooms: SQLite room/member/message tables, authenticated API,
  private per-member Gateway sessions, sequential shared-transcript dispatch,
  confirmed/local/failed delivery states, sanitized SSE progress, archive/reopen,
  task activity links, and a responsive Task Rooms UI inside Agent Messenger.
- `scripts/test-e5-office.mjs` (9/9): auth, task statistics/assignment, session-key
  redaction, organization invariants, confirmation gates, room projections/SSE,
  and linked agent task history.

### Fixed
- Restored the center mobile-footer microphone (Home / Chat / Talk / Agents /
  More) and removed the unwanted AI Center route, tiles, CSS, and automatic
  session-creating commands. Voice targets the selected existing Chat
  conversation and never silently creates one.
- Repaired the workspace `opencode-cli` skill's missing frontmatter after a
  timestamped backup; it is now eligible and model-visible.
- Corrected mismatched copied agent identities/charters (Researcher/Reviewer/
  Chief of Staff templates attached to unrelated IDs).
- Stopped repeated OpenAI placeholder-key memory embedding 401s by explicitly
  selecting documented keyword-only `memory.search.provider: none`; FTS is
  ready, semantic vectors are intentionally disabled until a real provider is
  configured.
- Removed unsupported `system.get-health` polling. Julie now proves live Gateway
  status directly with documented `sessions.list`, eliminating a successful
  check's recurring `INVALID_REQUEST` log.
- Agent overview/detail now project real linked tasks instead of claiming task
  assignment is unavailable.

### Verification
- Backend strict TypeScript, frontend strict TypeScript, and Vite production
  builds pass. Markdown regression: 2/2. Phase C regression: 47/47. E5 office
  regression: 9/9.
- Live DM: a new Operations Lead session returned exact `OPS-DM-OK`, with no
  session key, run ID, or host path in the response.
- Live room: owner → Julie confirmed reply → Engineering Lead confirmed reply
  acknowledging Julie's message. After restarting Julie, room #1 retained task,
  members, and transcript; the same stored lead session returned
  `ROOM-RESUMED`.
- OpenClaw config validates; identity/delegation changes hot-reloaded without a
  Gateway restart. Julie health is ok and connected to Gateway 2026.10.5.

### Honest boundaries
- Direct DMs wait for a completed Gateway reply rather than streaming tokens.
- Room transcript/member state survives Julie restarts, but an in-flight room
  dispatch is process-local and is not recoverable after a Julie restart.
- Existing historical “AI Center conversation” rows were preserved; the removed
  UI can no longer create new ones.
- The community Bailian voice plugin still reports `provenance-invalid`; it was
  inspected but not automatically trusted, allowlisted, removed, or reinstalled.

## Gateway outage — invalid config key repaired (2026-10-29)
### Fixed
- A second config rewrite at 11:43:58 added unsupported
  `models.openAiChatCompletionsEnabled` and
  `models.openResponsesEnabled`. Hot reload rejected the file; the subsequent
  Gateway restart stopped at `78/CONFIG`. The broken file was backed up as
  `openclaw.json.bak.pre-model-endpoint-key-fix-20261029T115020`, only those two
  keys were removed, config validation passed, and the user Gateway unit was
  restored. OpenClaw reported `ready` at 11:51:18 and Julie reconnected to
  server 2026.10.5. No host reboot occurred.
- `~/.openclaw/openclaw.json` carried `tools.sessions.agentToAgent: true`,
  which the 2026.10.5 schema rejects (`tools.sessions` only accepts
  `visibility`; `agentToAgent` is now a sibling object). Every Gateway start
  aborted with exit `78/CONFIG`, and `RestartPreventExitStatus=78` kept the
  unit from retrying, so the Gateway stayed down after the 01:39 restart.
  Repaired by moving the key to `tools.agentToAgent: { "enabled": true }`
  (same intent as `true`), after backing up to
  `openclaw.json.bak.pre-agenttoagent-fix-20261029T075442`. Validated with
  `openclaw config validate`, then `systemctl --user reset-failed` +
  `restart openclaw-gateway.service`; `/api/health` reports
  `gateway.connected: true` (server 2026.10.5) and a live chat turn completed
  through `202 → accepted → complete`.
- Julie-side behaviour confirmed during the outage: a Gateway that is up but
  still finishing agent admission answers `chat.send` with `UNAVAILABLE`; the
  route returns that as a 502 with the real reason, rolls back the stored user
  message, and clears `activeRun` (no phantom pending turn).

## Chat realtime + attachments (2026-10-28)
### Added
- Chat sends acknowledge immediately via the real Gateway `chat.send` (202),
  with the reply persisted server-side in a background run monitor; the
  browser subscribes to `/api/conversations/:id/messages` events only through
  the sanitized SSE projection.
- Live run states in ChatView: send → Gateway ack → Gateway phase labels →
  streaming response text → saving → persisted message, plus reconnect
  restore of in-flight runs (`hello` activeRun snapshot + messages-load
  activeRun).
- `POST /api/upload`: authenticated multipart (native `Response.formData()`,
  no new dependency), magic-byte + extension/MIME validation, 8 MB / 6 MB
  (image) limits, forwarded to `chat.send` `attachments` (decision D-024).
- Composer paperclip + attachment chip with real file sizes (single file per
  turn; images/PDF/text files).
- Custom conversation picker replacing the native `<select>`, with a
  per-row delete button wired to `DELETE /api/conversations/:id` (409 while a
  run is active). Multi-file upload stub and its multer disk-store were
  consolidated away (dependencies `multer`/`@types/multer` removed).

### Fixed
- Chat route scrolling: `.main.chat-main` locks height at `100dvh` with
  hidden overflow; only `.chat-log` scrolls, desktop and mobile.
- `deleteConversation` stray `X-Julie-Confirm` fallback fetch replaced by the
  typed API method.

## Phase E0 — Stability, Chat, and command-center shell (2026-10-28)
### Fixed
- Removed the Home microphone orb and visible floating FAB; retained the center
  footer AI microphone as the single global voice entry point.
- Fixed Chat's deterministic out-of-memory crash: recursive Markdown rendering
  no longer resets a shared global regex cursor.
- Reduced avatar-message, chat-preview, card, and quick-reply density for phones.
- Right-aligned the live gateway status in a collision-safe top bar.

### Added
- Real Chat workspace inventory, persisted workspace activation, create-and-
  activate dialog, scoped transition clearing, and honest async/error states.
- Full grouped sidebar navigation for command, operations, and system routes.
- Explicit planned-capability pages for Projects, Automations, Settings, and
  Future Lab so unfinished links never imply working functionality.
- Redesigned five-item mobile footer: Home, Chat, AI voice, Agents, More.
- Route error boundary plus shared loading/empty/error presentation for major pages.
- `scripts/test-markdown.tsx` regression coverage for recursive inline Markdown.

### Verification
- Strict backend + frontend builds pass; Markdown tests 2/2 and the expanded Phase C tests 47/47.
- All 12 shell routes return 200; service health is ok; real gateway is connected
  at server version 2026.10.5.
- Julie task rows 25–32 are done; 42 scoped Phase E tasks remain in backlog.

### Agent capability audit
- Added `docs/AGENT_GATEWAY_CAPABILITIES.md`, based on installed 2026.10.5
  protocol docs and read-only live RPC calls. It defines honest sources for
  roster, identity, sessions, activity, tools, skills, history, token/cost usage,
  SOUL/bootstrap files, workspace browsing, and supported agent mutations.
- Explicitly classified formal role, duty state, semantic activity, task
  assignment, productivity/struggle, salary, generated avatar, and model busy
  status as unavailable or Julie-owned future data rather than Gateway facts.

### Agent Archive
- Added authenticated `GET /api/agents/overview`, combining live `agents.list`,
  paginated `sessions.list`, `sessions.usage`, agent-scoped `tools.catalog`, and
  `skills.status` calls with partial-failure handling and a 30-second cache.
- Sanitized the legacy agent response and overview: no host workspace/storage
  paths, raw session keys, or raw active-run IDs reach the browser.
- Rebuilt `/agents` with real summary cards, search, status/model filters, exact
  run-state labels, identity/model/runtime facts, latest session context,
  30-day tokens/cost, tool groups, eligible skills, and honest missing fields.
- Expanded `scripts/test-phase-c.mjs` to 11 tests, including overview auth,
  activity-state vocabulary, shape, and host-path/run-ID non-disclosure checks.

### Single-Agent Profile
- Added authenticated, 30-second-cached `GET /api/agents/:id` with partial
  failure handling across roster, sessions, usage, tools, skills, effective
  identity, bootstrap files, SOUL, and commands.
- Added `/agents/:id#overview`, `#activity`, and `#capabilities` UI tabs with
  responsive profile, model routing, safe personality summary, usage/session,
  tool, skill, and command views.
- SOUL parsing returns only bounded headings and a secret-pattern-filtered prose
  excerpt; raw file content and file hashes remain server-side.
- Added strict unknown-agent 404 handling and expanded the regression suite to
  14/14 tests.

### Per-Agent Chat & History
- Added authenticated `GET /api/agents/:id/sessions/:sessionId/history` and
  `POST /api/agents/:id/chat` without exposing a generic Gateway proxy.
- Session IDs are resolved and ownership-checked on the server; Gateway session
  keys and run IDs never reach the browser. New conversations receive a private
  agent-qualified key generated by Julie's backend.
- Added a responsive Chat profile tab with session selection, new-session flow,
  sanitized history, Markdown replies, real pending/completed/error delivery
  states, and manual history refresh.
- Hardened the shared Gateway text extractor for legacy direct-string and modern
  structured content. Agent history omits non-user/assistant rows and redacts
  common credential patterns plus OpenClaw host paths.
- Verified a real Gateway send/final-reply round-trip; regression suite is 18/18.

### Agent Usage Statistics
- Added a shared server projection that aggregates only reported
  `sessions.usage` model rows by provider/model.
- Added archive-wide top-model usage, per-agent most-used model, and profile
  Activity breakdowns for model calls, tokens, cost, cache, and missing prices.
- Kept Gateway pending/no-data/unavailable states and reported zero costs intact;
  no character-based token or local price guesses are introduced.

### HR Agent Onboarding
- Added SQLite `agent_profiles` for explicit Julie role, personality, schedule,
  timezone, workspace assignment, and tool/skill onboarding requests.
- Added live onboarding options and confirmed creation APIs plus a responsive
  five-step `/agents/new` wizard and creation receipt.
- Agent creation uses documented `agents.create`; personality is written to
  `SOUL.md` only with a Gateway hash/expected-missing precondition.
- Capability selections are stored as owner requests and visibly leave Gateway
  tool/skill policy unchanged.
- Backed up OpenClaw config (gitignored, mode 0600) before the owner-approved
  live mutation and retained verified agent `julie-command-center-qa`.
- Expanded regression suite to 22/22 without creating agents during routine tests.

### Agent Editing
- Added authenticated `PATCH /api/agents/:id` and an owner Edit Profile dialog.
- Gateway-owned identity/model fields use `agents.update`; Julie HR fields update
  SQLite, and capability requests remain explicitly non-policy metadata.
- Added field-level Gateway diffing so role-only edits do not resubmit an
  unchanged model or wait on unnecessary config application.
- Added marked HR-block SOUL merge with hash-guarded writes that preserve all
  non-Julie content.
- Verified a real Gateway rename of the retained QA agent with stable ID; tests
  now pass 24/24.

### Active-Workspace Agent Scoping
- Added `workspace_agents` many-to-many membership, migration of existing HR
  assignments, owner assignment APIs, and the **Manage Roster** dialog.
- Scoped archive totals/data and agent detail/chat/history/edit access to the
  active Julie workspace; unassigned direct access fails closed with 404.
- Added explicit shared-membership labels and multi-workspace checkboxes in the
  edit dialog. Workspace removal never deletes the Gateway agent.
- Assigned the legacy roster to Mission Control and explicitly shared retained
  QA with Working; live workspace-switch isolation passed.
- Expanded regression suite to 28/28.

### Office-World Visual MVP
- Added a responsive, dependency-free SVG/CSS office canvas with desks,
  computers, library, lounge, off-duty pods, hologram roster tokens, and an
  accessible profile-linked roster fallback.
- Added Archive / Office view controls on the active-workspace Agent page.
- Kept every token in an explicitly non-semantic roster staging area pending
  evidence-based activity mapping; no room location is fabricated.

### Evidence-Based Office Placement
- Added backend office placement evidence to every workspace-scoped agent row.
- Mapped only exact active runs to generic desks; added desk occupancy glow,
  zone counts, evidence labels, and accessible placement descriptions.
- Left library/lounge/off-duty at zero because the Gateway currently supplies no
  exact semantic reading, break, or duty-state event to Julie.
- Added regression assertions preventing non-working agents from being placed in
  semantic rooms.

### Personality-Derived Avatar Pipeline
- Added the responsive agent **Avatar Studio** with deterministic SVG fallback,
  visual-direction and owner-note controls, full prompt review, live provider /
  model selection, cost disclosure, candidate history, and separate apply review.
- Added authenticated avatar readiness/preview/generate/asset/apply endpoints;
  all remain scoped to active-workspace membership.
- Added a sanitized projection of `image_generate action=list`; configuration
  presence, last-attempt failure, and verified success are distinct states while
  auth hints and credentials remain server-side. Missing per-call estimates are
  shown as unknown, never zero/free.
- Added server-owned non-demographic prompt construction from safe identity, HR,
  and marked SOUL context. Prompt hashes prevent stale-preview generation.
- Added private mode-0600 `data/agent-avatars` storage with MIME/magic/hash/size
  checks. Generation stores one candidate and never applies it automatically;
  exact-image confirmation uses `agents.update` in a separate action.
- Recorded two explicitly approved provider attempts without retry: OpenAI
  rejected authentication and OpenRouter was blocked by its weekly key limit;
  neither returned an asset or changed agent identity.
- Replaced OpenRouter with OmniRoute in Julie's avatar allowlist. The installed
  Gateway does not register OmniRoute with `image_generate`, so the UI shows a
  live unsupported state instead of relabeling or covertly using OpenRouter.
- Added owner image upload/downscale/import, reviewed public HTTPS image URL
  application, private GLB 2.0 upload, and HTTPS `.glb` reference storage.
  GLB assets are honestly labeled Julie-only with no viewer/Gateway compatibility.
- Positively smoke-tested authenticated PNG and GLB storage/fetch, then removed
  the exact synthetic fixtures without changing Gateway identity.
- Expanded the regression suite to 47/47.

---

## Phase D-3.1 — Mobile stabilization & backlog closure (2026-10-27)
### Fixed
- Phone grid overflow: 3 equal `minmax(0, 1fr)` tracks, 8px outer gutter, and
  5px gaps; Home clips overflow and disables mobile text auto-inflation.
- Replaced fixed mobile type sizes with 29 compact viewport-aware `clamp()` rules.
- Split chat history from the avatar into its own card; bounded it to 168px with
  internal scrolling and two-line messages.
- AI Tools now fit 3-across inside the greeting card; labels safely ellipsize.
- Voice orb/FAB ring treatment refined; hologram shadow, strands, rim light, and halo refined.

### Added
- Owner avatar upload/downscale/remove UI in Profile; Home owner-avatar chip.
- Learned frequent prompts surfaced in Smart Shortcuts from `/api/prompt-usage`.
- Live `GET /api/trending` backed by DEV Community, real thumbnails, strict URL
  validation, 30-minute cache, and honest errors.
- Apps redesign for `/tools`: real gateway-derived availability plus persisted
  local pause/enable toggles; no simulated account connections.

### Changed
- Productivity uses distinct completed/evidenced tasks per day; score is the real
  done/total percentage. Message volume no longer masquerades as productivity.
- Julie SQLite task board audited and cleared: all D2 and D3 correction tasks done.

### Verification
- Strict backend + frontend builds pass; service health 200; gateway connected.
- Real gateway tool round-trip: 73 tools. Live trending: 3 validated articles.
- App preference write/restore round-trip passed; task board open count = 0.
- Phase C regression suite: 9/9 pass; all 3 live thumbnail URLs return HTTP 200.

---

## Phase D-1 — Home Dashboard Redesign (2026-10-26)
### Added
- **Home dashboard per owner reference**: deep near-black/navy glass panels, cyan/blue + violet hologram accents, 3-column desktop / 2-column tablet / single-column mobile (reference order)
- **Greeting card**: time-aware "Good morning/afternoon/evening, Ikenna", "What would you like to accomplish today?", animated waveform decoration, command input that posts into the current chat conversation
- **AI TOOLS card**: 6 tiles (Summarize, Translate, Write, Analyze, Design, Code) each posting a pre-filled prompt into the current conversation; "Explore all tools →" → /tools
- **SMART SHORTCUTS card**: Meeting Summary, Email Assistant, Study Helper, Plan My Day — icon + title + subtext + chevron; template prompts post into the current conversation
- **CONNECTED DEVICES card**: real gateway data via `node.list` (fallback `system-presence`); honest single "This device" row when no paired nodes are reported; "Manage devices →"
- **AI ASSISTANT panel**: luminous holographic SVG bust (glow layers, halo rings, chest circuit lines, scan line, floating particles), context bubble with real pending-task + open-conversation counts, chat preview of the latest 4 messages with avatar chips + user/AI bubble styles, quick-reply chips (Thanks! / 👍 / What's next? / Explain this) posting into that conversation
- **VOICE ORB**: circular glowing mic orb with pulsing rings; tap → /voice?start=1 (auto-starts the existing voice flow, which reuses the current conversation per Phase C.1)
- **WEATHER card**: Port Harcourt via wttr.in through new `GET /api/weather` (30-min in-memory cache); city, big temp °C, condition, mini forecast row (day/°/icon); honest fallback state with retry on fetch failure
- **AI INSIGHTS card**: 14-day message spark line + Productivity delta vs yesterday + score ring ((done + in_progress)/total tasks), all from new `GET /api/insights` (SQLite only); "No data yet" / "—" empty states
- **TODAY'S SCHEDULE card**: today's real tasks (created_at/run_started_at today or in_progress) with time, title, status chip (elapsed duration for in_progress); "View full calendar →" → /tasks; "Nothing scheduled for today" empty state
- **TRENDING FOR YOU card**: 3 curated public AI articles (plain URLs, new tab; verified HTTP 200; read times from live word counts); gradient thumbnails; "Explore more →"
- **Backend**: `server/src/weather.ts` (wttr.in + cache), `gateway.listNodes()`, routes `GET /api/weather`, `GET /api/devices`, `GET /api/insights`
- **`scripts/verify-d1.sh`**: session-authenticated endpoint verification script

### Changed
- `HomePage` fully rewritten to the reference design (all interactions post into the currently open conversation — Phase C.1 convId pattern — or navigate; never spawn sessions)
- `VoicePage`: auto-start listening when arriving via `?start=1` (orb tap = user gesture); conversation targeting unchanged (Phase C.1)
- `web/src/api.ts`: added `weather()`, `devices()`, `insights()` + types
- `web/src/styles.css`: new design tokens/components scoped under `.home-v2` / `.hv-*` (no changes to existing classes or pages)

### Verification
- ✅ `tsc` strict + `vite build` pass; service restarted; health 200
- ✅ All SPA routes 200 over HTTPS; gateway connected
- ✅ Real-data endpoints verified with session cookie; weather 30-min cache confirmed
- ✅ Bundle scan: zero fabricated devices/names/percentages/forecast values
- ✅ Independent tester subagent: 20/21 PASS (single FAIL re-verified as false positive — all widget markers present in the live bundle)
- ✅ Phase C.1 regressions re-checked: terminal WS 101, chat SSE, agents/tools, task CRUD, workspaces

---

## Phase C.1 — Correction Run (2026-10-26)
### Fixed
- **Terminal WebSocket Protocol**: Changed hardcoded `ws://` to protocol-aware `wss://` for HTTPS pages (was causing mixed content blocking)
- **Agents Page CSS**: Added `.empty-state` class styling; fixed blank rendering issue
- **Task Interactivity**: Added full CRUD operations (create, edit, delete, run tasks) via modal interface
- **Task Card Details**: Enhanced task cards to display description (120 chars), run output, timestamps, and status indicator dot
- **Bottom Navigation**: Reduced to exactly 5 items (Home, Chat, AI, Tools, Profile) per owner reference
- **Quick Shortcuts**: Moved Agents, Terminal, Tasks, Analytics to Home page as glass card shortcuts
- **Voice Conversation Reuse**: Fixed voice recording to reuse current conversation instead of creating new one per recording
- **Workspace Switcher**: Restored workspace selector in Profile page; added workspace scoping to Tasks, Chat, Voice pages
- **Chat Workspace Scoping**: Added workspace selector dropdown; conversations now filtered by active workspace
- **Profile Page**: Added workspaces management (list, create, activate)

### Changed
- Updated `styles.css` with new classes: `.empty-state`, `.shortcut-grid`, `.shortcut-card`, `.task-card`, `.status-pill`, `.status-dot`
- Updated `BoardView` component: Added editing modal, workspace selector, full task lifecycle controls
- Updated `VoicePage` component: Added workspace loading, conversation persistence, proper message reuse
- Updated `ChatView` component: Added workspace selector, conversation scoping
- Updated navigation: Moved Terminal, Agents, Analytics, Tasks from bottom nav to Home shortcuts

### Added
- Task card click-to-edit functionality
- Task status color indicators (backlog→dim, ready→cyan, in_progress→orange, pending_review→violet, done→green, blocked→red)
- Workspace scoping across all data views
- Quick shortcut grid on Home page

### Verification
- ✅ `npm run build` passes (backend TypeScript)
- ✅ `npm run web:build` passes (frontend Vite)
- ✅ Service restart successful
- ✅ Health check: 200 OK
- ✅ All SPA routes: 200 over HTTPS
- ✅ Gateway connected (server 2026.10.5, protocol 4)

---

## Phase D-3 — Mobile 3-column density + 3D hologram avatar (2026-10-27)
### Added
- Rewritten `HologramBust` SVG: layered-gradient 3D-style female hologram
  (volumetric hair, shaded face, rim light, bottom dissolve, pulsing chest core).
- Chest-core pulse keyframes (`hvCorePulse`), ambient aura, desktop bust resize.
### Changed
- Mobile home keeps the 3-column grid with center-dominant column ratio
  (1fr 1.12fr 1fr); desktop pinned symmetric.
- Mobile type scale bumped app-wide on the dashboard (greeting 18px, titles/rows
  +0.5–1.5px) so the 3-column layout reads intentional, not compressed.
- Grid gap 10px, card padding 12px, bust center panel enlarged (152×207).

---

## Phase D-2 — Global voice + personalization (2026-10-26/27)
### Added
- **Global voice FAB** (Chunk B): floating mic on every route; inline
  SpeechRecognition, transcript posts into the current conversation; off-/chat
  replies in a compact sheet. Shared `voice.ts` capture + `speaking.ts` TTS
  store; all wave components stay in sync app-wide.
- **Prompt-usage learning** (Chunk C): normalized+hashed real user messages into
  a bounded `prompt_usage` table (top-100 retention); `GET /api/prompt-usage`.
- **Owner avatar**: `/api/settings/avatar` CRUD — base64 jpeg/png/webp dataURL,
  magic-byte validated, ~1MB cap, stored in settings.
- **Task run-evidence**: `PATCH /api/tasks/:id` accepts `last_run_output` and
  `run_started_at` (backward compatible).
### Fixed
- Center nav AI item + Home orb trigger inline voice capture (no navigation).

---

## Phase C — Julie AiOS Rebrand & Command Center (2026-10-26)
### Added
- **Agents Page** (`/agents`): Real gateway agent directory (RPC-backed) with honest error states.
- **Tools Page** (`/tools`): Lists available gateway tools.
- **Analytics Page** (`/analytics`): Real local SQLite data aggregations (tasks by status, runs per day, messages).
- **Terminal Page** (`/terminal`): Secure WebSocket terminal with audit logging, rate limiting (10/min), and secret-pattern refusal.
- **Design System**: Dark holographic glass theme (Navy #070B14, Orange #FF7A1A) with mobile bottom nav.
### Changed
- Rebranded display strings to "Julie AiOS".
- Migrated SQLite schema to support audit logs.
### Fixed
- Mounted WebSocket terminal bridge on the main HTTP server.

---

*Last updated: 2026-10-28*

## E3-07 — OpenCode direct dashboard access (2026-10-28)
### Added
- Owner-authenticated, read-only bridge to the local OpenCode v2 background
  service (`server/src/opencode.ts`): loopback-validated service discovery from
  `$XDG_STATE_HOME/opencode/service.json`, Basic-auth GETs against the real
  2.2.0 API (`/api/info`, `/api/session`, `/api/session/:id/message`,
  `/api/agent`), sanitized and bounded payloads with the same credential/path
  redaction rules as agent chat.
- New endpoints under `/api/opencode/*` (status, sessions, session transcript,
  agents). All sit behind the owner session gate; unauthenticated requests are
  rejected with 401. No write, prompt, or permission endpoints in this slice.
- New `OpenCode` sidebar entry and `/opencode` page: live service status card
  (real version/pid/checked time, honest unavailable state), real session list
  with agent/model/token/cost/outcome, and a transcript view for text, reasoning,
  and tool messages with bounded tool input/output. Nothing simulated.
- Decision record D-022: read-only scope, loopback enforcement, and why the
  server hand-rolls the wire instead of depending on `@opencode/client`.

### Repurposed (owner direction, same day)
- The `/opencode` page is now an OpenCode activity/stats view: prompts, steps,
  tokens, active days/streak, tool success/failure, cost, a 14-day steps bar
  chart, per-model usage, live "In progress" sessions
  (`/api/experimental/session/stats` + `/api/session/active`), and a compact
  session history. The home-built transcript viewer was removed — deep
  interaction happens in OpenCode's default web UI, which the page links to via
  the service's advertised https tunnel URL (password-gated by OpenCode itself).
  Transcript endpoints remain available server-side for later use.

### OpenCode page polish + Projects registry (2026-10-28, same day)
#### Changed
- **OpenCode page scaled down and sharpened**: 960px content column, tighter
  card padding/type, compact stat tiles with accent hatch, slimmer steps bars
  with glow, subtler badges. Verbose transcript UI stays removed (#62 → done).
- **`/projects` is now a real registry** (E3-10): backed by the new
  `/api/opencode/projects` endpoint that reads OpenCode's `/api/project`
  records, groups duplicates by canonical path (OpenCode keeps two ids for the
  julie repo), and enriches them with per-path session counts from a bounded
  (400-session) scan. Browser payloads carry display names, VCS kind, sandbox
  counts, registration/activity times, and session counts — not host paths
  (decision D-022 wording extended in D-023).

## Phase E7 — Projects launcher, Settings center, Feature Lab, owner Profile (2026-10-30)
### Added
- `server/src/projects.ts`: discovery of `project/` folders into the `projects`
  table (slug/name/workspace/team/port), real launch/stop lifecycle with TCP
  readiness probes, PID reconciliation at boot, per-project log ring, static
  folder serving, and the owner-authenticated `/project/<slug>/` HTTP+WebSocket
  subpath proxy with edge HTML rewriting.
- `server/src/feature-lab.ts`: 19 capability gaps seeded into `feature_ideas`
  (source `julie`, two already `planned`) so the Feature Lab is a real store.
- `server/src/db-restore.ts`: staged backup restore applied at boot with a
  pre-restore safety copy; `/api/settings/health` reports `restore_pending`.
- API: `/api/projects*` (list/get/config/start/stop/logs/dirs), `/api/feature-ideas*`
  (CRUD, votes, request-task bridge), `/api/settings/health|backup|backups|restore|audit/clear|prompt-usage/clear|engineering`,
  `/api/profile/stats|activity|sessions`. Schema v2 migration (`projects`,
  `project_agents`, `feature_ideas`). Config: `JULIE_PROJECT_DIR`,
  `JULIE_PROJECT_PORT_START/END`.
### Changed
- Projects page rebuilt around real state: workspace/team chips, launch/open/
  port/stop/log/config actions, honest failure reasons, auto-refresh.
- Settings page is now four working tabs (System diagnostics, Data & Backups,
  Security posture, Engineering policy read live from the server).
- Profile page redesigned as owner identity (avatar, name/title persisted to
  settings, real session/gateway pills, workspace management, recent activity)
  instead of a metrics board.
- Feature Lab renders the database store only; static suggestion text removed.

### Wayfairs PHP banking script — production UI and route fix
- `project/wayfairs/public/assets/app.css`: replaced the minimal stylesheet with a full responsive design system (marketing hero, app shell, mobile navigation, cards, tables, receipts, empty states, dark-mode and print support).
- `project/wayfairs/app/Views/layouts/*.php`: rebuilt guest, customer, and admin layouts with sticky headers, sidebars, mobile menus, user chips, and footer variants.
- `project/wayfairs/app/Views/home.php`: expanded the landing page with hero, feature grid, how-it-works steps, security section, settlement transparency, and final CTA.
- `project/wayfairs/app/Views/auth/*.php`: polished sign-in and registration with stronger hierarchy and helper copy.
- `project/wayfairs/app/Views/user/dashboard.php`: account cards, recent-activity table, empty states, restriction banners, and KYC nudges.
- `project/wayfairs/app/Views/admin/dashboard.php`, `users.php`: refreshed operations dashboard and customer table.
- `project/wayfairs/app/Core/Request.php`, `public/index.php`, `app/routes.php`: fixed route-parameter propagation so admin customer detail pages load.
- Verified: PHP syntax checks pass, 25 integration tests pass, Julie-managed launch on port 4100 serves `/project/wayfairs/`, admin and test customer sessions work.
