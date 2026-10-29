# Project State: Julie AiOS

## Status: Phase E5 — Office operations and agent communications complete
**Date:** 2026-10-29

### Outcome
The owner's nine high-priority E5 milestones (task rows 95–103) superseded the
existing backlog and were completed in dependency order. Julie has her center
mobile microphone back, a real operations-grade task system, an explicit office
hierarchy, corrected/trained agents, direct agent messaging, and task-linked
group rooms where agents receive and respond to one another's confirmed messages.

### Delivered
- **Mobile voice restored:** footer is Home / Chat / Talk microphone / Agents /
  More. The AI Center and its session-creating shortcuts are gone. The mic uses
  the selected existing conversation (or latest existing conversation outside
  Chat) and asks for a conversation instead of creating one implicitly.
- **Task Operations:** SQLite tasks now have optional live/workspace-validated
  agent ownership and an append-only activity timeline. Assigned task runs route
  to that agent's private session; unassigned runs use `main`. Browser payloads
  expose only `session_linked`, never task/conversation Gateway session keys.
  The modern board provides real KPIs, filters, ownership, board/list views,
  editor/run controls, output, and activity on desktop and mobile.
- **Office hierarchy:** explicit HR data validates and renders Owner/CEO →
  Julie/main → department lead → same-department specialist. Mission Control is
  complete: 10/10 members, 2 departments, 2 leads, 7 specialists.
  - Product & Technology: `dev-builder` lead; coder, researcher, tester,
    `devops`, and command-center QA specialists.
  - Business & Growth: `ops` lead; commerce and content specialists.
- **Agent training:** all ten identities, SOUL files, and operating charters now
  match their real office role/reporting line. Main's startup charter contains
  the mandatory create/delete sequence; full reviewed templates live in
  `AGENT_LIFECYCLE.md` and `AGENT_TEMPLATE.md`. Spawn allowlists mirror the
  hierarchy. A fresh real main session reproduced the required sequence.
- **Agent Messenger:** `/agent-messenger` is a real agent inbox, with one identity
  per assigned agent and multiple real Gateway sessions per agent. New-session
  selection does not mutate state until send; history is bounded/sanitized and
  task/session/run facts are never relabeled as presence/read receipts.
- **Task rooms:** durable room/task/member/message data lives in SQLite; private
  member session keys stay backend-only. An owner turn returns 202 queued, then
  selected agents execute sequentially through their own Gateway sessions. Each
  later agent receives the confirmed shared transcript, while failures are
  persisted and displayed as failures. SSE reports sanitized live progress and
  supports reconnect snapshots.
- **Stability/security:** repaired invalid skill metadata; disabled the broken
  placeholder-key embedding path in deliberate FTS-only mode; replaced the
  unsupported `system.get-health` probe with documented `sessions.list`; removed
  all conversation/task routing keys from browser projections.

### Verification
- ✅ Backend `tsc`, frontend `tsc --noEmit`, and Vite production build
- ✅ Markdown regression 2/2; Phase C regression 47/47; E5 office regression 9/9
- ✅ SQLite online backups before task, organization, and room migrations;
  post-migration `PRAGMA integrity_check = ok`
- ✅ OpenClaw config valid; Gateway 2026.10.5 and Julie health connected
- ✅ Real DM: Operations Lead returned exact `OPS-DM-OK`
- ✅ Real group turn: Julie replied, then Engineering Lead explicitly
  acknowledged Julie's confirmed room message and added a distinct criterion
- ✅ Julie restart continuity: room transcript/member/task survived and the same
  lead room session returned exact `ROOM-RESUMED`
- ✅ Gateway status probes return connected/latency without new
  `system.get-health INVALID_REQUEST` logs
- ✅ A later external config rewrite added two unsupported model endpoint flags;
  after an owner-visible outage, the exact broken config was backed up, only the
  invalid keys were removed, validation passed, and Gateway returned ready
  without a host reboot

### Honest boundaries / follow-up
- Direct agent DMs are final-reply calls, not token streaming.
- Room data survives Julie restarts; an in-flight dispatch monitor does not.
- Memory search is intentionally keyword-only (`provider: none`) until a real
  embedding provider/credential is selected; FTS is ready, semantic vectors are
  disabled.
- Existing historical AI Center conversation rows were preserved rather than
  destructively deleted.
