# Project State: Julie AiOS

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

*Last updated: 2026-10-26*
