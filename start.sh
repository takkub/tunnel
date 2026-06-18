#!/usr/bin/env bash
set -e

# Resolve project root relative to this script
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "=== Cloudflare Tunnel Manager ==="
echo

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed."
  echo "  macOS : brew install node"
  echo "  Ubuntu: sudo apt install nodejs npm"
  exit 1
fi

# Install root deps
if [ ! -d node_modules ]; then
  echo "Installing root dependencies..."
  npm install
fi

# Install web deps
if [ ! -d web/node_modules ]; then
  echo "Installing web dependencies..."
  (cd web && npm install)
fi

echo "Starting web UI on http://localhost:3000 ..."
echo "(Press Ctrl+C to stop)"
echo

# Open browser after server starts (background, best-effort)
(
  sleep 3
  if command -v open >/dev/null 2>&1; then
    open http://localhost:3000
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open http://localhost:3000
  fi
) &

npm run web:dev