- The installed community Bailian voice plugin still has an OpenClaw
  `provenance-invalid` warning. Julie did not pretend this means trusted and did
  not silently allowlist, uninstall, or reinstall owner-selected software.

---

## Status: Phase E4 — Chat is live (streaming), attachments land in the Gateway
**Date:** 2026-10-28

### Outcome
The Chat page now behaves like a live connection to the real Gateway instead
of one long blocking POST. Messages are acknowledged the moment `chat.send`
is accepted, then status phases, streaming deltas, and the persisted reply
arrive over the per-conversation SSE stream. File attachments (images, PDF,
text files) are sent through the same turn — decision D-024. Conversation
management gained a custom picker with a real per-row delete button, and the
chat route locks page scrolling to the transcript.

### Delivered
- **Real-time chat lifecycle:** `POST /api/conversations/:id/messages` (and
  the new `POST /api/upload`) return 202 with the stored user message as soon
  as the real Gateway acknowledges `chat.send`; a background run monitor
  persists the final assistant reply server-side. The old pattern of holding
  the HTTP request open for the whole agent run (surfacing misleading 502s)
  is gone.
- **Visible run states:** ChatView streams the sanitized run projection over
  `/api/conversations/:id/events` — send → Gateway acknowledgement → Gateway
  phase labels (e.g. preparing context, rate-limit retries) → live response
  text → saving → the persisted message. A reconnecting/rejoined client
  restores the observable state of an in-flight run instead of appearing
  frozen.
- **Attachments:** a paperclip button in the composer accepts one file
  (PNG/JPEG/WebP/GIF/PDF/txt/md/csv/json), shows a removable chip with the
  real file size, and submits it with the message in one authenticated
  multipart turn. Server-side checks: magic-byte signature, extension/MIME
  cross-check, 8 MB general / 6 MB image limit, no secrets or unsafe names.
- **Conversation picker:** the native `<select>` was replaced with an
  accessible dropdown; every row carries a delete button calling
  `DELETE /api/conversations/:id` (blocked with 409 while a run is active —
  reported honestly). Deleting the active conversation selects the next one.
- **Scroll fix:** on `/chat` the app frame is `overflow: hidden` at fixed
  viewport height; only `.chat-log` scrolls, on desktop and phones.

### Verification
- `npm run build` (backend tsc strict) and `npm run web:build` pass.
- Live round trip against the running Gateway: login → multipart upload of a
  text file → 202 `accepted` → SSE events observed (`sending`,
  `accepted`, `responding` with streamed text, `complete` with the persisted
  assistant row). Health check `ok` after service restart.

### Honest boundaries
- Only ONE file may be attached per turn (the Gateway chat.send contract in
  use; multi-file turn batching was the removed multer attempt's shape and is
  not hidden as done).
- Run history is monitor state in memory; a server restart mid-run surfaces
  as an error on the next event/connect, the assistant reply is claims-backed
  by gateway session history polling in the background monitor.
- Voice capture flow now waits for the persisted reply through the same SSE
  channel with a 10-minute bound (was: a single blocking HTTP call).

---

## Status: Phase E0 complete (stability, Chat, and command-center shell)
**Date:** 2026-10-28

### Outcome
The first eight Phase E tasks (`E0-01` through `E0-08`, task rows 25–32)
were completed sequentially. Julie now has one visible voice entry point, a
stable Chat renderer, real workspace controls, a full navigation shell, and a
recoverable route boundary. The larger program remains explicitly tracked:
**37 done / 31 backlog / 1 blocked / 1 waiting input / 1 in progress** across the current task board.

### Delivered
- **One voice control:** the Home-column orb and floating FAB were removed from
  view. The center mobile-footer microphone is the sole visible global entry;
  the existing controller remains mounted headlessly and reports its real
  listening/processing/error state to that footer control.
- **Phone-density pass:** Julie's avatar message is shorter and smaller, real
  task/chat counts moved to a compact metadata line, preview height was reduced,
  and quick replies became a narrow horizontal strip on phones.
- **Chat crash fixed:** recursive inline Markdown used to reset a shared global
  regex and repeatedly match the same bold/italic token until the browser ran
  out of memory. Every recursive call now owns its regex cursor; a two-case
  regression suite covers the exact failure shape and multiple inline tokens.
