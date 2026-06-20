'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const CONFIG_PATH = path.join(ROOT, 'nginx-sites.config.json')
const NGINX_DIR = path.join(ROOT, 'nginx')
const CONFD_DIR = path.join(NGINX_DIR, 'conf.d')

function loadSites() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    return Array.isArray(raw.sites) ? raw.sites : []
  } catch {
    return []
  }
}

function siteConf(serverName, upstream) {
  return `server {
    listen 80;
    server_name ${serverName};

    location / {
        proxy_pass http://${upstream};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
`
}

const DOCKER_COMPOSE = `services:
  nginx-reverse-proxy:
    image: nginx:alpine
    container_name: nginx-reverse-proxy
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./conf.d:/etc/nginx/conf.d:ro
    extra_hosts:
      - "host.docker.internal:host-gateway"
`

function generateNginxBundle() {
  const sites = loadSites()

  fs.mkdirSync(CONFD_DIR, { recursive: true })

  // write docker-compose.yml
  const composePath = path.join(NGINX_DIR, 'docker-compose.yml')
  fs.writeFileSync(composePath, DOCKER_COMPOSE)

  // sync .conf files: write current, delete stale
  const activeNames = new Set(sites.map(s => s.serverName))
  const existing = fs.readdirSync(CONFD_DIR).filter(f => f.endsWith('.conf'))
  for (const f of existing) {
    const name = f.replace(/\.conf$/, '')
    if (!activeNames.has(name)) {
      fs.unlinkSync(path.join(CONFD_DIR, f))
    }
  }

  const files = ['docker-compose.yml']
  for (const { serverName, upstream } of sites) {
    const confFile = path.join(CONFD_DIR, `${serverName}.conf`)
    fs.writeFileSync(confFile, siteConf(serverName, upstream))
    files.push(`conf.d/${serverName}.conf`)
  }

  return { nginxDir: NGINX_DIR, files }
}

module.exports = { generateNginxBundle }

if (require.main === module) {
  try {
    const result = generateNginxBundle()
    process.stdout.write(JSON.stringify({ ok: true, path: result.nginxDir, files: result.files }) + '\n')
  } catch (e) {
    process.stderr.write(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
}
