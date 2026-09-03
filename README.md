# Tunnel Management Scripts

## ดาวน์โหลด Desktop App (Windows / macOS)

โหลดตัวติดตั้งล่าสุดจาก [GitHub Releases](https://github.com/takkub/tunnel/releases/latest):

| ไฟล์ | ใช้กับเครื่อง |
|---|---|
| `tunnel-<version>-win-x64.exe` | Windows |
| `tunnel-<version>-mac-x64.dmg` | Mac **Intel** |
| `tunnel-<version>-mac-arm64.dmg` | Mac **Apple Silicon** (M1/M2/M3/M4) |

ไม่แน่ใจว่าเครื่องเป็นแบบไหน เช็คได้จาก  › **About This Mac** → ดูช่อง Chip/Processor

### ติดตั้งบน macOS

1. เลือกไฟล์ให้ตรงเครื่อง (ตารางด้านบน)
2. เปิด `.dmg` แล้วลาก **Tunnel Manager.app** ไปที่ `Applications`
3. **ก่อนเปิดครั้งแรก** เปิด Terminal แล้วรันคำสั่งนี้ก่อน:
   ```bash
   xattr -cr "/Applications/Tunnel Manager.app"
   ```
4. ถ้าเปิดแล้วยังถูกบล็อกอยู่ ให้ไปที่ **System Settings → Privacy & Security → เลื่อนลงหา Tunnel Manager → Open Anyway** (macOS 15 ขึ้นไปตัดทางลัด right-click → Open ออกแล้ว ต้องเข้าหน้านี้เท่านั้น)
5. **Apple Silicon (M1/M2/M3/M4) เท่านั้น** — ถ้าทำครบข้อ 3-4 แล้วยังขึ้น `damaged` อยู่ (พบใน release **≤ v1.1.14**) ให้ ad-hoc sign เองอีกชั้นด้วย:
   ```bash
   codesign --force --deep --sign - "/Applications/Tunnel Manager.app"
   ```
   สาเหตุ: build เก่าไม่มี signature เลย (ไม่ใช่แค่ quarantine) — arm64 macOS ปฏิเสธรัน binary ที่ไม่มี signature แม้จะ `xattr -cr` แล้วก็ตาม คำสั่งข้างบนคือ sign เองแบบ ad-hoc (ไม่ต้องมี cert) ให้ผ่านเงื่อนไขนี้ ตั้งแต่ v1.1.15 เป็นต้นไป build เองก็ ad-hoc sign ให้แล้วในขั้นตอน release เหลือแค่ข้อ 3 (`xattr -cr`) เท่านั้น

> ทำไมขึ้น `"Tunnel Manager" is damaged and can't be opened. You should move it to the Trash.` — เพราะแอปยังไม่ได้ sign ด้วย Apple Developer ID cert จริง/notarize (ดูสถานะที่ [`docs/RELEASE.md`](docs/RELEASE.md#️-todo-code-signing--notarization)) ไม่ใช่ไฟล์เสียจริง ไฟล์ที่โหลดผ่านเบราว์เซอร์จะติด quarantine attribute ที่ทำให้ Gatekeeper ปฏิเสธไฟล์ที่ไม่มีลายเซ็นก่อนเสมอ คำสั่ง `xattr -cr` ข้างบนคือการล้าง attribute นั้นออก

Windows จะเจอ **SmartScreen** เตือนลักษณะเดียวกัน (unsigned `.exe`) → กด **More info → Run anyway**

## ติดตั้งผ่าน npm

```bash
npm install -g tunnel-takkub
tunnel setup          # opens the setup wizard in your browser (installs cloudflared, sets up your token/zone/password)
tunnel web            # start the web admin dashboard on http://localhost:8888
tunnel create my-app my-app.example.com 3000
tunnel start my-app
tunnel list
```

Data (tunnels, credentials, settings) is stored under `~/.tunnel` by default — override with the `TUNNEL_DATA_DIR` env var. Run `tunnel --help` for the full command list. See [`docs/ops/npm-cli-package.md`](docs/ops/npm-cli-package.md) for how this package is built/published.

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

## Per-Tunnel Password Gate

Any tunnel can be put behind a password login page without changing the app itself.
Enabling it swaps that tunnel's ingress `service:` to a small nginx + login-service pair
(`nginx/auth-gate/`, containers `tunnel-auth-gate` on :8890 and `tunnel-auth-gate-server`
on :8891) which shows a login page, sets a signed session cookie on success, and proxies
through to the real app afterward. Toggle it from the tunnel's card in the web UI, or via
API: `GET/PUT /api/tunnels/<name>/auth-gate` (`PUT` body: `{ enabled, password? }`).

Passwords are hashed (scrypt) — never stored or logged in plaintext.

## Available Tunnels

Tunnel configs live in `tunnels/<name>/config.yml`. Docker compose files are at `docker-compose-cloudflare-<name>.yml`.

Notes
- Sensitive files (certs, credentials, `.pid`) are ignored by `.gitignore`.
- `cloudflared.exe` is bundled for Windows; macOS/Linux users install via `brew install cloudflared` or their package manager.
