const { execSync } = require('child_process');

console.log('╔════════════════════════════════════════╗');
console.log('║   Cloudflare Tunnels - Status          ║');
console.log('╚════════════════════════════════════════╝\n');

console.log('Running Docker Containers:\n');
try {
  execSync('docker ps --filter name=cloudflared --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"', { stdio: 'inherit' });
} catch (error) {
  console.log('No containers running or Docker is not available.');
}

console.log('\n' + '='.repeat(50));
console.log('\nAll Cloudflare Tunnels:\n');
try {
  execSync('cloudflared tunnel list', { stdio: 'inherit' });
} catch (error) {
  console.log('Could not list tunnels. Make sure cloudflared is installed.');
}

console.log('');
