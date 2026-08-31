const { execFileSync } = require('child_process');
const { findCloudflared } = require('./cloudflared-bin');
const { TUNNELS_DIR } = require('./runtime');
const { routeDns } = require('./dns-route-core');

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

routeDns(tunnelName, hostname, {
  tunnelsDir: TUNNELS_DIR,
  runCloudflaredRouteDns: bin
    ? () => execFileSync(bin, ['tunnel', 'route', 'dns', tunnelName, hostname], { encoding: 'utf8', stdio: 'pipe' })
    : null
}).then(result => {
  if (result.ok) {
    process.stdout.write(result.message + '\n');
    process.exit(0);
  }
  process.stderr.write(result.message + '\n');
  process.exit(1);
}).catch(err => {
  process.stderr.write(((err && err.message) || 'unknown error') + '\n');
  process.exit(1);
});
