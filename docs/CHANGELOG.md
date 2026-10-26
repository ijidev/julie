# Changelog

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

*Last updated: 2026-10-26*
