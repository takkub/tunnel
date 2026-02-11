const { execSync } = require('child_process');
const ui = require('./ui-helper');

ui.header('DNS Configuration', 'Check tunnel DNS settings');

const tunnelName = process.argv[2] || 'app';

try {
  // ดู tunnel info
  ui.section(`${ui.icons.dns} Checking tunnel: ${ui.c.cyan}${tunnelName}-tunnel${ui.c.reset}`);
  console.log('');

  const list = execSync('cloudflared tunnel list', { encoding: 'utf8' });
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
      ['Name', `${tunnelName}-tunnel`],
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
    ui.fail(`Tunnel not found: ${tunnelName}-tunnel`);
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
