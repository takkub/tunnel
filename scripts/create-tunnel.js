const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { generateLaunchers } = require('./runtime');

const [tunnelName, hostname, port] = process.argv.slice(2);

if (!tunnelName || !hostname || !port) {
  process.stderr.write('Usage: node create-tunnel.js <tunnelName> <hostname> <port>\n');
  process.exit(1);
}

if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(tunnelName)) {
  process.stderr.write('Invalid tunnel name\n');
  process.exit(1);
}

const projectRoot = path.join(__dirname, '..');
const cloudflaredHome = path.join(process.env.USERPROFILE || process.env.HOME || '', '.cloudflared');

// use cloudflared.exe in project root if available — returns unquoted path for execFileSync
function getCloudflaredBin() {
  const localExe = path.join(projectRoot, 'cloudflared.exe');
  if (fs.existsSync(localExe)) return localExe;
  try { execFileSync('cloudflared', ['--version'], { stdio: 'pipe' }); return 'cloudflared'; } catch {}
  return null;
}

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
  const bin = getCloudflaredBin();
  if (!bin) throw new Error('cloudflared not found');

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

  const configDir = path.join(projectRoot, 'tunnels', tunnelName);
  fs.mkdirSync(configDir, { recursive: true });

  // cert.pem from ~/.cloudflared
  const certSrc = path.join(cloudflaredHome, 'cert.pem');
  if (fs.existsSync(certSrc)) fs.copyFileSync(certSrc, path.join(configDir, 'cert.pem'));

  // credentials JSON — cloudflared.exe writes to ~/.cloudflared/<uuid>.json
  const credFile = `${tunnelId}.json`;
  const credSrc = path.join(cloudflaredHome, credFile);
  if (fs.existsSync(credSrc)) {
    fs.copyFileSync(credSrc, path.join(configDir, credFile));
  } else {
    process.stderr.write(`Warning: credentials not found at ${credSrc}\n`);
  }

  // config.yml
  fs.writeFileSync(path.join(configDir, 'config.yml'), `tunnel: ${tunnelId}
credentials-file: /etc/cloudflared/${tunnelId}.json

protocol: auto

ingress:
  - hostname: ${hostname}
    service: http://host.docker.internal:${port}
  - service: http_status:404
`);

  // docker-compose inside tunnel folder (volume . = this folder)
  fs.writeFileSync(path.join(configDir, 'docker-compose.yml'), `version: '3.8'
services:
  cloudflared-${tunnelName}:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared-tunnel-${tunnelName}
    restart: unless-stopped
    command: tunnel --config /etc/cloudflared/config.yml run
    volumes:
      - .:/etc/cloudflared
    extra_hosts:
      - "host.docker.internal:host-gateway"
`);

  generateLaunchers(tunnelName);

  process.stdout.write(`CREATED:${tunnelId}\n`);
} catch (err) {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
}
