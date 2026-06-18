#!/usr/bin/env bash
# macOS double-click launcher — opens its own Terminal window automatically
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "=== Cloudflare Tunnel Manager ==="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed."
  echo "Install with: brew install node"
  echo
  read -r -p "Press Enter to exit..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing root dependencies..."
  npm install
fi

if [ ! -d web/node_modules ]; then
  echo "Installing web dependencies..."
  (cd web && npm install)
fi

echo "Starting web UI on http://localhost:3000 ..."
echo "(Close this window to stop)"
echo

(sleep 3 && open http://localhost:3000) &

npm run web:dev
