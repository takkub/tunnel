#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")" && pwd)"
WEB="$ROOT/web"

cd "$WEB"

if [ ! -d ".next" ]; then
    echo "Building web app (first time takes 1-2 min)..."
    node node_modules/next/dist/bin/next build || { echo "Build failed"; exit 1; }
fi

echo "Starting Tunnel Web Admin on http://localhost:8888 ..."
nohup node node_modules/next/dist/bin/next start -p 8888 > "$ROOT/web-admin.log" 2>&1 &
echo $! > "$ROOT/web-admin.pid"

sleep 3
xdg-open http://localhost:8888 2>/dev/null || echo "Open http://localhost:8888 in your browser"
echo "Web Admin started at http://localhost:8888"
echo "Log: $ROOT/web-admin.log  |  PID: $(cat "$ROOT/web-admin.pid")"
