#!/usr/bin/env bash
# Render and install the Julie systemd unit for this checkout.
#
#   sudo ./deploy/install-service.sh
#
# Honors:
#   JULIE_USER  service user (default: the invoking user)
#   NODE_BIN    node executable (default: node on PATH)
#   UNIT_PATH   unit destination (default: /etc/systemd/system/julie.service)
#
# This writes outside the repository. It only creates/replaces the single Julie
# unit and never touches OpenClaw, Caddy, or other services.
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run with sudo: sudo $0" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_USER="${JULIE_USER:-${SUDO_USER:-$(id -un)}}"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
UNIT_PATH="${UNIT_PATH:-/etc/systemd/system/julie.service}"

if [[ -z "${NODE_BIN}" || ! -x "${NODE_BIN}" ]]; then
  echo "node executable not found; set NODE_BIN=/path/to/node" >&2
  exit 1
fi
if [[ ! -f "${ROOT}/server/dist/index.js" ]]; then
  echo "backend build missing; run: npm run build" >&2
  exit 1
fi
if [[ ! -f "${ROOT}/.env" ]]; then
  echo "missing ${ROOT}/.env; copy .env.example and chmod 600 .env first" >&2
  exit 1
fi

sed \
  -e "s|@JULIE_ROOT@|${ROOT}|g" \
  -e "s|@JULIE_USER@|${SERVICE_USER}|g" \
  -e "s|@NODE_BIN@|${NODE_BIN}|g" \
  "${ROOT}/deploy/julie.service.template" > "${UNIT_PATH}"

chmod 644 "${UNIT_PATH}"
systemctl daemon-reload
systemctl enable --now julie.service

echo "Installed ${UNIT_PATH}"
echo "  user:    ${SERVICE_USER}"
echo "  root:    ${ROOT}"
echo "  node:    ${NODE_BIN}"
systemctl --no-pager --lines=0 status julie.service || true
