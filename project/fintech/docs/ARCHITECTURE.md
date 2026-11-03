# Proposed Architecture

## 1. Architectural stance

Start with a **modular monolith** and one deployable HTTP application. The current
sandbox build uses local SQLite; the hosted target is MySQL 8.4+ with InnoDB.
SQLite is not an approved production fallback and cannot prove MySQL locking or
concurrency behavior. Split services only after measured scale, isolation, or
team ownership requires it.

The provisional implementation stack is:

- Node.js LTS + TypeScript strict mode
- NestJS modules for HTTP APIs, domain services, policies, and jobs
- Versioned SQLite migrations for the local build and matching ordered MySQL SQL
  imports for hosting
- React + Vite for customer and operations interfaces
- Transactional outbox and durable job processing
- Redis only for explicitly justified ephemeral cache/rate-limit/queue use; never
  for authoritative balances or approvals
- OpenAPI contracts and generated typed clients

The earlier team recommendation proposed NestJS/PostgreSQL/React. The owner has
since selected SQLite for the current build and MySQL for hosting. This plan
retains NestJS/React and the ledger-first controls but does not require
microservices, Kubernetes, Redis Pub/Sub, or event sourcing for the MVP.

## 2. Runtime shape

```text
Browser
  └── HTTPS /project/fintech/
        └── Julie authenticated project proxy
              └── Fintech HTTP process
                    ├── React static application
                    ├── /api authentication + domain APIs
                    ├── webhook endpoints (production ingress design pending)
                    ├── worker/job runner
                    └── health/readiness/metrics
                          ├── SQLite (local sandbox build only)
                          ├── MySQL 8.4+ / InnoDB (hosted source of truth target)
                          ├── Redis/queue (optional projection)
                          ├── object storage (approved exports/evidence)
                          └── KYC / fiat / custody provider adapters
```

For Julie preview, frontend assets and API URLs must be subpath-aware. Production
webhook ingress may require a separate externally reachable, provider-allowlisted
path or domain; that is an explicit deployment/security decision, not something
the preview route should silently expose.

## 3. Domain modules

| Module | Owns |
| --- | --- |
| Identity | users, verified contacts, credentials/passkeys, MFA, sessions, recovery, devices |
| Access | roles, permissions, policy decisions, step-up requirements |
| Customers/KYC | profiles, consent, KYC cases, evidence references, screening, tiers |
| Accounts | customer asset accounts, lifecycle, capability restrictions, holds |
| Ledger | chart of accounts, journal entries, postings, reversals, balance projections |
| Payments | fiat deposit/withdrawal intents, beneficiaries, provider commands/events |
| Crypto | addresses, deposits, confirmation tracking, withdrawals, network/provider events |
| Transfers | internal transfers, fees, limits, idempotent orchestration |
| Billing | invoices/payment requests, allocations, receipts, exports |
| Transactions | customer-safe aggregate/read model and immutable lifecycle events |
| Compliance/Casework | reviews, restrictions, approvals, evidence, notes, escalations |
| Reconciliation | provider statements, matching, breaks, adjustments, close evidence |
| Audit | append-only security/business events with actor and correlation metadata |
| Notifications | templated delivery requests and provider outcomes; no financial authority |

Modules communicate through typed application commands/events. Direct cross-
module table writes are prohibited.

## 4. Ledger model

### 4.1 Core records

- `ledger_accounts`: owner, purpose, asset, normal side, lifecycle.
- `journal_entries`: immutable economic event header, effective/recorded time,
  correlation/idempotency key, source, state, reversal link.
- `postings`: journal, ledger account, debit/credit side, asset-native integer
  amount, asset and scale.
- `holds`: authorized reservation with amount, purpose, expiry/release/capture
  evidence; does not masquerade as a posted transfer.
- `balance_projections`: rebuildable posted/pending/held views optimized for
  reads; never independently mutated by business endpoints.

### 4.2 Invariants

1. A posted journal is immutable and has at least two postings.
2. Debits equal credits for every asset in an entry; cross-asset conversion uses
   explicit source, destination, fee, and clearing entries.
3. Amounts are positive asset-native integers; side carries direction.
4. Posting and idempotency decision happen in one serializable/locked database
   transaction.
5. Available funds are checked and reserved atomically.
6. Corrections create linked reversal/adjustment entries; records are never
   deleted or rewritten to conceal history.
7. Provider status does not move value by itself. A domain transition explicitly
   posts or reverses value after validation.

Property-based and concurrent tests must continuously prove these invariants.

## 5. Command and event pattern

Every money command carries:

- authenticated actor/customer and authorization context
- idempotency key scoped to actor + operation
- request/correlation ID
- expected asset/amount and policy version
- step-up/MFA proof where required