- **Real workspace Chat controls:** the selector is populated from SQLite,
  changes persist through the authenticated activation API, stale scoped data
  is cleared during transitions, and the create dialog accepts a required name
  plus optional description before creating and activating the workspace.
- **Command-center shell:** gateway status is right-aligned and remains sourced
  from backend polling. The sidebar now exposes Home, Chat, Agents, Task Board,
  Projects, Analytics, Automations, Apps & Integrations, Terminal, Settings,
  Profile, and Future Lab. Unimplemented routes render explicit dependency-aware
  planned pages—never fake controls.
- **Mobile footer:** five focused items—Home, Chat, the single AI voice entry,
  Agents, and More. More opens the complete navigation drawer.
- **Failure containment:** a route-level React error boundary prevents one view
  from blanking the shell. Agents, Apps, Analytics, and Chat now use recoverable
  loading, empty, and error states with retries where appropriate.

### Verification
- ✅ Backend strict TypeScript and frontend Vite builds pass
- ✅ `scripts/test-markdown.tsx`: 2/2 pass
- ✅ `scripts/test-phase-c.mjs`: 47/47 pass, including workspace-scoped avatar generation/import/model gates and redaction coverage
- ✅ All 12 shell routes return HTTP 200 through the single Express process
- ✅ `julie.service` restarted; `/api/health` reports ok and gateway 2026.10.5 connected

### Honest boundaries
- Projects, Automations, dedicated Settings, and Future Lab are currently
  dependency-aware planned pages. Their controls will not be enabled until the
  corresponding authenticated backend capability exists.
- Remaining backlog/blocked work is not represented as completed UI.

### E1 capability audit
- `E1-01` verified the live OpenClaw agent surface and recorded the supported,
  derived, and unavailable fields in `docs/AGENT_GATEWAY_CAPABILITIES.md`.
- At the audit instant the Gateway reported 9 configured agents, 73 tools for
  `main`, 62 visible skills (27 eligible), 25 configured model rows, and exact
  session/usage APIs. Formal role, duty state, semantic office action,
  productivity, and task assignment are not Gateway facts and will not be
  invented in the archive.

### E1 Agent Archive
- `E1-02` replaced the selector-style Agent page with a responsive archive fed
  by authenticated `GET /api/agents/overview`.
- The backend joins the configured roster with paginated visible-session state,
  30-day usage, and agent-scoped tool/skill catalogs. Every card shows exact
  model/runtime/permission metadata, `Working` only for `hasActiveRun: true`,
  recent session evidence, capability counts, and token/cost state.
- Search plus status/model filters operate on the returned live snapshot. Manual
  refresh bypasses a 30-second server cache; usage is not polled for presence.
- Host workspace paths, usage database paths, session keys, and raw run IDs are
  removed before browser delivery. The regression suite asserts those boundaries.
- Formal role and Julie-task assignment remain visibly `Not configured` /
  `Not linked`; identity themes and session activity are not relabeled as either.

### E1 Single-Agent Profile
- `E1-03` added authenticated `GET /api/agents/:id` and the real
  `/agents/:id` route with Overview, Activity, and Capabilities deep-link tabs.
- Overview shows configured/effective identity, explicit missing role, primary /
  fallback / utility models, runtime and permission facts, provenance, a safe
  SOUL summary, workspace/bootstrap metadata, and explicit missing Julie
  workspace assignment.
- Activity shows exact active-run state, bounded sanitized sessions, real 30-day
  token/cache/cost buckets, and an honest unlinked task-history state.
- Capabilities exposes agent-scoped tool, skill eligibility, and runtime command
  inventories with filters and partial-error states.
- The backend never sends raw SOUL content, host paths, session keys, usage DB
  paths, hashes, or active run IDs. Unknown agents return 404 instead of falling
  back to `main`.
- `scripts/test-phase-c.mjs` now passes **14/14**, including detail auth,
  redaction, raw-SOUL exclusion, and unknown-agent checks.

### E1 Per-Agent Communication
- `E1-04` added the `#chat` agent-profile tab plus authenticated history and
  send endpoints. The browser supplies an agent ID and opaque session ID; Julie
  resolves the private Gateway session key server-side and rejects mismatches.
