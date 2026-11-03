# Fintech Banking Platform

Sandbox foundation for a customer and operations platform supporting fiat and
crypto deposits/withdrawals, KYC, account controls, transfers, invoices/receipts,
and transaction history.

## Current state

- **Stage:** secure application foundation; owner product decisions still open
- **Runtime:** one NestJS process serving the React build and read-only evidence APIs
- **Workspace:** `Web Development`
- **Slug:** `fintech`
- **Owner route:** `/project/fintech/` (requires an authenticated Julie owner
  session)
- **Build database:** local SQLite with versioned migrations and real integrity checks
- **Hosting target:** MySQL 8.4+ / InnoDB; current import SQL is under `database/mysql/`
- **Money movement:** not implemented; no provider or blockchain connection is
  enabled

The launchable page reads real health/capability endpoints. It is not a simulated
bank and does not invent balances, KYC results, transactions, or providers.

## Planning artifacts

- [`docs/PRODUCT_REQUIREMENTS.md`](docs/PRODUCT_REQUIREMENTS.md) — scope,
  workflows, roles, acceptance criteria, and open product decisions
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — proposed modular-monolith,
  ledger, provider, security, and subpath architecture
- [`docs/DELIVERY_PLAN.md`](docs/DELIVERY_PLAN.md) — phased delivery and release
  gates
- [`docs/SECURITY_COMPLIANCE.md`](docs/SECURITY_COMPLIANCE.md) — mandatory
  controls and production blockers
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — provisional project decisions and
  owner decisions still required

The earlier team stack draft remains untouched at
`../fintech-tech-stack-recommendation.md`. This baseline narrows it into a
ledger-first, vendor-neutral delivery plan and leaves jurisdiction/provider
choices open for owner approval.

## Proposed implementation baseline

- TypeScript modular monolith: NestJS API and background jobs
- SQLite for this local sandbox build only
- MySQL 8.4+ with InnoDB as the intended hosted financial source of truth;
  versioned SQL remains importable through phpMyAdmin or the MySQL CLI
- React + Vite customer/operations web experience
- Transactional outbox for asynchronous work; Redis only where a cache/queue is
  justified and never as the balance authority
- Provider adapters for KYC, fiat rails, custody/wallet infrastructure,
  messaging, and object storage
- One deployable HTTP entry point that serves the built web application and API
  under Julie's `/project/fintech/` route

This stack is provisional until the decisions in `docs/DECISIONS.md` are
approved.

## Launch through Julie

Use Julie's **Projects** page to launch the application, then open:

```text
https://{host_url}/project/fintech/
```

The route is owner-session gated. The direct local process binds to loopback;
Julie remains the owner-facing entry point.

## Local verification

```sh
npm install
npm run db:migrate:sqlite
npm run verify
npm start
```

SQLite is not a production fallback. Before hosting, import the ordered files in
`database/mysql/` into a non-production MySQL 8.4+ database and rerun migration,
trigger, locking, idempotency, ledger-concurrency, backup, and restore checks.

## Production prohibition

Do not connect production payment, KYC, custody, node, or signing credentials;
accept real customer PII; or move real value until all Phase 0 decisions and the
production gates in the delivery/security plans are explicitly approved.
