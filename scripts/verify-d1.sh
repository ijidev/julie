#!/usr/bin/env bash
# Live endpoint verification for Phase D-1 (session cookie auth; never prints secrets).
set -u
cd /home/admin/julie
JAR=$(mktemp)
PASS=$(grep '^ADMIN_PASSWORD=' .env | head -1 | cut -d= -f2- | sed 's/^["'\'']//; s/["'\'']$//')

login() {
  curl -s -c "$JAR" -X POST localhost:3000/api/login -H 'Content-Type: application/json' \
    -d "{\"password\":\"$PASS\"}" | head -c 120
  echo
}

req() {
  local name="$1"; shift
  echo "=== $name ==="
  curl -s -b "$JAR" -w '\n[HTTP %{http_code}]\n' "$@" | head -c 1600
  echo
}

echo "--- login ---"; login
req "weather"      localhost:3000/api/weather
req "devices"      localhost:3000/api/devices
req "insights"     localhost:3000/api/insights
req "analytics"    localhost:3000/api/analytics
req "workspaces"   localhost:3000/api/workspaces
req "conversations" localhost:3000/api/conversations
rm -f "$JAR"
