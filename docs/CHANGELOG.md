# Changelog

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