- Existing sessions return at most the latest 120 non-empty user/assistant text
  messages. Tool/control rows are omitted, credential-shaped text and OpenClaw
  host paths are redacted, and legacy string plus current structured transcript
  content shapes are both supported.
- Sending to an existing session preserves that exact agent/session. Sending
  without one creates a backend-only `agent:<id>:julie-agent-chat-*` key, waits
  for the final Gateway reply, and returns the completed sanitized history.
- A real `main` round-trip returned the exact requested
  `JULIE_AGENT_CHAT_OK` response with a new session ID and two-message history.
- `scripts/test-phase-c.mjs` now passes **18/18** with unauthenticated history /
  send checks, sanitized-history shape, and non-executing empty-input validation.

### E1 Usage Statistics
- `E1-05` now exposes Gateway-reported 30-day usage at archive aggregate,
  per-agent, per-session, and per-model levels.
- The archive shows total tokens/cost, top models across all agents, and each
  agent's most-used reported model. Agent Activity shows input, output, cache,
  total, cost buckets, missing-cost counts, model call counts, and bounded
  session usage rows.
- Model totals are summed only from `sessions.usage[].usage.modelUsage`; Julie
  does not estimate missing tokens or prices. `pending`, `no_data`, and
  `unavailable` remain visible states, and reported zero cost is preserved.
- Live verification confirmed the per-model token sum equals the agent total for
  the current `main` report; regression tests assert model usage shape.

### E1 HR Agent Onboarding
- `E1-06` added `/agents/new`, a five-step HR wizard for identity/personality,
  Julie workspace and schedule, live model selection, tool/skill requests, and
  an explicit review/confirmation receipt.
- `GET /api/agents/onboarding/options` joins 25 live configured models, 73 tools,
  62 skills (with eligibility), existing agent IDs, and Julie workspaces without
  exposing secrets or host paths.
- `POST /api/agents` calls documented `agents.create` only after confirmation,
  saves Julie-owned role/schedule/workspace/request metadata in `agent_profiles`,
  and writes the reviewed SOUL through `agents.files.set` with hash or
  expected-missing compare-and-swap.
- The wizard distinguishes actual Gateway fields from Julie-owned HR context;
  requested tools/skills never claim to alter Gateway capability policy.
- Before the approved live test, OpenClaw config was backed up under gitignored
  `data/backups/` with mode 0600. The retained `julie-command-center-qa` agent
  was created successfully, assigned to Mission Control, and verified with role,
  schedule, requested capabilities, and readable SOUL metadata; no warnings.
- Regression suite now passes **22/22**, including onboarding auth, live option
  shape, policy disclosure, and pre-mutation confirmation validation.

### E1 Agent Editing
- Follow-up `E1-03A` makes every agent detail profile owner-editable through an
  explicit review dialog and authenticated `PATCH /api/agents/:id`.
- Display name, emoji, and changed primary model are applied through documented
  `agents.update`; unchanged Gateway fields are diffed out to avoid unnecessary
  config application or model preparation.
- Julie role, personality, schedule, timezone, workspace assignment, and
  capability requests update `agent_profiles`. Optional SOUL synchronization
  replaces only Julie's marked HR block or appends one, preserving all existing
  non-Julie content, with Gateway hash compare-and-swap.
- The retained QA agent was successfully renamed to `Command Center QA` through
  a real `agents.update`; its stable ID stayed `julie-command-center-qa`, and
  local/SOUL updates completed without warnings.
- Regression suite now passes **24/24** with update auth and pre-mutation
  confirmation coverage.

### E1 Active-Workspace Agent Scoping
- Follow-up `E1-07A` adds authoritative many-to-many `workspace_agents`
  membership and scopes the normal archive, profile, history, chat, and edit
  routes to Julie's current active workspace.
- The archive response contains only assigned agents and recomputes session,
  working, usage, cost, and model aggregates for that workspace. Direct access
  to an unassigned agent returns 404 without leaking whether it exists elsewhere.
- **Manage Roster** is a separate owner-only view of the live Gateway roster. It
  can assign/unassign agents for the active workspace and visibly marks explicit
  multi-workspace sharing; it never deletes or mutates the OpenClaw agent.
- Existing legacy agents were explicitly assigned to active Mission Control to
  preserve the prior roster. Retained QA is explicitly shared with Working.
  Live switch verification showed Mission Control = 10 agents, Working = QA
  only; `main` detail was blocked in Working while QA remained accessible.
