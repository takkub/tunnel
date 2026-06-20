# Tunnel Management Scripts

## Run Web Admin UI

| Platform | One-click |
|---|---|
| **Windows** | Double-click `start-web.bat` |
| **macOS** | Double-click `start-web.command` (right-click → Open on first run) |
| **Linux** | `chmod +x start-web.sh && ./start-web.sh` |

Or via npm from the repo root:

```bash
npm run web      # build (if needed) + start production server on :8888
npm run web:dev  # start dev server with hot-reload (for development only)
```

Open **http://localhost:8888** after starting.

The server runs in the background — to stop it close the "Tunnel Web Admin" window (Windows) or `kill $(cat web-admin.pid)` (macOS/Linux).

---

Automation to manage Cloudflare tunnels across Windows, macOS, and Linux — via Docker or native `cloudflared`.

## Installation / ติดตั้ง

### Quick Start

| Platform | How to install |
|---|---|
| **Windows** | Double-click `install.bat` |
| **macOS** | Double-click `install.command` (right-click → Open on first run) |
| **Linux** | `chmod +x install.sh && ./install.sh` |

Each installer:
1. Checks for Node.js — prints install instructions if missing
2. Downloads `cloudflared` for your OS/arch if not already present
3. Runs `npm install` for root + `web/`
4. Creates `.env` from `.env.example` if not present

### Requirements

| Tool | Required | Notes |
|---|---|---|
| **Node.js 18+** | Yes | [nodejs.org](https://nodejs.org) or `brew install node` |
| **cloudflared** | Yes | Installer downloads automatically |
| **Docker** | No | Optional — installer detects and reports |

### After Install

1. Edit `.env` — set `CLOUDFLARE_API_TOKEN` and `ZONE_ID`
2. Login to Cloudflare: `npm run login`
3. Open web UI: `npm run web:dev` → http://localhost:3000  
   or double-click `tunnels/<name>/start.bat` (Windows) / `start.command` (macOS) / run `start.sh` (Linux)

---

## Requirements

| Requirement | Windows | macOS | Linux |
|---|---|---|---|
| Node.js 18+ | [nodejs.org](https://nodejs.org) | `brew install node` | `apt install nodejs npm` |
| cloudflared | `cloudflared.exe` bundled in repo | `brew install cloudflared` | package manager |
| Docker (optional) | Docker Desktop | Docker Desktop | Docker Engine |

## Per-Tunnel Launchers

Every tunnel gets its own one-click launcher files inside `tunnels/<name>/`:

| File | Platform | How to use |
|---|---|---|
| `start.bat` | Windows | Double-click |
| `start.command` | macOS | Double-click (right-click → Open on first run) |
| `start.sh` | Linux | `./start.sh` in terminal |

Each launcher starts only that specific tunnel using the effective runtime mode (Docker if available, otherwise native `cloudflared`).

These files are created automatically when you create a tunnel via the web UI or `npm run setup`.

### Web UI

```bash
npm run web:dev   # start web UI (http://localhost:3000)
```

### Docker (any platform)

```bash
docker compose -f docker-compose-web.yml up
```

## Terminal Commands

**Web UI**
```bash
npm run web:dev   # start web UI (http://localhost:3000)
```

**Tunnel Operations**
```bash
npm start                  # start all tunnels
npm run start:tunnel       # start one tunnel (interactive)
npm stop                   # stop all tunnels
npm run stop:tunnel        # stop one tunnel (interactive)
npm run menu               # interactive menu (all options)
```

**Management**
```bash
npm run check     # check requirements
npm run login     # Cloudflare login
npm run setup     # setup a new tunnel
npm run status    # check tunnel status
npm run delete    # delete a tunnel
```

## Runtime Mode

The manager auto-detects whether to use Docker or native `cloudflared`:

| Mode | Behaviour |
|---|---|
| `auto` (default) | Uses Docker if available, otherwise native `cloudflared` |
| `docker` | Always use Docker compose |
| `native` | Always use `cloudflared` binary directly |

Switch mode in the web UI under **Settings → Runtime Mode**, or edit `runtime.config.json`:

```json
{ "mode": "auto" }
```

Native mode stores PIDs at `tunnels/<name>/.pid` and logs at `tunnels/<name>/.log`.

## Available Tunnels

Tunnel configs live in `tunnels/<name>/config.yml`. Docker compose files are at `docker-compose-cloudflare-<name>.yml`.

Notes
- Sensitive files (certs, credentials, `.pid`) are ignored by `.gitignore`.
- `cloudflared.exe` is bundled for Windows; macOS/Linux users install via `brew install cloudflared` or their package manager.
