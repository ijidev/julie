# MySQL hosting migrations

These files target **MySQL 8.4+ with InnoDB**. They are versioned, ordered, and
intended to be imported into a selected empty database using phpMyAdmin or the
MySQL CLI.

Current file:

- `001_foundation.sql` — migration tracking and append-only audit evidence only.

This is not yet a complete banking schema. Domain tables are added only when the
matching implementation and invariants exist; uploading a speculative full
schema would create a false readiness claim.

Before any hosted deployment:

1. Back up the target database and verify restore access.
2. Use a dedicated least-privilege application user; do not use the phpMyAdmin
   or MySQL root account from the application.
3. Import files once, in numeric order, into a non-production MySQL 8.4+
   environment first.
4. Run the migration, trigger, locking, idempotency, ledger-concurrency, backup,
   and restore test suites against real MySQL.
5. Retain exact migration checksums and results. Do not edit an applied file;
   add the next numbered migration.

Example CLI import after selecting secure connection options:

```sh
mysql --database YOUR_DATABASE < database/mysql/001_foundation.sql
```

Do not put the password in this repository or directly in a shell command.
