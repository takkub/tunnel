# Tunnel Management Scripts

Automation to manage Cloudflare tunnels across Windows, macOS, and Linux — via Docker or native `cloudflared`.

## Requirements

| Requirement | Windows | macOS | Linux |
|---|---|---|---|
| Node.js 18+ | [nodejs.org](https://nodejs.org) | `brew install node` | `apt install nodejs npm` |
| cloudflared | `cloudflared.exe` bundled in repo | `brew install cloudflared` | package manager |
| Docker (optional) | Docker Desktop | Docker Desktop | Docker Engine |

## One-Click Launchers

### Open Web UI (recommended)

| Platform | Action |
|---|---|
| **Windows** | Double-click `start.bat` |
| **macOS** | Double-click `start.command` (right-click → Open first time) |
| **Linux** | Run `./start.sh` in terminal |

Opens the web UI at `http://localhost:3000` automatically.

### Start All Tunnels

| Platform | Action |
|---|---|
| **Windows** | Double-click `start-tunnels.bat` |
| **macOS** | Double-click `start-tunnels.command` |
| **Linux** | Run `./start-tunnels.sh` in terminal |

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