- Agent editing now accepts multiple workspace memberships. The original
  single `agent_profiles.workspace_id` remains only a synchronized legacy hint.
- Regression suite passes **28/28**, including assignment auth, confirmation,
  and exact overview-to-membership set equality.

### E1 Office-World Visual MVP
- `E1-08` adds an Archive / Office toggle to the workspace-scoped Agents page.
- The Office is a dependency-free responsive SVG/CSS scene with isometric floor,
  desks and computers, library, lounge, off-duty/home pods, and roster lobby.
- Assigned agents render as compact hologram tokens in a clearly labeled
  **staging** layout. The MVP does not place them at a desk/library/home based on
  guesses; activity mapping is the separate E1-09 task.
- A visible accessible roster duplicates every agent's real role/run-state label
  and links to the profile. Reduced-motion policy applies globally; no WebGL,
  glTF, Three.js, or other dependency was added.

### E1 Evidence-Based Office Placement
- `E1-09` adds a closed server-owned office placement projection.
- An agent goes to a generic **desk** only when the complete visible session
  snapshot reports `hasActiveRun: true`; the response includes the exact evidence
  string and `classification: verified`.
- No current API supplies a reliable reading/tool event, break event, or duty
  schedule fact, so library, lounge, and home remain unused. Every non-working or
  unreadable state maps to `staging / unclassified`, never inferred idle/off-duty.
- The Office displays per-zone counts, occupied-desk glow, placement policy, and
  evidence in the accessible roster. Live Mission Control verification reported
  0 active runs and 10 staged agents, matching the source snapshot exactly.
- Regression checks enforce `working → desk/verified` and every other current
  state → `staging/unclassified`.

### E1 Personality-Derived Avatar Pipeline (awaiting a usable image source)
- `E1-10` now has an authenticated **Avatar Studio** on each active-workspace
  agent profile plus allowlisted readiness, preview, generate, asset, fallback,
  and apply endpoints.
- Live `image_generate action=list` reports OpenAI and OpenRouter as
  configuration-present. Two owner-approved one-image attempts returned no
  assets: OpenAI rejected authentication and OpenRouter rejected the request at
  its weekly key limit. No image was stored or applied.
- The owner replaced OpenRouter with OmniRoute in Julie's avatar-provider policy.
  OpenRouter is now excluded server-side. The live model catalog has 20
  OmniRoute rows, but `image_generate` does not register OmniRoute and those rows
  do not expose an image-generation route, so OmniRoute is shown as
  `not_supported` rather than being silently routed through OpenRouter.
- Julie distinguishes config presence, configured-but-unverified, last attempt
  failed, and generation succeeded. Provider projections strip auth environment
  hints and never return credentials, raw SOUL, or host paths.
- Prompts are rebuilt server-side from the Julie role/personality, Gateway theme /
  emoji, and the marked Julie HR SOUL block when present. Three non-human visual
  directions are available. Every prompt explicitly forbids inferred gender,
  age, ethnicity, skin tone, nationality, body type, disability, religion, and
  real-person likeness; owner notes are labeled as explicit input.
- The live catalog supplies no per-call cost estimate. The UI therefore reports
  **Not reported**, links to provider pricing, and requires both prompt review and
  unknown-cost acknowledgement before exactly one square 1K/1024 call.
- Generated PNG/JPEG/WebP candidates are integrity-checked, limited to 8 MB, and
  stored mode 0600 under gitignored `data/agent-avatars`; no candidate is applied
  automatically. A separate exact-image confirmation applies assets up to 2 MB
  through documented `agents.update`.
- A deterministic, zero-cost SVG fallback is active now and contains no inferred
  appearance. Owner-supplied PNG/JPEG/WebP can also be downscaled client-side,
  stored as a private candidate, reviewed, and applied with no generation call.
  A public HTTPS image URL can be previewed and explicitly applied without Julie
  fetching it; the UI discloses that clients may contact that host.
- GLB 2.0 uploads up to 8 MB and public HTTPS `.glb` references can be stored as
  Julie-only companion assets. They are explicitly not Gateway image avatars and
  remain downloadable metadata because no 3D viewer is configured.
