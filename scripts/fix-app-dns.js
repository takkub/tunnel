try { require('dotenv').config(); } catch {}
const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ui = require('./ui-helper');

function getCloudflaredBin() {
  const localExe = path.join(__dirname, '..', 'cloudflared.exe');
  if (fs.existsSync(localExe)) return localExe;
  try { execFileSync('cloudflared', ['--version'], { stdio: 'pipe' }); return 'cloudflared'; } catch {}
  return 'cloudflared';
}
const BIN = getCloudflaredBin();

ui.header('DNS Fix', 'Fix DNS for your domain');

const tunnelId = process.argv[2] || process.env.TUNNEL_ID;
const domain = process.argv[3] || process.env.FIX_DNS_DOMAIN;
const oldTunnelId = process.argv[4] || process.env.OLD_TUNNEL_ID;

if (!tunnelId || !domain) {
  console.error('Usage: node fix-app-dns.js <tunnelId> <domain> [oldTunnelId]');
  console.error('Or set env: TUNNEL_ID, FIX_DNS_DOMAIN, OLD_TUNNEL_ID');
  process.exit(1);
}

ui.section(`${ui.icons.settings} Configuration`);
console.log(`  ${ui.c.dim}Tunnel ID:${ui.c.reset} ${ui.c.cyan}${tunnelId}${ui.c.reset}`);
console.log(`  ${ui.c.dim}Domain:${ui.c.reset} ${ui.c.yellow}${domain}${ui.c.reset}`);
console.log('');

// ลบ DNS route เก่า (ถ้ามี)
ui.step(1, 2, `${ui.icons.trash} Removing old DNS route...`);
try {
  if (!oldTunnelId) throw new Error('no oldTunnelId');
  execFileSync(BIN, ['tunnel', 'route', 'dns', 'delete', oldTunnelId, domain], { stdio: 'pipe' });
  ui.subStep('Removed old DNS route', 'success');
} catch (e) {
  ui.subStep('No old DNS route found (or already removed)', 'skip');
}

// ลบจาก Cloudflare Dashboard ต้องทำด้วยตนเอง
console.log('');
ui.box(`${ui.icons.warning} Manual Step Required`, [
  'You may need to delete the CNAME record manually:',
  '',
  `1. Go to: ${ui.c.cyan}https://dash.cloudflare.com/${ui.c.reset}`,
  `2. Select your domain`,
  `3. Navigate to: DNS → Records`,
  `4. Find and delete the old record`,
]);
console.log('');

// สร้าง DNS route ใหม่
ui.step(2, 2, `${ui.icons.dns} Creating new DNS route...`);
try {
  execFileSync(BIN, ['tunnel', 'route', 'dns', tunnelId, domain], { stdio: 'pipe' });
  console.log('');
  ui.complete('DNS route created successfully!');

  ui.summaryBox('New Route', [
    ['Domain', domain],
    ['Tunnel ID', tunnelId]
  ]);
} catch (e) {
  console.log('');
  ui.fail('Could not create DNS route automatically');
  console.log('');
  ui.tip('Please delete the old CNAME first, then run this command again:');
  ui.command(`cloudflared tunnel route dns ${tunnelId} ${domain}`);
  console.log('');
}
