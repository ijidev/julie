# Changelog

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
- Strict backend + frontend builds pass; Markdown tests 2/2 and Phase C tests 9/9.
- All 12 shell routes return 200; service health is ok; real gateway is connected
  at server version 2026.10.5.
- Julie task rows 25–32 are done; 42 scoped Phase E tasks remain in backlog.

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