- Positive local smoke checks stored and authenticated-fetched a tiny PNG and a
  structurally valid GLB 2.0 fixture, verified MIME/boundary metadata, then
  removed only those test rows/files; agent identity was never touched.
- Regression suite passes **47/47**. Task #42 is `waiting_input` until the owner
  supplies/reviews a usable image or OmniRoute gains a real Gateway image route;
  no current candidate exists to apply.

---

## Status: Phase D-3.1 (Mobile stabilization + D2/D3 backlog cleared)
**Date:** 2026-10-27

### Outcome
The owner-reported phone layout defects were entered into Julie's SQLite task
board as D3-M1 through D3-M6 and completed sequentially. The older D2 task set
was then audited against the live code, completed where missing, and closed.
The task board now reports **0 open tasks**.

### Mobile reference corrections
- Grid tracks are three equal `minmax(0, 1fr)` columns. Mobile outer padding is
  8px and column gap is 5px (calibrated from the owner reference); the Home
  container hard-clips horizontal overflow and disables browser text inflation.
- 29 Home typography rules use smaller viewport-aware `clamp()` sizing. The
  mobile greeting is the compact reference-style `Hello, Ikenna`.
- AI chat history is a separate card from the avatar, bounded to 168px, scrolls
  internally, and clamps each preview message to two lines.
- AI Tools are 3-across, live inside the greeting card like the reference, and
  safely ellipsize narrow labels. The crushed mobile command field is hidden;
  command entry remains in Chat and desktop Home.
- Home voice orb is 96px with richer radial lighting, three rings, and a 34px
  mic; the global voice FAB now uses a dark luminous ring treatment.
- SVG hologram gained finer hair strands, deeper shadow-side contrast, brighter
  halo/rim light, and retains its dependency-free floating animation.

### Backlog completions
- **D2-6:** learned top prompts now appear under Smart Shortcuts when real
  usage exists; honest empty behavior when `prompt_usage` has no rows.
- **D2-7:** Profile now uploads/downscales/removes the owner avatar via the
  existing validated local API; Home displays it beside AI Assistant.
- **D2-8:** Trending uses live DEV Community AI articles with real cover images,
  30-minute server cache, fixed upstream URL validation, and honest 502/UI error.
- **D2-9:** Insights productivity now counts distinct completed tasks or tasks
  with saved run output—not messages/task touches. Score is done/total.
- **D2-10:** `/tools` is now an Apps page. Availability is derived from the real
  gateway tool list (73 tools at verification); disconnected apps remain honestly
  labeled. Toggles persist only local enable/pause preferences and do not mimic OAuth.
- **D2-12:** the low-cost floating-human-avatar request is satisfied by the
  animated, hand-built SVG hologram; no WebGL/three.js dependency added.

### Verification
- ✅ Backend strict TypeScript and frontend Vite builds pass
- ✅ `julie.service` restarted; `/api/health` 200, gateway connected (2026.10.5)
- ✅ Real `/api/tools` gateway round-trip returned 73 tools
- ✅ Live `/api/trending` returned 3 DEV articles with validated real thumbnails
- ✅ `/api/insights` returned task-evidence metrics; app preference toggle round-trip passed
- ✅ All 3 live thumbnail URLs returned HTTP 200; cache reused the same `fetchedAt`
- ✅ `scripts/test-phase-c.mjs`: 9/9 pass (its stale TypeScript-in-MJS syntax was fixed)
- ✅ Julie task board: 0 rows outside `done`

### Honest limitation
The phone composition is CSS-corrected and deployed, but final aesthetic approval
still belongs to the owner on the physical target device. No claim is made that a
hand-built SVG is a photorealistic 3D-rendered model.

---

## Status: Phase D-3 (Mobile 3-column density + 3D hologram avatar)
**Date:** 2026-10-27

### Phase D-3 Overview
Goal from owner reference: keep the 3-column dashboard composition ON MOBILE
(no single-column stacking), but scale fonts/density so it feels intentional
rather than compressed. Plus a much more 3D-looking female AI avatar in the
center AI ASSISTANT panel.

### Changes — Mobile density polish
- `.home-grid` mobile columns now `1fr 1.12fr 1fr` (center AI panel dominant,
  matching the reference); desktop stays symmetric `repeat(3, minmax(0,1fr))`.
