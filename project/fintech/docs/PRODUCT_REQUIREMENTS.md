# Product Requirements

## 1. Product outcome

Build a secure financial platform where verified customers can hold supported
fiat and crypto asset accounts, deposit and withdraw through approved rails,
transfer value, issue payment requests/invoices, download receipts, and review a
complete transaction history. Authorized operations and compliance staff must be
able to review KYC, apply narrowly scoped account restrictions, investigate
transactions, reconcile provider activity, and audit every sensitive action.

This document is a product/engineering baseline, not legal advice or a claim of
banking licensure.

## 2. Users and permissions

| Role | Required capabilities |
| --- | --- |
| Customer | Register, secure the account, complete KYC, view accounts/balances, deposit, withdraw, transfer, manage beneficiaries, create/pay invoices, download statements and receipts |
| Support | View minimum customer/account context, manage support cases, never change balances or approve restricted value movement |
| Compliance analyst | Review KYC/AML cases, request information, apply policy restrictions, record evidence and reason codes |
| Treasury/operations | Review provider settlements, queues, exceptions, and reconciliations; initiate but not solely approve high-risk corrections |
| Administrator | Manage role assignments, product configuration, limits, and feature availability with audited dual control |
| Auditor | Read-only access to immutable journals, security/audit events, decisions, and reconciliation evidence |

Permissions must be deny-by-default, server-enforced, tenant/customer scoped, and
tested against horizontal/vertical privilege escalation.

## 3. Requested capabilities

### 3.1 Identity, authentication, and KYC

- Registration and verified email/phone ownership.
- Password/passkey-ready authentication, MFA for sensitive actions, secure
  session management, device/session review, recovery controls, and rate limits.
- KYC state machine: `not_started`, `pending`, `in_review`, `needs_resubmission`,
  `verified`, `rejected`, `expired`.
- Provider-hosted document/selfie collection where possible; persist only the
  minimum provider references, normalized attributes, reason codes, consent, and
  decision evidence required by policy.
- Configurable customer tiers, transaction limits, screening status, and periodic
  refresh/expiry rules.
- No deposit, withdrawal, transfer, or crypto address activation beyond the
  approved KYC/risk tier.

### 3.2 Asset accounts and balances

- One customer may own multiple asset accounts (for example NGN, USD, BTC, ETH),
  but the approved jurisdiction/provider list determines what is actually
  enabled.
- Show posted, pending, held, and available amounts distinctly.
- Every balance is derived from balanced journal postings plus explicit holds;
  the API never accepts a client-supplied balance.
- Monetary input/output carries asset code, native integer amount, scale, and
  display formatting. Binary floating point is prohibited.

### 3.3 Fiat deposits and withdrawals

- Provider-neutral adapters for virtual accounts, bank transfer, card or other
  owner-approved rails.
- Deposit lifecycle includes instruction creation, provider event receipt,
  signature verification, matching, settlement, ledger posting, notification,
  and reconciliation.
- Withdrawal lifecycle includes beneficiary validation, limits/risk evaluation,
  step-up authentication, hold/authorization, provider submission, settlement or
  failure, and release/reversal.
- Provider callbacks are authenticated, deduplicated, replay-safe, durably
  stored, and processed asynchronously.
- Fees, taxes, provider charges, FX quotes, expiry, and final customer amount are
  explicit before confirmation.

### 3.4 Crypto deposits and withdrawals

- Custody/wallet provider adapter; no private keys or seed phrases in the app
  database or logs.
- Address/memo/tag assignment, network/asset allowlist, confirmation thresholds,
  chain reorganization handling, dust/minimum rules, and address-risk screening.
- Credit only after the approved confirmation and risk policy; report pending
  confirmations without labeling them settled.
- Withdrawal address validation, allowlist/cooling-off policy, step-up auth,
  sanctions/risk screening, fees, travel-rule handling where applicable,
  approval controls, broadcast tracking, and finality/reversal policy.
- Testnet/sandbox only until custody, licensing, asset, network, and signing
  decisions are approved.

### 3.5 Transfers, invoices, and receipts

- Internal customer-to-customer transfer with recipient verification,
  idempotency, fees/limits, atomic balanced posting, notifications, and privacy-
  preserving references.
- External transfers use the applicable fiat or crypto withdrawal workflow;
  there is no bypass path.
- A payment request/invoice has issuer, recipient/contact, line items or memo,
  asset/amount, due date, expiry, status, and a non-guessable public reference.
- Paying an invoice creates or links a real transfer; invoice status is derived
  from settled postings, not a client flag.
