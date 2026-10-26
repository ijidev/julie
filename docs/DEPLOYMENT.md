# Deployment

## Unit
`deploy/julie.service` → installed at `/etc/systemd/system/julie.service`.
Runs `/usr/bin/node /home/admin/julie/server/dist/index.js` as user `admin`,
`Restart=always`, `RestartSec=3`, port 3000 on 0.0.0.0.

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
cd /home/admin/julie
npm run build        # backend → server/dist
npm run web:build    # frontend → web/dist
sudo cp deploy/julie.service /etc/systemd/system/julie.service
sudo systemctl daemon-reload
sudo systemctl enable --now julie
curl -s localhost:3000/api/health
```

## Environment / secrets
`/home/admin/julie/.env` (mode 0600, gitignored):
- `PORT=3000`, `BIND_HOST=127.0.0.1`
- `GATEWAY_URL=ws://127.0.0.1:18789`
- `GATEWAY_TOKEN` — OpenClaw gateway shared secret (see docs/INTEGRATIONS.md)
- `ADMIN_PASSWORD` — owner login password
- `ADMIN_TOKEN` — session cookie secret

If secrets are missing the process refuses to boot (fail closed).

## Network
- JULIE binds **127.0.0.1:3000 only** (`BIND_HOST=127.0.0.1` in `.env`); the
  public IP no longer reaches it directly.
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
1. `curl -s localhost:3000/api/health` → ok:true, gateway.connected true
2. `curl -s -o /dev/null -w "%{http_code}" -X POST localhost:3000/api/conversations -d '{}' -H 'Content-Type: application/json'` → 401
3. Login with owner password → 200 + Set-Cookie julie_session (HttpOnly)
4. Send a chat message → real assistant reply persisted (see docs/INTEGRATIONS.md)