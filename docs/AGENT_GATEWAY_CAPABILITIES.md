# Agent Gateway Capability Audit

**Audit date:** 2026-10-28
**Live Gateway:** OpenClaw 2026.10.5, protocol 4
**Purpose:** Define what Julie may honestly show or mutate on Agent pages before
the archive, detail route, HR wizard, office simulation, and metrics are built.

## Evidence used

1. Installed OpenClaw 2026.10.5 protocol documentation under
   `docs/gateway/protocol/`.
2. Read-only RPC calls over the authenticated live Gateway connection.
3. Julie's existing `GatewayClient` behavior and authenticated `/api/agents` and
   `/api/tools` routes.

No OpenClaw configuration, workspace file, credential, or runtime state was
modified during this audit. Mutating RPCs were documented but not invoked.

## Live snapshot

This is evidence from the audit moment, not static product data:

- `agents.list`: **9** configured agents; default agent `main`; all 9 recorded as
  operator-created; the live roster did not include optional `kind` values.
- `tools.catalog` for `main`: **73** tools in **15** groups.
- `skills.status` for `main`: **62** visible skills; **27 eligible**, **35 not
  currently eligible**. Eligibility includes requirement and config checks.
- `commands.list` for `main`: **75** runtime commands.
- `models.list` configured view: **25** catalog rows reported `available: true`.
  This is catalog readiness, **not** proof that every model can answer a probe.
- `sessions.list` (excluding cron, system, and dock): **26** visible sessions,
  no active direct run at the audit instant. Current rows existed for `main` and
  `ops`; agents without a visible session must not be labeled offline or idle
  solely from that absence.
- `sessions.usage` (30 days, all agents): **27** usage rows. The first request
  correctly returned pending cache entries; one bounded refresh returned a fresh
  report with real token and cost fields. Julie must preserve this pending state.
- `agents.files.list/get`: `SOUL.md` is readable for `main` with content hash and
  metadata. The audit verified shape and size without printing its contents.
- `agents.workspace.list`: read-only, workspace-contained browsing is available.

## Supported read capabilities

| UI need | Gateway source | Verified facts | Julie implementation rule |
|---|---|---|---|
| Agent roster | `agents.list` | ID, configured name, identity, model/fallbacks, utility model, runtime, thinking options/default, permission mode, provenance, creation time, workspace Git flag | Treat the roster as configured identity, not live presence. Do not return the host workspace path to the browser. |
| Effective identity | `agent.identity.get` | Agent ID, effective name, name source, avatar reference | A one-letter or absent avatar is not a realistic portrait. Label the source and use an honest fallback. |
| Model assignment | `agents.list`; `models.list` | Primary/fallback/utility model and catalog metadata | Show assigned model exactly. Keep catalog `available` distinct from a live reachability result. |
| Live activity | `sessions.list` / `sessions.subscribe` | `hasActiveRun`, exact `activeRunIds` when present, status, start/end/activity times, runtime, placement, model, token and estimated-cost fields | “Working” requires `hasActiveRun === true`. An omitted exact run list is unknown, not idle. Subscribe later; do not poll usage for presence. |
| Sessions and history | `sessions.list`, `sessions.describe`, `chat.history`, `sessions.get` | Agent ownership, display metadata, sanitized message history, active-run state | Preserve `agentId` and session key together. Use bounded history and never expose raw tool/control tokens. |
| Tools | `tools.catalog { agentId }` | Grouped tool IDs, labels, descriptions, source/provenance and profiles | Catalog membership means visible/available at catalog time, not guaranteed permission in an active run. For a session preview use `tools.effective`. |
| Skills | `skills.status { agentId }` | Eligibility, requirements, missing dependencies, config checks, source, visibility | Show eligible and unavailable separately with the returned reason; never infer installation from catalog discovery. |
| Commands | `commands.list { agentId }` | Runtime command names, aliases, category, source, scope, description | Read-only inventory is safe for detail pages. |
| Usage by session/agent | `sessions.usage`, `sessions.usage.timeseries`, `sessions.usage.logs` | Input/output/cache tokens, recorded/estimated cost, model/provider and date buckets | Show pending/null while the cache prepares. Aggregate only returned numbers; missing pricing or token fields remain unavailable. |
| Aggregate cost | `usage.cost { agentId }` or `agentScope: "all"` | Date-range token/cost totals and missing-cost count | Keep recorded/estimated semantics and disclose missing cost entries. |
| Bootstrap/SOUL files | `agents.files.list/get` | Allowlisted bootstrap file names, missing state, content, size, updated time, SHA-256 hash | Fetch detail on demand. Do not place full SOUL content in archive cards or logs. |
| Workspace browser | `agents.workspace.list/get` | Paginated, contained, read-only text/common-image browsing | Proxy only allowlisted read calls; never expose host paths or add write behavior to this namespace. |

