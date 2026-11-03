# Fintech project guardrails

These instructions apply to every change under this project directory.

## Product safety

1. This project is **sandbox-only** until the owner records jurisdiction,
   licensing/compliance advice, custody model, providers, limits, and an
   explicit production approval. Never enable real-money or mainnet movement by
   inference.
2. Never fabricate balances, transactions, KYC outcomes, provider connectivity,
   confirmations, restrictions, reconciliation results, or launch readiness.
   Demo fixtures must be visibly labelled and must never share a production data
   path.
3. Never commit credentials, customer PII, KYC documents, wallet private keys,
   seed phrases, webhook secrets, or unredacted provider payloads.
4. Monetary value is represented in integer minor units or asset-native integer
   units with an explicit asset/scale. Do not use binary floating point for
   balances, fees, rates, or postings.
5. Every value movement posts a balanced, immutable double-entry journal entry.
   Never directly edit a balance. Corrections use linked reversal/adjustment
   entries.
6. All externally retried commands and webhooks require idempotency,
   authentication/signature verification, replay protection, durable event
   storage, and an auditable state transition.
7. Account blocks, freezes, holds, and capability restrictions are enforced on
   the server before value movement. Every change records actor, reason, scope,
   evidence reference, and timestamp. High-risk actions require dual control.
8. KYC decisions come from a verified provider/compliance workflow. Store the
   minimum required references and reason codes; avoid retaining raw documents
   when a provider can hold them.

## Engineering

- Start as a modular monolith with explicit domain boundaries; do not split into
  microservices before measured operational need.
- Keep one launchable HTTP entry point for Julie's authenticated
  `/project/fintech/` proxy. Frontend assets and API calls must work under that
  subpath.
- MySQL 8.4+ with InnoDB is the intended hosted financial source of truth.
  SQLite is permitted only for this local sandbox build and must never be used
  as production or as proof of MySQL locking/concurrency behavior. Caches,
  queues, search indexes, and SQLite fixtures may not authorize production
  spending.
- Critical tests include ledger balance invariants, concurrent/idempotent
  posting, authorization/IDOR, restriction enforcement, webhook replay,
  reconciliation, backup restore, and provider failure paths.
- A feature is not "working" until its real sandbox integration and failure
  behavior are observed. Production readiness additionally requires security,
  compliance, reconciliation, and disaster-recovery approval.