- A receipt/proof of transfer is generated only from a posted transaction and
  includes a verifiable reference, parties as policy permits, amount/asset,
  fees, timestamps, status, and reversal link. Invoice and receipt are distinct.
- HTML/PDF output must escape untrusted content and avoid exposing internal IDs
  or sensitive KYC data.

### 3.6 Account blocks, holds, and restrictions

- Separate overall account lifecycle (`active`, `restricted`, `frozen`,
  `blocked`, `closed`) from granular capability restrictions (`login`,
  `fiat_deposit`, `fiat_withdrawal`, `crypto_deposit`, `crypto_withdrawal`,
  `internal_transfer`, `invoice`).
- A restriction records scope, reason code, human rationale, source/case,
  effective/expiry time, creator, approver where required, and release evidence.
- Enforcement occurs in the domain service and authorization policy before any
  hold, provider request, or journal posting—not only in the UI.
- Emergency freezes are immediate and audited. Release, high-risk overrides,
  manual adjustments, and role changes require dual control.
- Customers receive only legally/policy-approved messaging; internal risk notes
  remain private.

### 3.7 Transaction history and statements

- Search/filter by date, asset, direction, type, status, amount range, and public
  reference with stable cursor pagination.
- A transaction shows its current lifecycle plus immutable event history,
  related fees, provider/network reference where safe, invoice/receipt, and
  reversal relationship.
- CSV/PDF statements are generated from posted ledger data for a bounded period,
  are access controlled, and record who generated/downloaded them.
- Pending, failed, reversed, and completed are never conflated.

### 3.8 Operations, audit, and reconciliation

- Queues for KYC review, withdrawal approval, provider/webhook exceptions,
  restrictions, disputes, and reconciliation breaks.
- Append-only audit events for authentication, permissions, KYC, restrictions,
  configuration, provider commands, journal postings, exports, and approvals.
- Daily automated reconciliation between provider/custodian statements,
  platform transactions, journal postings, fees, and settlement accounts.
- Breaks remain visible until resolved with evidence; no silent auto-balancing.
- Manual financial corrections use reviewed journal adjustments/reversals, never
  direct database balance edits.

## 4. Non-functional requirements

- **Correctness:** each journal entry balances per asset; idempotent concurrent
  commands create at most one economic effect.
- **Security:** OWASP ASVS-aligned controls, secure cookies, CSRF protection,
  MFA/step-up, encryption, secret rotation, least privilege, and tamper-evident
  audit retention.
- **Privacy:** data minimization, purpose/consent records, retention/deletion
  schedules, subject-right workflows, and redacted observability.
- **Availability:** explicit SLOs, health/readiness checks, graceful provider
  degradation, queues with dead-letter handling, and tested restore/recovery.
- **Performance:** define targets after expected users/volumes are supplied;
  financial correctness and authorization take precedence over latency.
- **Accessibility:** responsive WCAG 2.2 AA target for customer and operations
  interfaces.
- **Localization:** timezone-aware UTC storage, locale-aware display, and
  explicit currency/asset formatting.

## 5. MVP boundary

The first pilot should support one jurisdiction, one fiat currency/rail, one KYC
provider, one custody provider, and at most two approved crypto assets/networks.
It includes customer and operations experiences, but excludes lending, cards,
interest/yield, staking, derivatives, anonymous transfers, cross-chain swaps,
cash deposits, and multi-country rollout.

## 6. Owner decisions required

1. Product name, customer segment (consumer/business/both), and target launch
   date/expected volume.
2. Operating jurisdiction, legal entity/licence or regulated partner, privacy
   regime, fiat currencies, and record-retention requirements.
3. Custodial model and approved crypto assets/networks; whether crypto is needed
   in the first pilot.
4. Existing contracts or preferred providers for KYC, fiat rails, custody,
   screening, messaging, object storage, and cloud/KMS.
5. Fee model, transaction/KYC tier limits, approval thresholds, support model,
   and dispute/refund policy.
6. Brand/design direction and whether customer and operations experiences share
   one app or separate entry points.

Until these are resolved, provider work stays vendor-neutral and sandbox-only.

## 7. MVP acceptance gates

- All critical flows have approved state machines and authorization matrices.
- Ledger property/concurrency tests prove balanced and single-effect posting.
- KYC/restriction policies block every prohibited server-side command.
- Real provider sandboxes demonstrate success, duplicate, delayed, out-of-order,
  invalid-signature, timeout, and reversal/failure paths.
- Reconciliation detects seeded mismatches and preserves resolution evidence.
- Security review, dependency/secret scanning, penetration test, privacy review,
  backup restore, and recovery exercise pass with retained evidence.
- No production credentials or real customer data are introduced before the
  explicit production approval gate.
