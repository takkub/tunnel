const { execSync } = require('child_process');
const ui = require('./ui-helper');

// ตรวจสอบว่ามี argument
const tunnelName = process.argv[2];
if (!tunnelName) {
  ui.header('Quick Delete', 'Fast tunnel deletion');
  ui.section('Usage');
  ui.command('npm run quick-delete <tunnel-name>');
  console.log(`  ${ui.c.dim}Example:${ui.c.reset} ${ui.c.cyan}npm run quick-delete tak${ui.c.reset}`);
  console.log('');
  process.exit(1);
}

ui.header('Quick Delete', `Removing: ${tunnelName}`);

try {
  // ตรวจสอบว่ามี cloudflared
  execSync('cloudflared --version', { stdio: 'pipe' });
} catch (error) {
  ui.fail('cloudflared is not installed!');
  ui.command('winget install Cloudflare.cloudflared');
  console.log('');
  process.exit(1);
}

// หา tunnel ID
ui.step(1, 3, `${ui.icons.dns} Finding tunnel ID...`);
let tunnelId = null;

try {
  const list = execSync('cloudflared tunnel list', { encoding: 'utf8' });
  const lines = list.split('\n');

  for (const line of lines) {
    const match = line.match(/([a-f0-9-]{36})\s+(\S+)/i);
    if (match && match[2].includes(tunnelName)) {
      tunnelId = match[1];
      ui.subStep(`Found: ${ui.c.cyan}${match[2]}${ui.c.reset} (${tunnelId})`, 'success');
      break;
    }
  }

  if (!tunnelId) {
    ui.fail(`Tunnel "${tunnelName}" not found in list`);
    console.log('');
    ui.section('Available Tunnels');
    console.log(`${ui.c.dim}${list}${ui.c.reset}`);
    process.exit(1);
  }
} catch (error) {
  ui.fail('Failed to list tunnels');
  process.exit(1);
}

// ลบ tunnel
ui.step(2, 3, `${ui.icons.trash} Deleting tunnel from Cloudflare...`);
try {
  execSync(`cloudflared tunnel delete -f ${tunnelId}`, { stdio: 'inherit' });
  ui.subStep('Tunnel deleted from Cloudflare', 'success');
} catch (error) {
  ui.fail('Failed to delete tunnel');
  console.log('');
  ui.section(`${ui.icons.tip} Try Manually`);
  ui.command(`cloudflared tunnel delete -f ${tunnelId}`);
  console.log(`  ${ui.c.dim}Or delete from:${ui.c.reset} ${ui.c.cyan}https://dash.cloudflare.com/${ui.c.reset}`);
  console.log('');
  process.exit(1);
}

// ตรวจสอบว่าลบสำเร็จ
ui.step(3, 3, `${ui.icons.check} Verifying...`);
try {
  const list = execSync('cloudflared tunnel list', { encoding: 'utf8' });
  if (list.includes(tunnelId)) {
    ui.subStep('Tunnel still exists in list', 'error');
  } else {
    ui.subStep('Tunnel removed successfully', 'success');
    ui.complete('Done!');
  }
} catch (error) {
  ui.subStep('Verification skipped', 'skip');
  ui.complete('Done!');
}
