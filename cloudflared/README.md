# Cloudflared Credentials

⚠️ **Important:** Credential files (`.json` and `.pem`) are NOT included in git for security reasons.

## What's included in git:
- ✅ `config.yml` - Tunnel configuration

## What's NOT included (gitignored):
- ❌ `*.json` - Tunnel credentials
- ❌ `cert.pem` - Cloudflare certificate
- ❌ Any `.pem` files

## To set up:
1. Run `npm run login` to get your certificate
2. Run `npm run setup` to create tunnels and copy credentials automatically

These files will be created locally but won't be committed to git.
# Dependencies
/node_modules
npm-debug.log*
yarn-debug.log*
yarn-error.log*
/.pnp
.pnp.js

# Build output
/dist
/build
/out-tsc
/tmp

# IDE
.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
.idea
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db
desktop.ini

# Cloudflare Credentials - IMPORTANT!
cloudflared/**/*.json
cloudflared/**/cert.pem
*.pem
*.json.backup

# Keep config files
!cloudflared/**/config.yml
!package.json
!tsconfig.json

# Docker
.docker

# Environment
.env
.env.local
.env.*.local

# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*

# Temporary files
*.tmp
*.temp
.cache

