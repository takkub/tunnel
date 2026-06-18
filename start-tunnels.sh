#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "=== Start All Tunnels ==="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed."
  echo "  macOS : brew install node"
  echo "  Ubuntu: sudo apt install nodejs npm"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting all tunnels (mode: auto-detect)..."
npm run start
