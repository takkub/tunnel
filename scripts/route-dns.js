const { execFileSync } = require('child_process');
const { findCloudflared } = require('./cloudflared-bin');

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

const bin = findCloudflared();
if (!bin) {
  console.error('cloudflared not found. Run "npm run login" to download it.');
  process.exit(1);
}

try {
  const out = execFileSync(bin, ['tunnel', 'route', 'dns', tunnelName, hostname], { encoding: 'utf8', stdio: 'pipe' });
  process.stdout.write(out || 'DNS route updated\n');
  process.exit(0);
} catch (err) {
  process.stderr.write((err.stdout || '') + (err.stderr || err.message || 'unknown error') + '\n');
  process.exit(1);
}