## Supported mutations (not exercised in the audit)

The installed protocol documents these operations:

| Capability | RPC | Safety requirement in Julie |
|---|---|---|
| Create agent | `agents.create` | Owner session, reviewed wizard summary, explicit model/tools/skills choices, confirmation, and surfaced Gateway error. |
| Update agent | `agents.update` | Owner session, field allowlist, current data refresh, and no direct config proxy. Identity/model updates may alter workspace bootstrap identity. |
| Delete agent | `agents.delete` | Separate destructive confirmation and dependency/session review; never infer cleanup success before the RPC confirms it. |
| Write bootstrap file | `agents.files.set` | On-demand editor only, content bounds, and hash/expected-missing compare-and-swap to prevent overwrites. |
| Send/intervene | `chat.send`, `sessions.send`, `sessions.abort` | Exact selected session/run, owner auth, visible accepted/rejected state, and confirmation for destructive cancellation. |

Although Julie's Gateway device currently has admin scope, the browser must never
receive a generic RPC proxy. Every operation needs an allowlisted authenticated
backend route with validation and audit behavior.

## Not directly available — do not fabricate

| Requested concept | Evidence gap | Honest approach |
|---|---|---|
| Formal HR role/title | No dedicated role field in the live roster | Show effective identity name/theme as identity metadata. Add a Julie-owned role only after a schema and owner edit flow exist. |
| On-duty/off-duty state | No duty schedule or presence contract per configured agent | Show `Working` only from an active run; otherwise `No active run reported` or `Unknown`. A future schedule must be explicit Julie data. |
| Current semantic action (“reading”, “coding”, “playing”) | Active-run/session data does not classify the agent's physical/semantic activity | Office scenes may map exact tool/run events to labeled zones; otherwise use `Unclassified activity`, never a guessed scene. |
| Current Julie task assignment | Existing Julie tasks have no agent assignment column | Add explicit task-agent assignment before claiming an agent is working on a task. Session activity alone is not a task link. |
| Productivity, efficiency, struggle | Gateway provides runs, status, usage, and some audit evidence, but no authoritative score | Define auditable Julie formulas in E1-11 and show insufficient-evidence states. Tokens or elapsed time alone are not productivity. |
| Total active worked time | Session rows expose timestamps/runtime facts, not a guaranteed complete employment-style duration ledger | Use bounded observed run evidence only after event persistence exists; label observation windows. |
| Agent net worth/salary | No Gateway concept | Keep as a Julie-owned entertainment layer that cannot grant permissions, credentials, purchases, or autonomous spending. |
| Photorealistic personality avatar | Identity may contain an avatar reference; SOUL is readable, but no image-generation result is supplied by these RPCs | Use existing/fallback avatar until an owner-reviewed generation pipeline with provider/cost evidence is implemented. |
| Model `active / busy / unreachable` | `models.list.available` is catalog/config readiness, not a live probe or per-model queue state | Handle separately in E2-07/E2-08 with bounded probes and `unknown` where the provider gives no busy state. |

## Data model for the next Agent archive

The archive can safely derive these display fields now:

- Configured: ID, effective display name, identity theme/emoji, primary and
  fallback models, utility model, runtime, permission mode, creation provenance.
- Live session summary: visible session count, active-run count, latest activity,
  last reported session status, exact current model when returned.
- Usage summary: date range, token buckets, cost when returned, pending/missing
  indicators.
- Capability summary: agent-scoped tool count/group count and skill eligible /
  unavailable counts.

Status vocabulary for E1-02:

- **Working** — at least one visible session has `hasActiveRun: true`.
- **No active run reported** — visible session snapshot is complete and none is
  active. This does not mean off duty.
- **No visible sessions** — configured agent has no visible session rows.
- **Unknown** — session read failed or returned insufficient activity facts.

This audit is the contract for E1-02 and E1-03. Any additional field must cite a
new live Gateway response or an explicitly Julie-owned persisted source.
