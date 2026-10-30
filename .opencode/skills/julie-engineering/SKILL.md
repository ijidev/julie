---
name: Julie Engineering
description: Implement and verify Julie AiOS changes using its one-process, authenticated, real-Gateway architecture and evidence rules.
---

# Julie engineering workflow

1. Read `/home/admin/julie/AGENTS.md` and the scoped source files before edits.
2. Confirm whether the task changes Julie-owned code/data or protected external
   OpenClaw/host state. Do not cross that boundary implicitly.
3. Preserve the one-process Express + Vite deployment and owner auth gate.
4. Derive status from SQLite, Julie APIs, OpenCode, or Gateway calls; never add
   simulated connectivity, activity, completion, delivery, or presence.
5. Keep private routing identifiers, credentials, host paths, and raw provider
   internals out of browser responses.
6. Follow surrounding TypeScript/React/plain-CSS patterns and add no package
   without a decision record.
7. Verify backend TypeScript, frontend TypeScript, production build, focused
   regressions, service health, and a real integration round-trip when the
   change crosses an integration boundary.
8. Update the relevant task status and Julie documentation only from observed
   results.
