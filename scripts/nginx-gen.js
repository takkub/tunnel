'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const CONFIG_PATH = path.join(ROOT, 'nginx-sites.config.json')
const NGINX_DIR = path.join(ROOT, 'nginx')
const CONFD_DIR = path.join(NGINX_DIR, 'conf.d')

const CONNECTION_UPGRADE_MAP = `map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
`

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    const exportMode = raw.exportMode || 'standalone'
    const sites = Array.isArray(raw.sites) ? raw.sites : []
    // backward-compat: old { serverName, upstream } → locations:[{path:'/', upstream}]
    const migratedSites = sites.map(s => {
      if (!Array.isArray(s.locations) && s.upstream) {
        const { upstream, ...rest } = s
        return { ...rest, locations: [{ path: '/', upstream }] }
      }
      return s
    })
    return { exportMode, sites: migratedSites }
  } catch {
    return { exportMode: 'standalone', sites: [] }
  }
}

function locationBlock(loc, indent) {
  const i = indent || '    '
  const ii = i + '    '
  const lines = [`${i}location ${loc.path} {`]
  if (loc.rateLimitAuth) lines.push(`${ii}limit_req zone=auth_limit burst=10 nodelay;`)
  lines.push(`${ii}proxy_pass http://${loc.upstream};`)
  lines.push(`${ii}proxy_set_header Host $host;`)
  lines.push(`${ii}proxy_set_header X-Real-IP $remote_addr;`)
  lines.push(`${ii}proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`)
  lines.push(`${ii}proxy_set_header X-Forwarded-Proto $scheme;`)
  if (loc.websocket) {
    lines.push(`${ii}proxy_http_version 1.1;`)
    lines.push(`${ii}proxy_set_header Upgrade $http_upgrade;`)
    lines.push(`${ii}proxy_set_header Connection $connection_upgrade;`)
  }
  lines.push(`${i}}`)
  return lines.join('\n')
}

function serverBlock(site) {
  const parts = ['server {', '    listen 80;', `    server_name ${site.serverName};`]
  if (site.clientMaxBodySize) {
    parts.push('', `    client_max_body_size ${site.clientMaxBodySize};`)
  }
  for (const loc of site.locations) {
    parts.push('', locationBlock(loc, '    '))
  }
  parts.push('}')
  return parts.join('\n')
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

function generateStandalone(sites) {
  fs.mkdirSync(CONFD_DIR, { recursive: true })
  fs.writeFileSync(path.join(NGINX_DIR, 'docker-compose.yml'), DOCKER_COMPOSE)

  // delete stale .conf files
  const activeNames = new Set(sites.map(s => s.serverName))
  for (const f of fs.readdirSync(CONFD_DIR).filter(f => f.endsWith('.conf'))) {
    if (!activeNames.has(f.replace(/\.conf$/, ''))) fs.unlinkSync(path.join(CONFD_DIR, f))
  }

  const files = ['docker-compose.yml']
  for (const site of sites) {
    const hasRateLimit = site.locations.some(l => l.rateLimitAuth)
    const hasWebsocket = site.locations.some(l => l.websocket)
    const sections = []
    if (hasWebsocket) sections.push(CONNECTION_UPGRADE_MAP)
    if (hasRateLimit) sections.push('limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/s;\n')
    sections.push(serverBlock(site))
    fs.writeFileSync(path.join(CONFD_DIR, `${site.serverName}.conf`), sections.join('\n') + '\n')
    files.push(`conf.d/${site.serverName}.conf`)
  }

  return { ok: true, mode: 'standalone', path: NGINX_DIR, files }
}

function generateEdgeSnippet(sites) {
  fs.mkdirSync(NGINX_DIR, { recursive: true })

  const hasRateLimit = sites.some(s => s.locations.some(l => l.rateLimitAuth))
  const sections = [
    '# Generated nginx edge snippet',
    '# Append this file\'s content into the http {} block of your edge nginx.conf',
    '# (before the default_server catch-all block)',
    '# After appending: nginx -t && nginx -s reload',
    '#',
    '# NOTE: $connection_upgrade map is ALREADY defined in the host nginx.conf http {} block —',
    '# do NOT redeclare it here (duplicate map = `nginx -t` error). Reuse the existing one.',
    '',
  ]
  if (hasRateLimit) sections.push('limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/s;\n')
  for (const site of sites) {
    sections.push(serverBlock(site))
    sections.push('')
  }

  const snippetPath = path.join(NGINX_DIR, 'edge-snippet.conf')
  fs.writeFileSync(snippetPath, sections.join('\n'))

  return { ok: true, mode: 'edge-snippet', path: snippetPath, files: ['edge-snippet.conf'] }
}

function generateNginxBundle() {
  const { exportMode, sites } = loadConfig()
  return exportMode === 'edge-snippet' ? generateEdgeSnippet(sites) : generateStandalone(sites)
}

module.exports = { generateNginxBundle }

if (require.main === module) {
  try {
    const result = generateNginxBundle()
    process.stdout.write(JSON.stringify(result) + '\n')
  } catch (e) {
    process.stderr.write(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
}
