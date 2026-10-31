# Wayfairs

An installable PHP banking operations script with separate user and admin
dashboards, editable branding/site information, KYC and restrictions, fiat and
crypto account workflows, immutable double-entry ledgering, transaction history,
transfers, invoices/receipts, and audited admin impersonation.

## Runtime requirements

- PHP 8.2+
- PDO SQLite for local preview or PDO MySQL for hosting
- Sodium, OpenSSL, mbstring, intl, fileinfo
- MySQL 8.4+ with InnoDB for hosted/production use
- Web root pointed to `public/`

No Composer or JavaScript build is required.

## Authenticated workspaces

- **Customer:** selected-currency overview, consolidated transactions,
  currency statements, printable receipts, deposits, withdrawals, transfers,
  invoices, verification, and security/account-status pages.
- **Administrator:** live operations dashboard, customer directory and detail,
  global transactions, deposit/withdrawal decision queues, expandable currency
  configuration, site information, and immutable audit history.

The responsive interface uses plain CSS and dependency-free JavaScript. Search
and filter controls operate only on the persisted rows returned by the server.

## Install

1. Upload the project outside the public web root when possible and point the
   domain/subdomain document root to `public/`.
2. Make `storage/` writable by the PHP process but not publicly accessible.
3. Open `/install` and provide the site, administrator, asset, and database
   settings. The installer writes `storage/config.php` with mode 0600 where the
   filesystem supports it.
4. Delete/disable installer access automatically occurs after successful setup.
5. Sign in as the administrator and complete **Admin → Site Info**, asset,
   deposit-instruction, and operating-limit configuration.

## Julie preview credentials

This instance is installed and running under `/project/wayfairs/`.

- **Administrator**: `admin@wayfairs.local` / `SecurePass123!`
- **Test customer**: `john@example.com` / `SecurePass123!`

To explore money movement, sign in as the administrator, go to **Customers →
john@example.com → Verification decision**, and approve the KYC submission.
Then sign in as `john@example.com` to deposit, transfer, withdraw, and create
invoices.

## Honest integration boundary

The script provides complete persisted manual workflows. A deposit is credited
only after an administrator records observed receipt; a withdrawal is debited
only when an administrator records completion and an external reference. Crypto
addresses and transaction hashes are manually recorded until a real custody/node
adapter exists. The UI never claims a provider or blockchain connection.

## Security boundary

Admin **Login as user** is support impersonation, not silent takeover: current
admin password and reason are required; the session is short-lived and visibly
bannered; all actions retain both identities; financial/security/configuration
mutations are denied until the administrator exits impersonation.