The database transaction records the domain state, journal effects (if any),
audit event, and an outbox event. A worker delivers external commands and marks
outbox attempts. Provider callbacks are stored first, then processed from the
durable record.

An inbox table deduplicates provider events by provider + event ID and/or a
verified canonical payload hash. Out-of-order events are retained and resolved by
the state machine rather than blindly overwriting newer state.

## 6. Provider boundary

Use explicit interfaces such as:

- `KycProvider`
- `FiatRailProvider`
- `CustodyProvider`
- `ScreeningProvider`
- `NotificationProvider`
- `ObjectStore`

Each adapter maps provider-specific states/errors into a closed internal model,
retains safe raw evidence with a bounded retention policy, verifies webhook
signatures/timestamps, and exposes reconciliation downloads. Provider health is
reported from real probes/events, never configuration presence.

Sandbox and production credentials, data, endpoints, queues, databases, and
alerts must be physically/logically separated. There is no runtime "demo mode"
switch that can accidentally route production value into fixtures.

## 7. Authentication and authorization

- Prefer server-managed, rotating opaque sessions in `Secure`, `HttpOnly`,
  `SameSite` cookies for the web clients; add CSRF protection for mutations.
- Short-lived signed tokens may be used for service/provider needs, but do not
  store long-lived bearer tokens in browser local storage.
- Passwords use a currently approved memory-hard KDF; support passkeys and TOTP
  or another approved phishing-resistant/step-up method.
- Authorization combines role permission, customer/resource ownership, account
  status, capability restriction, KYC/risk tier, transaction limits, beneficiary
  policy, and required approval state.
- Sensitive operations re-evaluate policy at execution time, not only when a UI
  button is rendered.

## 8. KYC, privacy, and secrets

- Use provider-hosted capture/tokenization where possible. Do not copy identity
  images into application logs, analytics, support messages, or source control.
- Encrypt required sensitive fields with envelope encryption and KMS-managed
  keys; maintain rotation/version metadata.
- Keep signing/custody keys outside application storage. Prefer a regulated
  custody provider or HSM/MPC design selected through formal review.
- Central logs use allowlists/redaction and must omit credentials, full account
  numbers, document images, seed phrases, private keys, and raw sensitive
  payloads.
- Define retention, legal hold, deletion/anonymization, and audit immutability by
  jurisdiction before production.

## 9. Restrictions and dual control

Restriction evaluation is a reusable server policy that returns an explicit
allow/deny/review decision plus safe reason code. It runs before value is held or
sent. Overrides are separate commands and cannot erase the original decision.

Dual-control workflows cover at minimum:

- manual financial adjustments/reversals above threshold
- unfreezing or overriding compliance restrictions
- high-value withdrawals and beneficiary/address overrides
- role/permission escalation
- provider/asset/network/limit configuration changes
- production credential activation

The initiator cannot approve their own action.

## 10. Read models, invoices, and exports

Customer transaction history is a projection joined to immutable ledger/domain
references. It may be rebuilt; ledger records may not. Public transaction IDs are
random/non-sequential and distinct from internal primary keys.

Invoices are mutable requests until paid/expired/cancelled; receipts are immutable
representations of posted transactions. PDF/CSV generation runs as a bounded job,
escapes content, stores encrypted objects with short-lived download grants, and
records access in the audit log.

## 11. Reliability and observability

- Structured redacted logs with correlation IDs; metrics for command outcomes,
  provider latency/failures, queue age, journal/reconciliation invariants, and
  security events.
- Liveness only proves the process runs; readiness checks required dependencies
  without claiming external rails are operational when they are not.
- Timeouts, bounded retries with jitter, circuit breaking, dead-letter queues,
  replay tooling, and operator-visible exceptions.
- Encrypted backups, point-in-time recovery, restore verification, and documented
  RPO/RTO. A backup is not accepted until a restore exercise succeeds.
- SQLite provides local build continuity only. Before hosting, every migration
  and financial invariant must pass against real MySQL 8.4+ with InnoDB,
  production-like isolation/locking, strict SQL mode, and UTC configuration.

## 12. Testing strategy

- Unit/property tests for money, state machines, limits, and ledger invariants.
- Local SQLite integration tests for basic schema/application behavior plus
  mandatory MySQL integration tests for transactions, row locks, isolation,
  idempotency, constraints, outbox/inbox, and concurrent spend before hosting.
- Contract tests against versioned provider sandbox fixtures plus periodic real
  sandbox calls.
- API authorization matrix and IDOR tests for every resource.
- End-to-end tests for KYC gates, restrictions, transfer/invoice/receipt,
  deposits/withdrawals, reversals, reconciliation, and failure/retry paths.
- SAST, dependency/license/secret scans, container/IaC scans, DAST, and an
  independent penetration test before production.
