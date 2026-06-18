#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "=========================================="
echo " Tunnel Manager - macOS Installer"
echo "=========================================="
echo

# Check Node.js
if ! command -v node &>/dev/null; then
    echo "[ERROR] Node.js is not installed."
    echo
    echo "Please install Node.js first:"
    echo "  Option 1: brew install node"
    echo "  Option 2: https://nodejs.org"
    echo
    read -n1 -r -p "Press any key to exit..."
    exit 1
fi
echo "[OK] Node.js $(node --version) found"

# Check/Download cloudflared
SCRIPT_DIR="$(pwd)"
CLOUDFLARED="$SCRIPT_DIR/cloudflared"

if ! command -v cloudflared &>/dev/null && [ ! -f "$CLOUDFLARED" ]; then
    echo "[INFO] cloudflared not found."
    if command -v brew &>/dev/null; then
        echo "[INFO] Homebrew found — installing cloudflared via brew..."
        brew install cloudflared
        echo "[OK] cloudflared installed via brew"
    else
        echo "[INFO] Homebrew not found — downloading cloudflared binary..."
        ARCH="$(uname -m)"
        if [ "$ARCH" = "arm64" ]; then
            CF_ARCH="arm64"
        else
            CF_ARCH="amd64"
        fi
        TMP_TGZ="/tmp/cloudflared-darwin-${CF_ARCH}.tgz"
        curl -L -o "$TMP_TGZ" \
            "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${CF_ARCH}.tgz"
        tar -xzf "$TMP_TGZ" -C "$SCRIPT_DIR" cloudflared 2>/dev/null || \
            tar -xzf "$TMP_TGZ" -C /tmp && mv /tmp/cloudflared "$CLOUDFLARED"
        chmod +x "$CLOUDFLARED"
        rm -f "$TMP_TGZ"
        echo "[OK] cloudflared downloaded (darwin-${CF_ARCH})"
    fi
else
    echo "[OK] cloudflared already present"
fi

# npm install (root)
echo
echo "[INFO] Installing root dependencies..."
npm install
echo "[OK] Root dependencies installed"

# npm install (web)
echo
echo "[INFO] Installing web dependencies..."
(cd web && npm install)
echo "[OK] Web dependencies installed"

# .env setup
if [ ! -f .env ]; then
    cp .env.example .env
    echo "[OK] .env created from .env.example"
    echo "[!] Edit .env and fill in CLOUDFLARE_API_TOKEN and ZONE_ID"
else
    echo "[OK] .env already exists"
fi

# Check Docker (optional)
if command -v docker &>/dev/null; then
    echo "[OK] $(docker --version) found"
else
    echo "[INFO] Docker not found (optional — native cloudflared will be used)"
fi

echo
echo "=========================================="
echo " Installation complete!"
echo "=========================================="
echo
echo "Next steps:"
echo "  1. Edit .env  -  set CLOUDFLARE_API_TOKEN and ZONE_ID"
echo "  2. Login:       npm run login"
echo "  3. Web UI:      npm run web:dev  (http://localhost:3000)"
echo "     or double-click  tunnels/<name>/start.command  to launch a tunnel"
echo
read -n1 -r -p "Press any key to close..."
