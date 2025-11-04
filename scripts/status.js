const { execSync } = require('child_process');
const path = require('path');

// ตรวจสอบว่ามี cloudflared ติดตั้งหรือไม่ ถ้าไม่ใช้ Docker แทน
function getCloudflaredCommand() {
  try {
    execSync('cloudflared --version', { stdio: 'pipe' });
    return 'cloudflared';
  } catch (error) {
    // ใช้ Docker แทน
    const projectRoot = path.join(__dirname, '..');
    return `docker run --rm -v "${projectRoot}/tunnels:/etc/cloudflared" cloudflare/cloudflared:latest`;
  }
}

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
  const cmd = getCloudflaredCommand();
  execSync(`${cmd} tunnel list`, { stdio: 'inherit' });
} catch (error) {
  console.log('Could not list tunnels. Make sure Docker is running or cloudflared is installed.');
}

console.log('');
