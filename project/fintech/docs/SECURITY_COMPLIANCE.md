# Security and Compliance Baseline

## Status

This is a mandatory engineering baseline, not a substitute for advice from
qualified counsel, compliance, security, privacy, treasury, and regulated
partners in the chosen jurisdiction.

## Production blockers

The system must not accept real customer PII or move real value until all of the
following are named, documented, and approved:

- legal entity, jurisdiction, licensing/regulated-partner model, permitted
  products and customer segment
- AML/CFT, sanctions, transaction monitoring, reporting, travel-rule, consumer
  protection, complaints/disputes, and record-retention programs
- privacy controller/processor roles, lawful bases/consent, data locations,
  retention/deletion, subject rights, and breach process
- fiat rail and custody responsibilities, safeguarding/segregation, settlement,
  reconciliation, insolvency treatment, and customer disclosures
- asset/network/provider allowlists, fees/limits, risk appetite, maker/checker
  thresholds, and emergency stop authority
- security owner, compliance officer, treasury/operations owner, incident/on-call
  roster, vendors/DPAs, and insurance requirements

## Data classification

| Class | Examples | Minimum handling |
| --- | --- | --- |
| Restricted | credentials, private/signing keys, seed phrases, KYC documents, biometrics, government IDs, full bank details | never in source/logs; provider tokenization or envelope encryption; strict service/role access; access audit; short approved retention |
| Confidential | customer profile, balances, transaction details, risk/case notes, provider payloads | encryption, least privilege, redacted observability, approved retention/export controls |
| Internal | policies, non-public configuration, operational metrics | authenticated access, change control, backup |
| Public | approved marketing/help content | integrity/change review |

Private keys/seed phrases are outside the application data model. Use an approved
custody/HSM/MPC service and do not export key material into the app runtime.

## Threats that require explicit controls

- account takeover, credential stuffing, SIM swap, recovery abuse, session theft,
  CSRF, XSS, phishing, and malicious OAuth/deep links
- IDOR/BOLA, privilege escalation, support/admin impersonation, insider fraud,
  maker/checker collusion, and audit tampering
- double spend, race conditions, rounding/precision error, duplicate commands,
  webhook replay/forgery, out-of-order events, and provider ambiguity
- beneficiary/address substitution, clipboard malware, wrong network/memo,
  address poisoning, chain reorg, compromised custody/provider, and sanctions
  exposure
- SQL/command/template injection, SSRF, unsafe file/PDF handling, dependency
  compromise, secret leakage, and build/deployment tampering
- denial of service, queue starvation, provider outage, database corruption,
  backup failure, region failure, clock drift, and reconciliation gaps
- KYC document/biometric leakage, over-retention, analytics leakage, unauthorized
  exports, and insecure support workflows

## Required preventive controls

- Phishing-resistant MFA/passkey-ready auth, step-up for sensitive actions,
  rotating/revocable sessions, secure cookies, CSRF protection, rate limiting,
  verified contact changes, recovery cooling-off, and session/device notices.
- Deny-by-default RBAC/ABAC with resource ownership and account policy checks on
  every server command. UI visibility is not authorization.
- Balanced immutable ledger, atomic available-funds reservation, idempotency,
  database constraints/locking, signed provider webhooks, replay window,
  durable inbox/outbox, and closed state machines.
- Encryption in transit and at rest, KMS envelope encryption, separate
  environment keys/accounts, short-lived workload identity, rotation, and secret
  scanning. No shared human production credentials.
- Dual control and time-bound approval for high-risk configuration, corrections,
  overrides, unfreezes, high-value withdrawals, role changes, and production
  enablement.
- Network/service least privilege, hardened images, dependency pinning/SBOM,
  signed build provenance where available, protected CI environments, reviewed
  migrations, and rollback/stop procedures.
- Provider-hosted KYC capture, safe upload validation where unavoidable,
  malware/content checks, strict object ACLs, download grants, redacted logs, and
  production-data prohibition in non-production.

## Detective and recovery controls

- Immutable security/business audit events with actor, effective identity,
  request/correlation ID, source, reason, before/after safe diff, approval, and
  time. Audit readers cannot mutate records.
- Alerts for authentication abuse, contact/MFA changes, restriction overrides,
  role/config changes, idempotency conflicts, webhook failures/replay, queue age,
  provider divergence, negative/imbalanced invariants, reconciliation breaks,
  export spikes, and backup/restore failures.
- Daily provider/custody/bank-to-ledger reconciliation with aged-break queues and
  documented resolution evidence. Never auto-plug differences.
- Incident response for account takeover, fraud, key/credential compromise,
  provider breach, data breach, ledger issue, and chain event; include customer/
  regulator notification decision paths.
- Encrypted backups and point-in-time recovery with separation, retention,
  integrity checks, regular restores, and a measured recovery exercise.

## Verification before pilot

- Architecture/threat/privacy reviews and complete authorization matrix.
- Ledger property/concurrency/idempotency tests and seeded reconciliation breaks.
- Provider sandbox contract/failure/replay/signature tests.
- SAST, dependency/license/container/IaC/secret scans and DAST.
- Independent penetration test covering customer, operations, API, webhooks,
  exports, and privilege boundaries; critical/high findings resolved or formally
  blocked from release.
- Access review, dual-control demonstration, key/secret rotation exercise,
  backup restore, disaster recovery, incident tabletop, and emergency stop test.
- Evidence retained with owner, date, result, exceptions, and approving role.

## Honest status language

- Configuration present is not "connected".
- Provider accepted is not "settled".
- Blockchain observed is not "confirmed" or "final".
- KYC submitted is not "verified".
- A backup job succeeded is not "recoverable" until restore is tested.
- A scan passed is not "secure"; report exact scope, date, tool, and findings.
- A sandbox round trip is not production readiness.
