const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const tunnelName = process.argv[2];
const hostname = process.argv[3];

if (!tunnelName || !hostname) {
  console.error('Usage: node route-dns.js <tunnelName> <hostname>');
  process.exit(1);
}

if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(tunnelName)) {
  console.error('Invalid tunnel name');
  process.exit(1);
}

function getCloudflaredBin() {
  const localExe = path.join(__dirname, '..', 'cloudflared.exe');
  if (fs.existsSync(localExe)) return localExe;
  try { execFileSync('cloudflared', ['--version'], { stdio: 'pipe' }); return 'cloudflared'; } catch {}
  console.error('cloudflared not found');
  process.exit(1);
}

try {
  execFileSync(getCloudflaredBin(), ['tunnel', 'route', 'dns', tunnelName, hostname], { stdio: 'inherit' });
  process.exit(0);
} catch (err) {
  process.exit(1);
}