- Mobile type scale bumped so nothing reads "shrunk to fit": greeting 18px,
  card titles 10px, row titles 12px / subs 10px, tile labels 10px (icons 15px),
  chip 10px, msg bubbles 10.5px (avatars 20px), schedule 10.5px, weather temp
  27px, insights delta 14px, empty states 11px.
- Density rhythm: grid/col gap 8→10px, card padding 10→12px, rows 7px 8px,
  voice orb 100px.
- Center panel hero: bust area 152×207 (was 112×142), stronger glow.

### Changes — 3D hologram avatar (HologramBust rewritten, SVG, no deps)
- viewBox 220×300; layered gradients for volume: upper-left lit skin
  (`hvSkin` + `hvFaceGlow`), gradient hair (`hvHair`) with inner flow strands,
  torso drape + collarbone shading (`hvBody`).
- Face details: brows, downcast serene eyes with lash hints (reference pose),
  nose hint, lips, cheek glow, jaw/neck shadow.
- Rim-light stroke on left edge for 3D pop; ambient aura ellipse behind;
  holographic bottom dissolve via `hvDissolve` mask; base platform ellipses.
- Pulsing chest core (`.hv-core` + `hvCorePulse` keyframes, 3.4s).
- Desktop bust area resized to match new aspect (196×267).
- Zero new dependencies; still the same `.hv-*` scoped CSS, orange accent
  system, scan line + floating particles kept.

### Verification
- ✅ `tsc` (server, strict) + `vite build` pass
- ✅ `sudo systemctl restart julie.service` — active; health 200 (gateway connected, server 2026.10.5)
- ✅ Live bundle contains new avatar markers (`hvDissolve` in JS, `hvCorePulse` in CSS)


### E3.1 OpenCode access, stats, and Projects registry
- `E3-07` wired an owner-authenticated, read-only bridge from Julie to the real
  OpenCode v2 background service (verified live against OpenCode 2.2.0 on this
  host). Discovery reads `$XDG_STATE_HOME/opencode/service.json`, rejects
  non-loopback URLs, and authenticates with Basic credentials that never reach
  the browser. Per owner direction the `/opencode` page is an activity/stats
  view (prompts, steps, tokens, streak, tool success, 14-day steps bars, live
  "in progress" sessions, history) plus a link that opens OpenCode's own
  password-gated web UI via the service's advertised https tunnel — chat,
  model choice, and uploads are not reimplemented in Julie.
- `E3-10` replaced the Projects planned-page with a real development registry
  fed by OpenCode `/api/project` records, grouped by canonical path with
  bounded per-path session counts; host paths stay server-side (D-022/D-023).

### Known Limitations (honest)
- The avatar is a hand-built SVG illustration (stylized hologram), not a rendered
  3D mesh — no three.js/webgl dependency per minimal-deps rule. A real glTF model
  would need a decision record + larger bundle.
- Avatar stays in the orange accent system (matches current Chunk A accent);
  a blue hologram variant like the raw reference image would need a design call.
- `prefers-reduced-motion` not yet applied to `hv-core` pulse.

---

## Status: Phase D-1 (Home Dashboard Redesign Complete)
**Date:** 2026-10-26
**Superseded by D-3 above (kept for history).**

### Phase D-1 Overview
Full Home dashboard redesign to match the owner's reference image: deep near-black/navy
glass panels, luminous cyan/blue + violet hologram accents, 3-column desktop layout
(mobile stacks in reference order). All widgets use REAL data only, with honest
empty/fallback states. Every widget interaction posts into the currently open
conversation (Phase C.1 convId pattern) or navigates — no new sessions spawned.

