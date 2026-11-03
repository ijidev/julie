# Delivery Plan

## Delivery principles

- Sandbox first; no real funds or customer PII before production approval.
- Ledger, authorization, restrictions, audit, and reconciliation are foundation
  work—not polish added after payment integrations.
- Introduce one provider/rail at a time behind an internal adapter.
- Every phase ends with executable evidence and failure-path tests.
- Julie workspace task status is the operational source for work progress; this
  document defines scope and gates rather than pretending work has completed.

## Phase 0 — owner decisions and regulated operating model

**Outcomes**

- Confirm customer segment, jurisdiction, licence/regulated partner, fiat
  currency, privacy/retention regime, custody model, crypto assets/networks,
  providers, limits, fees, disputes, expected volume, and target date.
- Approve product requirements, threat model, data classification, authorization
  matrix, state machines, and production responsibility/RACI.
- Decide whether crypto belongs in the first pilot.

**Gate:** written owner and qualified compliance/legal approval. Until then all
integration work remains vendor-neutral and sandbox-only.

## Phase 1 — repository and secure platform foundation

**Outcomes**

- Initialize npm/pnpm workspace without unnecessary orchestration framework.
- NestJS modular-monolith API, React/Vite web app, local SQLite migrations,
  matching versioned MySQL 8.4+ import SQL, generated OpenAPI client, and
  lint/typecheck/test/build.
- One production-style HTTP entry point serves API + web and works under
  `/project/fintech/`.
- CI includes tests, migration checks, dependency/license/secret scanning, and
  artifact/container build.
- Authentication/session/MFA baseline, RBAC/policy engine, audit pipeline,
  configuration validation, redacted logging, health/readiness.

**Gate:** clean environment bootstrap and CI, authenticated owner shell,
read-only capability denial tests, no committed secrets, subpath smoke test, and
explicit evidence that MySQL is not connected in the local environment.

## Phase 2 — financial core

**Outcomes**

- Asset registry and precision rules.
- Customer asset accounts, holds, chart of accounts, immutable journal/postings,
  reversals, balance projections, idempotency store, transactional outbox/inbox.
- Internal transfers with fees/limits and concurrent available-funds control.
- Transaction history/read model, invoice/payment request, immutable receipt,
  statement/export jobs.

**Gate:** property and concurrent integration tests prove balanced, immutable,
single-effect posting; seeded IDOR/replay tests fail safely.

## Phase 3 — KYC, restrictions, and operations

**Outcomes**

- KYC provider abstraction and one real sandbox flow.
- Tier/limit policy, screening hooks, case management, evidence references,
  resubmission/expiry.
- Granular capability restrictions, holds/freezes/blocks, expiry/release,
  emergency action, dual-control approvals.
- Operations queues and read-only audit explorer.

**Gate:** real sandbox KYC outcomes observed; server denies all restricted flows;
maker/checker and audit evidence tests pass.

## Phase 4 — one fiat rail

**Outcomes**

- One approved provider sandbox for deposits and withdrawals.
- Beneficiaries, quotes/fees, step-up, provider command lifecycle, signed webhook
  inbox, retry/reversal handling, settlement/reconciliation import.
- Customer instructions and operations exception queue.

**Gate:** success, duplicate, invalid signature, delayed/out-of-order event,
timeout, insufficient funds, provider failure, reversal, and reconciliation break
are all demonstrated in sandbox with ledger evidence.

## Phase 5 — limited crypto pilot

Begins only if Phase 0 approves crypto for the MVP.

**Outcomes**

- One approved custody sandbox/testnet adapter and at most two asset/network pairs.
- Address/memo assignment, deposit detection/confirmations/reorg handling,
  screening, withdrawal quote/approval/broadcast/finality, fees and travel-rule
  hook.
- Operations queue and custody reconciliation.

**Gate:** testnet/sandbox success plus wrong-network, duplicate event, reorg,
screening hold, invalid address, fee change, provider outage, and reconciliation
tests. No application-held private keys.

## Phase 6 — customer and operations experience

**Outcomes**

- Responsive WCAG 2.2 AA customer dashboard, onboarding/KYC, accounts, deposit,
  withdrawal, transfer, beneficiary, invoice, receipt, history, statements,
  security/session settings, and support entry.
- Operations console for KYC/cases, restrictions, approvals, transaction/provider
  timelines, reconciliation breaks, exports, audit, roles, limits, and feature
  configuration.
- Approved notification and customer messaging templates.

**Gate:** end-to-end role/authorization/accessibility/usability review passes;
every displayed state maps to a real API record.

## Phase 7 — staging hardening and release evidence

**Outcomes**

- Isolated staging with managed MySQL 8.4+ / InnoDB, KMS/secrets, approved object storage,
  monitoring/alerts, WAF/rate limiting, encrypted backups/PITR.
- Load/concurrency, chaos/provider-degradation, DAST, penetration, privacy,
  dependency/licence, and operational runbook review.
- Daily reconciliation and finance/compliance close process.
- Restore and disaster-recovery exercise against agreed RPO/RTO.

**Gate:** no unresolved critical/high security findings; reconciliation and
restore evidence retained; on-call, incident, fraud, support, and provider
escalation owners accept runbooks.

The Phase 7 gate must include applying every ordered MySQL migration to a clean
database and an upgrade copy, then running trigger, isolation, row-lock,
idempotency, ledger concurrency, backup, and restore tests. SQLite results cannot
satisfy this gate.

## Phase 8 — controlled pilot and production approval

**Outcomes**

- Explicit production credential/asset/limit change under dual control.
- Small allowlisted cohort and conservative limits with enhanced monitoring.
- Daily product, treasury, compliance, reconciliation, security, and support
  review; rollback/stop controls rehearsed.

**Gate:** the owner and named legal/compliance, security, treasury, and operations
approvers sign off. Expansion is a separate measured decision.

## Suggested task sequence

The Julie **Web Development** board contains task rows with these stable keys:

1. `FIN-000` review charter and approve operating model.
2. `FIN-010` finalize requirements, state machines, authorization, and threat
   model.
3. `FIN-020` bootstrap secure one-port modular monolith and CI.
4. `FIN-030` identity/auth/RBAC/KYC workflow.
5. `FIN-040` double-entry ledger, holds, idempotency, outbox/inbox.
6. `FIN-050` history, statements, invoices, and receipts.
7. `FIN-060` internal transfers, beneficiaries, fees, and limits.
8. `FIN-070` one fiat provider sandbox.
9. `FIN-080` limited crypto custody sandbox/testnet.
10. `FIN-090` restrictions, cases, dual control, and audit.
11. `FIN-100` customer and operations web experiences.
12. `FIN-110` security, compliance, reconciliation, and release verification.
13. `FIN-120` staging, observability, backup/restore, and recovery drill.
14. `FIN-130` controlled pilot readiness and production approval.
