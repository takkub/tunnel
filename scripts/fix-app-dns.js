const { execSync } = require('child_process');
const ui = require('./ui-helper');

// Parse arguments
const tunnelId = process.argv[2];
const domain = process.argv[3];

if (!tunnelId || !domain) {
  ui.header('DNS Fix', 'Fix DNS route for a tunnel');

  ui.section('Usage');
  ui.command('npm run fix:dns -- <tunnel-id> <domain>');
  console.log('');
  console.log(`  ${ui.c.dim}Example:${ui.c.reset}`);
  ui.command('npm run fix:dns -- abc12345-6789-... app.example.com');
  console.log('');

  ui.section(`${ui.icons.tip} How to find your Tunnel ID`);
  console.log(`  ${ui.c.dim}Run:${ui.c.reset} ${ui.c.cyan}npm run status${ui.c.reset}`);
  console.log(`  ${ui.c.dim}Or:${ui.c.reset}  ${ui.c.cyan}cloudflared tunnel list${ui.c.reset}`);
  console.log('');
  process.exit(1);
}

ui.header('DNS Fix', `Fixing DNS for ${domain}`);

ui.section(`${ui.icons.settings} Configuration`);
console.log(`  ${ui.c.dim}Tunnel ID:${ui.c.reset} ${ui.c.cyan}${tunnelId}${ui.c.reset}`);
console.log(`  ${ui.c.dim}Domain:${ui.c.reset} ${ui.c.yellow}${domain}${ui.c.reset}`);
console.log('');

// Remove old DNS route (if exists)
ui.step(1, 2, `${ui.icons.trash} Removing old DNS route...`);
try {
  execSync(`cloudflared tunnel route dns delete ${tunnelId} ${domain}`, { stdio: 'pipe' });
  ui.subStep('Removed old DNS route', 'success');
} catch (e) {
  ui.subStep('No old DNS route found (or already removed)', 'skip');
}

// May need manual deletion from Cloudflare Dashboard
console.log('');
ui.box(`${ui.icons.warning} Manual Step (if needed)`, [
  'You may need to delete the CNAME record manually:',
  '',
  `1. Go to: https://dash.cloudflare.com/`,
  `2. Select your domain`,
  `3. Navigate to: DNS → Records`,
  `4. Find and delete the old record`,
]);
console.log('');

// Create new DNS route
ui.step(2, 2, `${ui.icons.dns} Creating new DNS route...`);
try {
  execSync(`cloudflared tunnel route dns ${tunnelId} ${domain}`, { stdio: 'inherit' });
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