### Home Dashboard Widgets (all present, all real-data)
| # | Widget | Data source |
|---|--------|-------------|
| 1 | Greeting ("Good morning/afternoon/evening, Ikenna" + command input w/ waveform) | local clock; posts into current conversation |
| 2 | AI TOOLS (6 tiles: Summarize/Translate/Write/Analyze/Design/Code) | static prompt templates → current conversation; footer → /tools |
| 3 | SMART SHORTCUTS (Meeting Summary, Email Assistant, Study Helper, Plan My Day) | template prompts → current conversation |
| 4 | CONNECTED DEVICES | `GET /api/devices` → gateway `node.list` (fallback `system-presence`); honest "This device" row when no paired nodes — never invented |
| 5 | AI ASSISTANT panel (holographic SVG bust, context bubble w/ real pending-task + open-conversation counts, chat preview of latest 4 messages, quick-reply chips) | SQLite conversations/messages |
| 6 | VOICE ORB (glowing mic orb, tap → voice flow) | navigates to /voice?start=1 (auto-start; reuses current conversation per Phase C.1) |
| 7 | WEATHER (Port Harcourt, big temp, condition, 5-day mini forecast) | `GET /api/weather` → wttr.in j1 JSON, 30-min in-memory backend cache; honest fallback state + retry on failure |
| 8 | AI INSIGHTS (14-day spark line, Productivity delta vs yesterday, score ring) | `GET /api/insights` → SQLite: messages per day, (done+in_progress)/total tasks; "No data yet" / "—" when empty |
| 9 | TODAY'S SCHEDULE (time, title, status chip + elapsed for in_progress) | `GET /api/tasks` filtered to today (created_at/run_started_at) or in_progress; "View full calendar →" → /tasks |
| 10 | TRENDING FOR YOU (3 curated public AI articles, new tab) | plain URLs verified HTTP 200; read times computed from live word counts; labeled curated reads, not analytics |

### Backend Additions
- **`server/src/weather.ts`** — wttr.in Port Harcourt fetcher, 30-min TTL cache, honest error propagation (502).
- **`gateway.listNodes()`** — real `node.list` RPC (fallback `system-presence`); no field invention.
- **Routes:** `GET /api/weather`, `GET /api/devices`, `GET /api/insights`.

### Frontend Additions
- New `HomePage` (Phase D-1): 3-column grid; tablet 2-column; mobile single-column in
  reference order (greeting, AI panel, voice, AI tools, shortcuts, devices, schedule,
  insights, weather, trending) via `display: contents` + CSS order.
- `HologramBust` (layered SVG glow: halo rings, gradient bust, hair strands, chest circuit
  lines, base platform, animated scan line + floating particles), `Sparkline`, `ScoreRing`.
- All new styles scoped under `.home-v2` / `.hv-*` — zero changes to existing components
  (Chat, Voice, Terminal, Agents, Tools, Tasks, Analytics, Profile untouched except the
  VoicePage auto-start hook for the Home orb).
- Bottom nav unchanged (5 items: Home, Chat, AI, Tools, Profile).

### Verification
- ✅ `tsc` (server, strict) + `vite build` pass
- ✅ `sudo systemctl restart julie.service` — active
- ✅ Health 200 (gateway connected, server 2026.10.5)
- ✅ All SPA routes 200 over HTTPS (/, /chat, /voice, /tools, /agents, /analytics, /terminal, /tasks, /profile)
- ✅ `/api/weather` real wttr.in payload; 30-min cache confirmed (identical fetchedAt on back-to-back calls)
- ✅ `/api/devices` real gateway payload (`source: "gateway"`, "This device" row — no paired nodes on this gateway)
- ✅ `/api/insights` cross-checked against `/api/analytics` (spark counts = messagesPerDay; score = (done+in_progress)/total)
- ✅ Bundle source scan: no fabricated devices/names/percentages ("Alex", "Earbuds", "Smart Watch", "San Francisco", "Partly Cloudy" → 0 hits)
- ✅ Independent tester subagent run: 20/21 PASS; the single FAIL (`hv-bust` marker) was re-verified as a false positive (live bundle contains all 30+ widget markers; tester likely fetched mid-deploy)
- ✅ Phase C.1 regression checks re-verified: terminal WS 101 upgrade, chat SSE hello + heartbeat, agents/tools gateway data, task CRUD endpoints, workspaces

### Known Limitations (honest)
- wttr.in j1 returns 3 forecast days (standard for the service); the 5-day row renders the
  real days returned (3) rather than inventing 2 more.
- Forecast temps shown are daily max (°C).
- "Explore more" opens the IBM Think AI hub (curated link), matching the "curated reads" framing.
- Insight day buckets are UTC (SQLite `date()` on UTC timestamps).

### Deployment
- **URL:** https://julie.ijihost.com
- **Local:** http://127.0.0.1:3000
- **Caddy:** unchanged (HTTPS proxy)
- **Systemd:** julie.service active, running

### Open Items
None.

---

*Last updated: 2026-10-29*
