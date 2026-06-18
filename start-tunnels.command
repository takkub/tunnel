#!/usr/bin/env bash
# macOS double-click launcher
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "=== Start All Tunnels ==="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed. Install with: brew install node"
  read -r -p "Press Enter to exit..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting all tunnels (mode: auto-detect)..."
npm run start

echo
read -r -p "Done. Press Enter to close..."
