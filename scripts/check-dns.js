const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ui = require('./ui-helper');
const { TUNNELS_DIR } = require('./runtime');
const { findCloudflared } = require('./cloudflared-bin');

function getCloudflaredBin() {
  return findCloudflared() || 'cloudflared';
}

ui.header('DNS Configuration', 'Check tunnel DNS settings');

const tunnelName = process.argv[2];

// When no arg: scan tunnels/ dir and print CNAME for each
if (!tunnelName) {
  const tunnelsDir = TUNNELS_DIR;
  const entries = fs.existsSync(tunnelsDir)
    ? fs.readdirSync(tunnelsDir).filter(d => fs.existsSync(path.join(tunnelsDir, d, 'config.yml')))
    : [];
  if (entries.length === 0) {
    console.log('No tunnels found');
    process.exit(0);
  }
  ui.section(`${ui.icons.list} Tunnels (${entries.length})`);
  console.log('');
  for (const dir of entries) {
    const cfg = fs.readFileSync(path.join(tunnelsDir, dir, 'config.yml'), 'utf8');
    const idMatch = cfg.match(/^tunnel:\s*([a-f0-9-]{36})/m);
    const hostMatch = cfg.match(/hostname:\s*(\S+)/);
    const id = idMatch ? idMatch[1] : '?';
    const host = hostMatch ? hostMatch[1] : '?';
    console.log(`  ${ui.c.cyan}${dir}${ui.c.reset}: ${host} -> ${ui.c.green}${id}.cfargotunnel.com${ui.c.reset}`);
  }
  console.log('');
  process.exit(0);
}

try {
  // ดู tunnel info
  ui.section(`${ui.icons.dns} Checking tunnel: ${ui.c.cyan}${tunnelName}${ui.c.reset}`);
  console.log('');

  const list = execFileSync(getCloudflaredBin(), ['tunnel', 'list'], { encoding: 'utf8' });
  const lines = list.split('\n');

  ui.section(`${ui.icons.list} Available Tunnels`);
  console.log('');

  // Parse and display tunnels
  const isHeader = lines[0] && (lines[0].includes('ID') || lines[0].includes('NAME'));
  if (isHeader && lines.length > 1) {
    ui.tableHeader(['ID', 'NAME', 'CREATED'], [38, 20, 25]);
    lines.slice(1).forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const [id, name, created] = parts;
        const highlight = name && name.includes(tunnelName) ? ui.c.brightCyan : ui.c.dim;
        console.log(`  ${ui.c.dim}${(id || '').padEnd(38)}${ui.c.reset}${highlight}${(name || '').padEnd(20)}${ui.c.reset}${ui.c.dim}${created || ''}${ui.c.reset}`);
      }
    });
  }

  // หา tunnel ID
  let tunnelId = null;
  for (const line of lines) {
    if (line.includes(tunnelName)) {
      const match = line.match(/([a-f0-9-]{36})/);
      if (match) {
        tunnelId = match[1];
        break;
      }
    }
  }

  if (tunnelId) {
    console.log('');
    ui.summaryBox('Tunnel Found', [
      ['Name', tunnelName],
      ['ID', tunnelId],
      ['CNAME', `${tunnelId}.cfargotunnel.com`]
    ]);

    console.log('');
    ui.section(`${ui.icons.tip} Instructions`);
    console.log('');
    console.log(`  ${ui.c.dim}1. Go to:${ui.c.reset} ${ui.c.cyan}https://dash.cloudflare.com/${ui.c.reset}`);
    console.log(`  ${ui.c.dim}2. Select your domain${ui.c.reset}`);
    console.log(`  ${ui.c.dim}3. Navigate to:${ui.c.reset} ${ui.c.cyan}DNS → Records${ui.c.reset}`);
    console.log(`  ${ui.c.dim}4. Look for record named:${ui.c.reset} ${ui.c.yellow}${tunnelName}${ui.c.reset}`);
    console.log(`  ${ui.c.dim}5. Target should be:${ui.c.reset}`);
    console.log(`     ${ui.c.green}${tunnelId}.cfargotunnel.com${ui.c.reset}`);
    console.log('');
  } else {
    ui.fail(`Tunnel not found: ${tunnelName}`);
    console.log('');
    ui.section('Available Tunnels');
    console.log('');
    lines.forEach(line => {
      const match = line.match(/\s+(\S+-tunnel)\s+/);
      if (match) {
        console.log(`  ${ui.c.cyan}•${ui.c.reset} ${match[1]}`);
      }
    });
    console.log('');
  }

} catch (error) {
  ui.fail(`Error: ${error.message}`);
  console.log('');
  ui.section('Troubleshooting');
  console.log(`  ${ui.c.dim}• Make sure cloudflared is installed${ui.c.reset}`);
  console.log(`  ${ui.c.dim}• Run ${ui.c.cyan}npm run login${ui.c.reset}${ui.c.dim} first${ui.c.reset}`);
  console.log('');
}
