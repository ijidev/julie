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

## D-010 — Live Trending source: DEV Community public API
Date: 2026-10-27
`GET /api/trending` fetches the fixed DEV Community AI endpoint and returns only
validated `https://dev.to` / `*.dev.to` article and image URLs. Successful data
is cached in memory for 30 minutes. Fetch/parse/no-image failures return an honest
502; the UI does not substitute invented articles. Rationale: live, no-key data
with genuine article cover images and reading-time metadata, without a dependency.

## D-011 — Apps toggles are local preferences, never fake connections
Date: 2026-10-27
The Apps page derives availability from the real OpenClaw gateway tool list.
Gmail/Facebook/etc. show `Not connected` unless a matching gateway capability is
actually reported. A toggle only persists a local enable/pause preference in the
existing settings table; it does not perform or imply OAuth. External account
connection flows remain out of scope until implemented for real.

## D-012 — One visible voice entry with a headless shared controller
Date: 2026-10-28
The global voice controller remains mounted once in the authenticated shell so
capture, current-conversation reuse, TTS, and error handling stay centralized.
It renders no floating button; the center mobile-footer microphone dispatches to
it and receives listening/processing/error state through a local browser event.
Rationale: satisfy the single-microphone UI while avoiding duplicated capture
implementations or changing the proven audio path. The deep `/voice` route is
retained for direct links but is not another shell navigation control.

## D-013 — Agent activity comes from sessions, never roster inference
Date: 2026-10-28
`agents.list` is configuration identity, not presence. Julie labels an agent
`Working` only when a complete visible `sessions.list` snapshot contains
`hasActiveRun: true` for that agent. Other closed states are `No active run
reported`, `No visible sessions`, and `Unknown`; none implies off-duty status.
The archive endpoint aggregates roster, session, usage, tool, and skill reads on
the backend, tolerates partial capability failures, and caches snapshots for 30
seconds. It removes host paths, session keys, usage storage paths, and raw run
IDs before browser delivery. Usage reports are refreshed explicitly and are not
polled as an activity signal.

## D-014 — Agent profiles expose safe projections, not raw Gateway records
Date: 2026-10-28
Single-agent pages are assembled by an allowlisted Julie backend endpoint rather
than a generic RPC proxy. Session keys, active run IDs, host workspace paths,
usage database paths, bootstrap hashes, and raw file content stay server-side.
`SOUL.md` contributes only bounded section names and a short prose excerpt after
code/frontmatter removal and secret-pattern filtering. Formal role, Julie
workspace assignment, and task history remain explicit unavailable states until
Julie owns schemas for them. Unknown IDs return 404 and never fall back to the
default agent.

## D-015 — Per-agent chat resolves opaque sessions on the backend
Date: 2026-10-28
Agent communication routes accept only the configured agent ID and an opaque
Gateway session ID. Julie rereads the agent-scoped session inventory, verifies
ownership, and keeps the real session key server-side. A send without a session
creates an agent-qualified key on the backend and waits for the documented final
chat result. History is bounded to 120 non-empty user/assistant text messages,
supports legacy and current content shapes, and redacts common credential forms
and OpenClaw host paths. There is no arbitrary RPC, session-key, or run-ID API.

## D-016 — Agent onboarding separates Gateway state from Julie HR context
Date: 2026-10-28
The documented `agents.create` RPC accepts name, model, emoji/avatar, and an
optional host workspace; it does not configure role, duty schedule, Julie
workspace membership, tools, or skills. Julie therefore applies only supported
identity/model fields to OpenClaw, writes the reviewed personality through a
hash-guarded `agents.files.set` SOUL update, and stores explicit HR/assignment /
capability-request metadata in local SQLite. The UI labels tool and skill choices
as requests and never claims policy changed. Creation requires owner auth plus a
final confirmation. Partial post-create writes return warnings rather than
pretending rollback or total success.

## D-017 — Agent edits are source-aware and SOUL merges are non-destructive
Date: 2026-10-28
The edit surface sends only changed display-name, emoji, or model fields through
`agents.update`; role-only edits never resubmit an unchanged model. Julie-owned
HR and assignment fields remain in SQLite. Personality synchronization owns only
the section between `<!-- JULIE-HR:START -->` and `<!-- JULIE-HR:END -->`; when
markers are absent it appends that block instead of replacing existing SOUL.
Every write uses the Gateway file hash or expected-missing precondition. The UI
shows field ownership, requires final confirmation, and reports partial warnings.

