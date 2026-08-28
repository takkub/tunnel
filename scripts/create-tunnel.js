const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { TUNNELS_DIR, getEffectiveMode, generateLaunchers } = require('./runtime');
const { findCloudflared } = require('./cloudflared-bin');

const [tunnelName, hostname, port] = process.argv.slice(2);

if (!tunnelName || !hostname || !port) {
  process.stderr.write('Usage: node create-tunnel.js <tunnelName> <hostname> <port>\n');
  process.exit(1);
}

if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(tunnelName)) {
  process.stderr.write('Invalid tunnel name\n');
  process.exit(1);
}

const cloudflaredHome = path.join(os.homedir(), '.cloudflared');
const mode = getEffectiveMode(); // 'docker' | 'native'

function parseTunnelId(output) {
  for (const line of output.split('\n')) {
    const m = line.match(/Created tunnel .+ with id ([a-f0-9-]{36})/i);
    if (m) return m[1];
    const m2 = line.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    if (m2) return m2[1];
  }
  return null;
}

try {
  const bin = findCloudflared();
  if (!bin) throw new Error('cloudflared not found. Run "npm run login" first to download it.');

  let out;
  try {
    out = execFileSync(bin, ['tunnel', 'create', tunnelName], {
      stdio: 'pipe', encoding: 'utf8', env: { ...process.env, CI: '1' }
    });
  } catch (e) {
    out = ((e.stdout || '') + (e.stderr || ''));
    if (!out) throw e;
  }

  const tunnelId = parseTunnelId(out);
  if (!tunnelId) {
    process.stderr.write(`Could not extract tunnel ID from output:\n${out}\n`);
    process.exit(1);
  }

  const configDir = path.join(TUNNELS_DIR, tunnelName);
  fs.mkdirSync(configDir, { recursive: true });

  // cert.pem from ~/.cloudflared
  const certSrc = path.join(cloudflaredHome, 'cert.pem');
  if (fs.existsSync(certSrc)) {
    const certDest = path.join(configDir, 'cert.pem');
    fs.copyFileSync(certSrc, certDest);
    try { fs.chmodSync(certDest, 0o644); } catch {}
  }

  // credentials JSON — cloudflared writes to ~/.cloudflared/<uuid>.json
  const credFile = `${tunnelId}.json`;
  const credSrc = path.join(cloudflaredHome, credFile);
  let credDest = null;
  if (fs.existsSync(credSrc)) {
    credDest = path.join(configDir, credFile);
    fs.copyFileSync(credSrc, credDest);
    try { fs.chmodSync(credDest, 0o644); } catch {}
  } else {
    process.stderr.write(`Warning: credentials not found at ${credSrc}\n`);
  }

  // config.yml — Docker mode routes to the app via the host gateway and
  // reads credentials from the bind-mounted /etc/cloudflared path; native
  // mode talks to localhost directly and points at the real credentials file.
  const credentialsPathConfig = mode === 'docker'
    ? `/etc/cloudflared/${tunnelId}.json`
    : (credDest || path.join(configDir, credFile)).replace(/\\/g, '/');
  const serviceUrl = mode === 'docker'
    ? `http://host.docker.internal:${port}`
    : `http://localhost:${port}`;

  const configDest = path.join(configDir, 'config.yml');
  fs.writeFileSync(configDest, `tunnel: ${tunnelId}
credentials-file: ${credentialsPathConfig}

protocol: auto

ingress:
  - hostname: ${hostname}
    service: ${serviceUrl}
  - service: http_status:404
`);
  try { fs.chmodSync(configDest, 0o644); } catch {}

  if (mode === 'docker') {
    // docker-compose inside tunnel folder (volume . = this folder)
    fs.writeFileSync(path.join(configDir, 'docker-compose.yml'), `version: '3.8'
services:
  cloudflared-${tunnelName}:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared-tunnel-${tunnelName}
    restart: unless-stopped
    user: "0:0"
    command: tunnel --config /etc/cloudflared/config.yml run
    volumes:
      - .:/etc/cloudflared
    extra_hosts:
      - "host.docker.internal:host-gateway"
`);
  }

  generateLaunchers(tunnelName);

  process.stdout.write(`CREATED:${tunnelId}\n`);
} catch (err) {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
}
