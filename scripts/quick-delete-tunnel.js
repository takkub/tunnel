const { execSync } = require('child_process');

// ตรวจสอบว่ามี argument
const tunnelName = process.argv[2];
if (!tunnelName) {
  console.log('Usage: npm run quick-delete <tunnel-name>');
  console.log('Example: npm run quick-delete tak');
  process.exit(1);
}

console.log(`\n🗑️  Quick Delete: ${tunnelName}\n`);

try {
  // ตรวจสอบว่ามี cloudflared
  execSync('cloudflared --version', { stdio: 'pipe' });
} catch (error) {
  console.error('❌ cloudflared is not installed!');
  console.error('Install: winget install Cloudflare.cloudflared\n');
  process.exit(1);
}

// หา tunnel ID
console.log('[1/3] Finding tunnel ID...');
let tunnelId = null;

try {
  const list = execSync('cloudflared tunnel list', { encoding: 'utf8' });
  const lines = list.split('\n');

  for (const line of lines) {
    const match = line.match(/([a-f0-9-]{36})\s+(\S+)/i);
    if (match && match[2].includes(tunnelName)) {
      tunnelId = match[1];
      console.log(`✓ Found: ${match[2]} (${tunnelId})\n`);
      break;
    }
  }

  if (!tunnelId) {
    console.error(`❌ Tunnel "${tunnelName}" not found in list`);
    console.log('\nAvailable tunnels:');
    console.log(list);
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Failed to list tunnels');
  process.exit(1);
}

// ลบ tunnel
console.log('[2/3] Deleting tunnel from Cloudflare...');
try {
  execSync(`cloudflared tunnel delete -f ${tunnelId}`, { stdio: 'inherit' });
  console.log('✓ Tunnel deleted from Cloudflare\n');
} catch (error) {
  console.error('❌ Failed to delete tunnel');
  console.log('\n💡 Try manually:');
  console.log(`   cloudflared tunnel delete -f ${tunnelId}`);
  console.log('   Or delete from: https://dash.cloudflare.com/\n');
  process.exit(1);
}

// ตรวจสอบว่าลบสำเร็จ
console.log('[3/3] Verifying...');
try {
  const list = execSync('cloudflared tunnel list', { encoding: 'utf8' });
  if (list.includes(tunnelId)) {
    console.log('⚠️  Tunnel still exists in list');
  } else {
    console.log('✓ Tunnel removed successfully\n');
    console.log('✅ Done!\n');
  }
} catch (error) {
  console.log('✓ Verification skipped\n');
}

