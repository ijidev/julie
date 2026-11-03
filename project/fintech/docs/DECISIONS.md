# Project Decision Log

## Accepted for planning

### FDR-001 — Ledger-first modular monolith

**Date:** 2026-10-30  
**State:** provisional baseline

Begin with a TypeScript modular monolith rather than microservices. All value
movement goes through one immutable double-entry ledger boundary. This reduces
distributed consistency risk and leaves extraction possible after real scale or
ownership evidence exists.

### FDR-002 — Sandbox-only until a production gate

**Date:** 2026-10-30  
**State:** mandatory

No production credentials, real customer PII, mainnet value movement, or public
financial claims until jurisdiction, operating model, providers, security,
compliance, reconciliation, and recovery are explicitly approved.

### FDR-003 — Provider adapters, not provider-shaped domain models

**Date:** 2026-10-30  
**State:** provisional baseline

KYC, fiat rail, custody, screening, messaging, and storage providers sit behind
internal interfaces and closed state mappings. Provider callbacks do not directly
edit balances or bypass policy.

### FDR-004 — One launchable HTTP entry point and subpath support

**Date:** 2026-10-30  
**State:** accepted for Julie preview

The project must load through the authenticated `/project/fintech/` route. The
eventual NestJS process will serve the built React application and APIs from one
launchable entry point with subpath-aware assets, routing, cookies, and requests.
Provider webhook ingress remains a separate production deployment decision.

### FDR-005 — Invoice and receipt are different records

**Date:** 2026-10-30  
**State:** provisional baseline

An invoice/payment request asks for value and may change before payment. A receipt
is generated only from an actual posted transfer and is immutable except for a
linked reversal/correction. Neither status is controlled by a client flag.

### FDR-006 — SQLite build, MySQL hosting target

**Date:** 2026-10-30  
**State:** owner selected

Use SQLite only for the current local sandbox because no MySQL runtime is
configured. Target MySQL 8.4+ with InnoDB for hosting and maintain ordered,
reviewable `.sql` imports suitable for phpMyAdmin or the MySQL CLI. SQLite is not
a production fallback and does not prove MySQL row-locking, isolation,
idempotency, or ledger-concurrency behavior; those checks are a mandatory
pre-hosting gate against real MySQL.

### FDR-007 — Foundation dependencies stay bounded

**Date:** 2026-10-30  
**State:** accepted for foundation

- NestJS provides the modular HTTP/lifecycle boundary and one launch process.
- React + Vite provide the subpath-aware owner/customer web shell.
- `better-sqlite3` provides deterministic local SQLite access and migrations;
  it is not the hosted database driver.
- Helmet supplies reviewed HTTP security headers; class-validator/transformer
  are reserved for strict request DTOs.
- Vitest and Supertest verify migration, API, denial, and subpath contracts.

No monorepo orchestrator, router framework, CSS framework, queue, cache, MySQL
driver, payment SDK, custody SDK, or KYC SDK is added before its implementation
need and real environment exist.

## Owner decisions pending

| ID | Decision | Why it blocks implementation/production |
| --- | --- | --- |
| OWN-001 | Product name, consumer/business segment, target date and volume | Defines journeys, tenancy, support and capacity |
| OWN-002 | Jurisdiction, licence/regulated partner, fiat currency and privacy/retention regime | Defines legal product, KYC/AML, data and reporting obligations |
| OWN-003 | Custodial model and initial crypto assets/networks; include crypto in pilot? | Defines security architecture, compliance, custody and finality policy |
| OWN-004 | KYC, fiat, custody, screening, messaging, cloud/KMS and object-store providers/contracts | Required for real sandbox contracts and data/responsibility review |
| OWN-005 | Fee/FX model, limits/tiers, approval thresholds and disputes/refunds | Required for ledger accounts, policy and customer disclosures |
| OWN-006 | Brand/design direction and one vs separate customer/operations entry points | Required for final information architecture and design system |

Nigeria-first providers appear in the earlier team stack draft, but this plan does
not treat that as owner confirmation of jurisdiction or vendor selection.
