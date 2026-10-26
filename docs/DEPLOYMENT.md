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
- `PORT=3000`, `BIND_HOST=0.0.0.0`
- `GATEWAY_URL=ws://127.0.0.1:18789`
- `GATEWAY_TOKEN` — OpenClaw gateway shared secret (see docs/INTEGRATIONS.md)
- `ADMIN_PASSWORD` — owner login password
- `ADMIN_TOKEN` — session cookie secret

If secrets are missing the process refuses to boot (fail closed).

## Network
- Public access URL: `http://169.58.118.108:3000` (plain HTTP — see BACKLOG B-1)
- Health: `http://169.58.118.108:3000/api/health`
- ufw is inactive on this host; no firewall rule was needed for 3000.
- Caddy (:80/:443) untouched.

## Verification checklist
1. `curl -s localhost:3000/api/health` → ok:true, gateway.connected true
2. `curl -s -o /dev/null -w "%{http_code}" -X POST localhost:3000/api/conversations -d '{}' -H 'Content-Type: application/json'` → 401
3. Login with owner password → 200 + Set-Cookie julie_session (HttpOnly)
4. Send a chat message → real assistant reply persisted (see docs/INTEGRATIONS.md)