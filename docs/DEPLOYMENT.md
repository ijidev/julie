# Deployment

## Unit
Install with the helper (renders the template for this checkout, user, and node
binary):

```bash
sudo ./deploy/install-service.sh
```

- Template: `deploy/julie.service.template` (`@JULIE_ROOT@`, `@JULIE_USER@`,
  `@NODE_BIN@` placeholders)
- Default destination: `/etc/systemd/system/julie.service`
- `deploy/julie.service` is the concrete unit currently installed on the
  reference host (`/home/admin/julie`, user `admin`). New installs should use the
  installer rather than copying that file.
- Policy: `Restart=always`, `RestartSec=3`, `NODE_ENV=production`. No secret
  values are embedded in the unit; the app reads `.env` itself.

## Commands
```bash
sudo systemctl start julie          # start
sudo systemctl stop julie           # stop
sudo systemctl restart julie        # restart
systemctl status julie              # status
journalctl -u julie -f              # follow logs
journalctl -u julie -n 200          # last 200 lines
```

## First install / redeploy
```bash
cd <checkout>
npm ci
npm --prefix web ci
cp .env.example .env && chmod 600 .env   # fill in the three secrets
npm run build                            # backend  -> server/dist
npm run web:build                        # frontend -> web/dist
npm run doctor                           # read-only setup discovery
sudo ./deploy/install-service.sh         # render + enable the unit
curl -s localhost:3000/api/health
```

## Environment / secrets
See `README.md` for the full table and `.env.example` for a template. The file is
`.env` in the checkout (mode 0600, gitignored):
- `PORT`, `BIND_HOST`, `GATEWAY_URL`
- `GATEWAY_TOKEN` — OpenClaw gateway shared secret
- `ADMIN_PASSWORD` — owner login password (>= 12 chars)
- `ADMIN_TOKEN` — session cookie secret (>= 24 chars)
- `JULIE_DATA_DIR`, `DB_PATH` — optional storage overrides
- `JULIE_TERMINAL_ENABLED`, `JULIE_TERMINAL_ROOT` — owner terminal (off by default)

If required secrets are missing or too short the process refuses to boot
(fail closed).

## Storage and permissions
- Data directory: mode 0700 (default `data/`).
- Database and WAL/SHM files: mode 0600, re-applied at boot.
- Schema version: `PRAGMA user_version`, reported by `/api/health` as
  `schemaVersion`. Migrations run once per database.

## Network
- Bind address comes from `BIND_HOST`; on the reference host JULIE binds
  **127.0.0.1:3000** and is fronted by Caddy.
- Public access URL (once DNS exists): `https://julie.ijihost.com` via Caddy
  (automatic TLS; ACME retries until the record is created).
- Required operator step in Cloudflare DNS (no CF API credentials on this
  server): `julie A 169.58.118.108`, `julie AAAA 2a02:c207:2365:275::1`.
- Health (on the box): `curl http://127.0.0.1:3000/api/health`
- ufw is inactive on this host.
- Caddy: pre-existing `Juli.ijihost.com` → 127.0.0.1:18789 route untouched;
  new `julie.ijihost.com` → 127.0.0.1:3000 block added (backup:
  /etc/caddy/Caddyfile.backup-pre-julie-*).

## Verification checklist
1. `curl -s localhost:3000/api/health` → `ok:true`, `schemaVersion` present,
   `gateway.connected` true, `terminal.enabled` as configured
2. `curl -s -o /dev/null -w "%{http_code}" -X POST localhost:3000/api/conversations -d '{}' -H 'Content-Type: application/json'` → 401
3. Login with owner password → 200 + Set-Cookie julie_session (HttpOnly)
4. Send a chat message → real assistant reply persisted (see docs/INTEGRATIONS.md)
5. `npm run doctor` → no FAIL lines
