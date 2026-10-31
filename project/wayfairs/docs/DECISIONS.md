# Wayfairs decision record

## WDR-001 — Dependency-free PHP distribution

Use PHP 8.2+ and PDO without Composer/runtime packages so the application can be
uploaded to standard shared hosting. A small internal autoloader and front
controller keep the distribution self-contained.

## WDR-002 — SQLite preview, MySQL hosted target

SQLite supports local installation and automated tests. MySQL 8.4+/InnoDB is the
hosted financial source of truth. Numbered migrations are paired, and no SQLite
test is accepted as evidence of MySQL locking/concurrency behavior.

## WDR-003 — Manual rails are explicit

Without approved provider credentials, deposits/withdrawals are real persisted
requests with manual administrator verification/completion. They are not labeled
connected, settled, broadcast, confirmed, or reconciled by configuration alone.

## WDR-004 — Wayfairs is a setting, not hardcoded identity

The installer defaults the site name to **Wayfairs**. Administrators can change
name, tagline, support/contact, address, colors, and deposit instructions under
Site Info. Templates always read persisted settings.

## WDR-005 — Safe support impersonation

Impersonation requires administrator reauthentication and a reason, expires in
30 minutes, retains/restores the original admin session, is prominently shown,
and blocks value movement and sensitive mutations. Audit events retain the real
administrator and effective user.
