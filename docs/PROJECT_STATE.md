# Project State

Last updated: 2026-10-26 (MVP vertical slice build-out)

## Current milestone
**MVP vertical slice — Phase A–E** ✅ shipped 2026-10-26

| Phase | Scope | Status |
|-------|-------|--------|
| A | Backend core: health, workspaces CRUD, tasks (7 statuses), conversations | ✅ done |
| B | OpenClaw integration adapter (WS protocol, real chat round-trip) | ✅ done |
| C | Frontend command center (glassmorphism, orb, chat, board, status pills) | ✅ done |
| D | Auth gate (owner password → HttpOnly session cookie) | ✅ done |
| E | Deployment (systemd `julie.service`, port 3000, external reachability) | ✅ done |

## Verified facts (2026-10-26)
- Service `julie.service` is active, enabled, `Restart=always`, user `admin`.
- `GET /api/health` returns `{"ok":true,...,"gateway":{"connected":true,"serverVersion":"2026.10.5"}}`
  on loopback AND on the public interface (http://169.58.118.108:3000/api/health).
- Real chat round-trip through the backend API verified twice:
  probe "JULIE LINK OK" (gateway WS direct) and "BACKEND CHAT OK"
  (via POST /api/conversations/1/messages, runId julie-b39ef7c5ed6b944b).
- Unauthenticated POST to `/api/conversations` returns 401 (verified from the
  public IP too). Wrong password login returns 401.
- ufw is inactive on this host; no firewall change was needed to expose 3000.

## Known limitations (not yet implemented)
- No streaming of gateway deltas to the browser (chat replies arrive whole).
- No TLS on port 3000 (plain HTTP; owner password travels in the POST body).
  Use only on trusted networks or put a TLS proxy in front (see BACKLOG).
- Sessions don't expire; logout clears the cookie only client-side.
- No user-scoped multi-owner support (by design, single owner).
- Task board drag & drop works, but there is no task↔chat automation yet.