## D-018 — Agent visibility uses explicit many-to-many workspace membership
Date: 2026-10-28
OpenClaw workspace filesystem paths are not Julie workspace assignments. Julie
owns a `workspace_agents` join table and scopes its ordinary agent archive,
detail, history, chat, and edit APIs to the globally active Julie workspace.
Agents in multiple rows are explicitly shared; no path or identity heuristic
creates membership. A separate authenticated assignment endpoint may inspect the
full Gateway roster and replace membership for one workspace after confirmation.
Removing membership never deletes or reconfigures the OpenClaw agent. The legacy
single `agent_profiles.workspace_id` column is a synchronized compatibility hint,
not the authority.

## D-019 — Office locations require closed evidence rules
Date: 2026-10-28
The Office may place an agent at a generic desk only from
`sessions.list.hasActiveRun === true`. Missing sessions, a complete no-active-run
snapshot, or session-read failure all stay in the non-semantic roster lobby;
none means off duty. Library, lounge, and home require a future exact event or
explicit duty source and remain unused until then. Each backend placement carries
its classification and evidence text, and frontend coordinates only visualize
that projection rather than deriving activity independently.

## D-020 — Avatar generation is reviewed, bounded, and separated from apply
Date: 2026-10-28
Julie may inspect only the allowlisted `image_generate action=list` projection;
provider auth hints and raw capability records stay server-side. Avatar prompts
are rebuilt from bounded safe identity/HR/marked-SOUL context and explicitly do
not infer human demographic or real-person traits. Owner visual notes are marked
as explicit input. Because the current Gateway catalog exposes no per-call cost,
the UI says cost is not reported and requires a separate unknown-cost checkbox.
Each approved call fixes `count=1`, square 1K/1024 geometry, low quality when the
model supports it, and an explicit provider/model (preventing fallback retries).
The returned image is magic-byte/hash/size checked and stored privately under
Julie data. Generation never changes identity. Applying a reviewed asset is a
second confirmed `agents.update` action and is capped at 2 MB. A deterministic
local SVG is the no-cost fallback.

## D-021 — Avatar provider names are never aliases; 3D is a companion asset
Date: 2026-10-28
The owner selected OmniRoute instead of OpenRouter for avatar generation. Julie
therefore excludes OpenRouter from its avatar allowlist. The installed Gateway's
`image_generate` registry has no OmniRoute provider even though the normal model
catalog has OmniRoute text rows; Julie presents `OmniRoute / not_supported` and
does not relabel or route it through OpenRouter. Provider configuration presence
is separate from a verified successful generation. Owner-uploaded raster images
and public HTTPS image URLs may still become OpenClaw image avatars after exact
review. GLB 2.0 uploads and HTTPS references are stored only as private/local
Julie companion assets: `agents.update` accepts image avatars, and no 3D viewer
or rendered fallback is claimed until a separate viewer/render capability exists.

## D-024 — Chat attachments stream through the Gateway; no Julie-side file store
Date: 2026-10-28
Chat file attachments (PNG/JPEG/WebP/GIF, PDF, UTF-8 text/md/csv/json) are
uploaded as one authenticated multipart POST to `POST /api/upload`, validated
by content signature (magic bytes) plus extension/MIME cross-checks, base64
encoded, and forwarded as `attachments` on the documented OpenClaw
`chat.send` schema call. OpenClaw stages them into the agent's own workspace;
Julie keeps no copy, exposes no browsing directory of chats files, and adds no
multipart dependency (the request is parsed with the runtime's native
`Response.formData()`; the earlier multer/disk-store attempt in the working
tree was consolidated away in favor of this single documented path). The route
sends the composer message and attachment together as one real turn that the
Gateway acknowledges (202) before the agent run streams its reply over SSE —
so no "sent" state is ever shown that the Gateway did not confirm. Size
limits follow the Gateway contract (8 MB general, 6 MB for images) and are
enforced before any Gateway call.

