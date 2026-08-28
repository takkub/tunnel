const { execSync } = require('child_process');
const ui = require('./ui-helper');
const { TUNNELS_DIR } = require('./runtime');
const { findCloudflared } = require('./cloudflared-bin');

// ตรวจสอบว่ามี cloudflared ติดตั้งหรือไม่ ถ้าไม่ใช้ Docker แทน
function getCloudflaredCommand() {
  const bin = findCloudflared();
  if (bin) return `"${bin}"`;
  // ใช้ Docker แทน
  return `docker run --rm -v "${TUNNELS_DIR.replace(/\\/g, '/')}:/etc/cloudflared" cloudflare/cloudflared:latest`;
}

ui.header('Cloudflare Tunnels', 'Status Dashboard');

// Docker Containers
ui.section(`${ui.icons.docker} Docker Containers`);
console.log('');
try {
  const output = execSync('docker ps --filter name=cloudflared --format "{{.Names}}\t{{.Status}}\t{{.Ports}}"', {
    encoding: 'utf8',
    stdio: 'pipe'
  });

  if (output.trim()) {
    const containers = output.trim().split('\n');
    ui.tableHeader(['CONTAINER', 'STATUS', 'PORTS'], [25, 20, 30]);

    containers.forEach(line => {
      const [name, status, ports] = line.split('\t');
      const statusColor = status && status.includes('Up') ? ui.c.green : ui.c.red;
      console.log(`  ${ui.c.cyan}${(name || '-').padEnd(25)}${ui.c.reset} ${statusColor}${(status || '-').padEnd(20)}${ui.c.reset} ${ui.c.dim}${ports || '-'}${ui.c.reset}`);
    });
  } else {
    console.log(`  ${ui.c.dim}No cloudflared containers running${ui.c.reset}`);
  }
} catch (error) {
  ui.warning('Docker is not available or not running.');
}

console.log('');
ui.divider();

// All Tunnels
ui.section(`${ui.icons.cloud} Cloudflare Tunnels`);
console.log('');
try {
  const cmd = getCloudflaredCommand();
  const output = execSync(`${cmd} tunnel list`, { encoding: 'utf8', stdio: 'pipe' });

  if (output.trim()) {
    const lines = output.trim().split('\n');

    // Parse header
    if (lines.length > 0) {
      // First line is usually header
      const isHeader = lines[0].includes('ID') || lines[0].includes('NAME');

      if (isHeader) {
        ui.tableHeader(['ID', 'NAME', 'CREATED', 'CONNECTIONS'], [38, 20, 25, 12]);
        lines.slice(1).forEach(line => {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 4) {
            const [id, name, created, conns] = parts;
            const connColor = parseInt(conns) > 0 ? ui.c.green : ui.c.dim;
            console.log(`  ${ui.c.dim}${id.padEnd(38)}${ui.c.reset}${ui.c.cyan}${name.padEnd(20)}${ui.c.reset}${ui.c.dim}${created.padEnd(25)}${ui.c.reset}${connColor}${conns}${ui.c.reset}`);
          }
        });
      } else {
        // Just print raw output with some formatting
        lines.forEach(line => {
          if (line.trim()) {
            console.log(`  ${line}`);
          }
        });
      }
    }
  } else {
    console.log(`  ${ui.c.dim}No tunnels found${ui.c.reset}`);
  }
} catch (error) {
  ui.warning('Could not list tunnels.');
  ui.tip('Make sure Docker is running or cloudflared is installed.');
}

console.log('');
ui.divider();

// Quick Commands
ui.section(`${ui.icons.tip} Quick Commands`);
console.log('');
console.log(`  ${ui.c.dim}Create tunnel:${ui.c.reset}  ${ui.c.cyan}npm run setup${ui.c.reset}`);
console.log(`  ${ui.c.dim}Delete tunnel:${ui.c.reset}  ${ui.c.cyan}npm run delete${ui.c.reset}`);
console.log(`  ${ui.c.dim}Cleanup all:${ui.c.reset}    ${ui.c.cyan}npm run cleanup${ui.c.reset}`);
console.log('');
