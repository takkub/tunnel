# ☁️ Cloudflare Tunnel Manager

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Supported-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

> **Interactive CLI tool** to create, manage, and delete [Cloudflare Tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) — with Docker support and a beautiful terminal UI.

---

## ✨ Features

- 🚀 **Interactive Menu** — Arrow-key driven TUI for all operations
- ⚙️ **Setup Wizard** — Create tunnels with auto-generated configs
- 🐳 **Docker First** — Auto-generates `docker-compose` files per tunnel
- 🔗 **DNS Management** — Auto-create/delete DNS routes & CNAME records
- 📊 **Status Dashboard** — View all tunnels and Docker containers at a glance
- 🗑️ **Smart Cleanup** — Delete tunnels, DNS routes, CNAMEs, and local files in one go
- 🎨 **Beautiful UI** — Color-coded output with progress indicators

---

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (recommended)
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) (optional — Docker can substitute)

---

## 🚀 Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/takkub/tunnel.git
cd tunnel

# 2. Install dependencies
npm install

# 3. Check system requirements
npm run check

# 4. Login to Cloudflare
npm run login

# 5. Create your first tunnel
npm run setup

# 6. Or use the interactive menu
npm run menu
```

---

## 📖 Commands

| Command | Description |
|---|---|
| `npm run menu` | Interactive menu (recommended) |
| `npm run check` | Check system requirements |
| `npm run login` | Login to Cloudflare |
| `npm run setup` | Create & configure a new tunnel |
| `npm run status` | View tunnel & Docker status |
| `npm start` | Start all tunnels (docker-compose up) |
| `npm stop` | Stop all tunnels (docker-compose down) |
| `npm run delete` | Delete a tunnel (interactive) |
| `npm run delete:force` | Force delete a tunnel |
| `npm run delete:quick` | Quick delete (no prompts) |
| `npm run cleanup` | Full cleanup (tunnel + DNS + files) |
| `npm run check:dns` | Inspect DNS records |
| `npm run check:cnames` | List all tunnel CNAME records |
| `npm run cleanup:cnames` | Delete ALL tunnel CNAME records |
| `npm run fix:dns` | Fix DNS route for a tunnel |

---

## ⚙️ Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your Cloudflare credentials:

```env
CLOUDFLARE_API_TOKEN=your-api-token-here
ZONE_ID=your-zone-id-here
```

> **Note:** The API token needs `Zone.DNS.Edit` permission. Create one at [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens).

---

## 📁 Project Structure

```
tunnel/
├── scripts/
│   ├── menu.js              # Interactive TUI menu
│   ├── ui-helper.js         # Console styling utilities
│   ├── cloudflare-api.js    # Cloudflare API wrapper
│   ├── setup-tunnel.js      # Tunnel creation wizard
│   ├── delete-tunnel.js     # Interactive tunnel deletion
│   ├── force-delete-tunnel.js
│   ├── quick-delete-tunnel.js
│   ├── cleanup-tunnel.js    # Full cleanup (tunnel + DNS + files)
│   ├── cleanup-all-cnames.js
│   ├── check-requirements.js
│   ├── check-dns.js
│   ├── fix-app-dns.js
│   ├── list-cnames.js
│   ├── login.js
│   └── status.js
├── tunnels/                  # Auto-generated tunnel configs (gitignored)
├── .env.example              # Environment template
├── package.json
└── README.md
```

---

## 🔒 Security

- `.env` files with API tokens are **never** committed (gitignored)
- Tunnel credentials (`*.json`, `cert.pem`) inside `tunnels/` are **gitignored**
- Docker compose files generated per tunnel are **gitignored**

---

## 📄 License

[MIT](LICENSE) © takkub