## D-022 — OpenCode bridge is read-only, loopback-only, and hand-rolled
Date: 2026-10-28
E3-07 bridges the real OpenCode v2 background service into Julie. Discovery and
auth were verified against the running OpenCode 2.2.0 service before any code
was written: the registration file at `$XDG_STATE_HOME/opencode/service.json`
holds `{ url, password, pid, version }`, the URL is loopback, requests use Basic
`opencode:<password>`, and the contract is documented per version by the
service's own `/openapi.json`. Julie's bridge rejects any registration URL that
is not localhost/127.0.0.1/::1 and never puts the password or URL in browser
payloads. The bridge is deliberately write-free: sessions, transcripts, and the
agent list are GET-only; prompt/interrupt/permission endpoints wait for E3-09
with explicit owner controls. `@opencode/client` was evaluated for this work
(and used for the live verification probes) but the dependency was rejected for
the server runtime: the verified wire shape is one registration read plus
Basic-auth GETs, and the working agreement keeps dependencies minimal. Session
and transcript payloads are field-whitelisted — ids, titles, agent/model, token
and cost sums, timestamps, and message text/tool summaries only; message text is
redacted with the same credential/path patterns as agent chat and tool inputs
and outputs are truncated (500/4000 chars, ≤80 parts, ≤200 messages).

## D-023 — Project registry mirrors OpenCode; host paths stay server-side
Date: 2026-10-28
The `/projects` registry ('Development project registry') is fed only by records
the OpenCode service itself exposes ('/api/project'); Julie creates no project
rows of its own. Records with the same canonical path are merged for display
(the live service kept two ids for /home/admin/julie). Following the agent-
archive redaction convention, browser payloads never carry canonical host
paths, project ids are truncated, and per-path session counts come from a
bounded 400-session scan whose coverage number is shown honestly. The owner's
intended deep interaction surface remains the OpenCode web UI reached through
the service's own password-gated tunnel, not Julie reimplementing it.

## D-025 — Task ownership is a Julie fact; execution uses the assigned live agent
Date: 2026-10-29
Tasks now carry an optional `assigned_agent_id` owned by Julie SQLite. Assignment
mutations are accepted only when the ID is both in the live Gateway roster and
explicitly assigned to the task's Julie workspace. Unassigned tasks retain the
documented `main` execution fallback; assigned tasks use a private
`agent:<id>:julie-task-*` Gateway session. Reassignment is blocked during a run
and resets stale per-agent execution context. An append-only `task_activity`
timeline records owner edits and confirmed run/room transitions. Task summaries
are calculated server-side from the same rows. Gateway task and conversation
session keys are private routing state and are removed from every browser
projection (superseding the unavailable-task statements in D-014).

## D-026 — Office hierarchy is explicit HR configuration, never inferred from activity
Date: 2026-10-29
Julie stores `department`, `reports_to`, and `org_level` on local agent HR
profiles, then joins those records to live Gateway identity. The owner/CEO is
the root; `main` is the sole executive reporting to owner; every department lead
reports to `main`; every specialist reports to one lead in the same department.
The confirmed organization replacement endpoint validates the entire active
workspace roster and these invariants atomically. Missing records render as
unconfigured rather than being guessed from agent names, workspaces, sessions,
or tools. OpenClaw spawn allowlists mirror the hierarchy: main may spawn leads,
leads may spawn their specialists, and specialists have no cross-agent spawn
targets. Agent create/delete remains a reviewed lifecycle with backup, config
validation, documented Gateway mutation, HR/allowlist cleanup, and a real role
comprehension round-trip.

## D-027 — Agent Messenger reads and writes each agent's real Gateway sessions
Date: 2026-10-29
Direct messages are not copied into a second Julie transcript store. The inbox
combines the explicit organization roster, exact Gateway active-run/session
metadata, and real Julie task ownership. Selecting an agent reads that agent's
bounded sanitized Gateway sessions; selecting “New session” creates nothing
until the owner sends. Sends continue through the existing backend-owned
agent-qualified session keys and return only opaque session IDs plus sanitized
user/assistant history. Julie shows no invented online, delivered, read, or
unread state. This is a dedicated multi-agent inbox while the ordinary Chat page
remains the owner's conversation with `main`.

## D-028 — Task rooms persist locally and relay confirmed turns through member agents
Date: 2026-10-29
Group rooms are linked to a real Julie task and persist room metadata,
membership, delivery state, and the sanitized shared transcript in SQLite.
Every member owns a private backend-only Gateway session. An owner message is
accepted locally (202), then selected members run sequentially in organization
order; each later prompt contains the bounded confirmed room transcript, so
agents can respond to earlier agents rather than producing parallel isolated
answers. Only completed Gateway text is stored as an agent message. A failed
turn becomes an explicitly labeled system failure and dispatch continues. SSE
projects queued/dispatching/complete state, messages, and a sanitized reconnect
snapshot—never room session keys or run IDs. Room transcripts/membership survive
Julie restarts; an in-flight dispatch is process-local and is not claimed to
recover across a Julie restart.
