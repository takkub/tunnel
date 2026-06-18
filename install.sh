#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "=========================================="
echo " Tunnel Manager - Linux Installer"
echo "=========================================="
echo

# Check Node.js
if ! command -v node &>/dev/null; then
    echo "[ERROR] Node.js is not installed."
    echo
    echo "Please install Node.js first:"
    echo "  Ubuntu/Debian:  sudo apt install nodejs npm"
    echo "  Fedora/RHEL:    sudo dnf install nodejs"
    echo "  Arch:           sudo pacman -S nodejs npm"
    echo "  nvm (any):      https://github.com/nvm-sh/nvm"
    exit 1
fi
echo "[OK] Node.js $(node --version) found"

# Check/Download cloudflared
SCRIPT_DIR="$(pwd)"
CLOUDFLARED="$SCRIPT_DIR/cloudflared"

if [ ! -f "$CLOUDFLARED" ]; then
    echo "[INFO] cloudflared not found. Downloading..."
    ARCH="$(uname -m)"
    case "$ARCH" in
        x86_64)        CF_ARCH="amd64" ;;
        aarch64|arm64) CF_ARCH="arm64" ;;
        armv7l)        CF_ARCH="arm"   ;;
        *)             CF_ARCH="amd64" ;;
    esac
    curl -L -o "$CLOUDFLARED" \
        "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}"
    chmod +x "$CLOUDFLARED"
    echo "[OK] cloudflared downloaded (linux-${CF_ARCH})"
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
echo "     or run  tunnels/<name>/start.sh  to launch a tunnel"
echo
