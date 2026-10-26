# JULIE Project Constitution

## Identity
JULIE is a personal AI operating console. It is **not** a clone of OpenClaw and does
not manage OpenClaw; it is a sibling application that consumes the OpenClaw Gateway
as its AI execution backend.

## Prime directives
1. **Truth over comfort.** The UI reflects actual backend state or says "unknown".
   Failed integrations are reported as failures. No mock data in production paths.
2. **Owner sovereignty.** One owner. Everything mutating or executing is behind the
   owner session gate. The AI execution path (chat → gateway) can never be reached
   without authentication.
3. **Containment.** JULIE lives entirely inside `/home/admin/julie`. It never writes
   to OpenClaw's home (`~/.openclaw`), never modifies gateway/OmniRoute/Caddy
   configuration, and never runs commands on the host beyond its own process needs.
4. **Minimalism.** Every dependency must earn its place. Current runtime deps:
   express, better-sqlite3, ws (backend); react, react-dom (web). No more without a
   decision record.
5. **Durability.** Local state is SQLite with WAL. Conversation transcripts are
   persisted locally AND live in gateway sessions (per-conversation stable session
   keys), so history survives both JULIE restarts and gateway-side session flows.
6. **Observability.** Structured-enough logs to journal; health endpoint tells the
   truth about the gateway link; errors from the gateway surface to the user as
   errors, never silently swallowed.

## Change management
- Milestones update `docs/PROJECT_STATE.md` immediately.
- Decisions (library choices, protocol handling, security posture) go to
  `docs/DECISIONS.md` with date + rationale.
- Breaking schema changes bump the version and get a CHANGELOG entry plus a
  migration note.