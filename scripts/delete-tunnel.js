const readline = require('readline');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

function exec(command, silent = false) {
  try {
    execSync(command, { stdio: silent ? 'pipe' : 'inherit' });
    return true;
  } catch (error) {
    return false;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Cloudflare Tunnel - Delete Wizard    ║');
  console.log('╚════════════════════════════════════════╝\n');

  console.log('Available tunnels:\n');
  exec('cloudflared tunnel list');

  console.log('\n' + '='.repeat(50));
  const tunnelName = await question('\nEnter tunnel name to delete (or press Enter to cancel): ');
  
  if (!tunnelName) {
    console.log('Cancelled.');
    rl.close();
    return;
  }

  console.log(`\n⚠️  WARNING: You are about to delete tunnel: ${tunnelName}`);
  const confirm = await question('Type "DELETE" to confirm: ');

  if (confirm !== 'DELETE') {
    console.log('Cancelled.');
    rl.close();
    return;
  }

  console.log('\n[1/3] Stopping Docker containers...');
  const projectRoot = path.join(__dirname, '..');
  const composeFiles = fs.readdirSync(projectRoot)
    .filter(f => f.startsWith('docker-compose-cloudflare-') && f.endsWith('.yml'));
  
  composeFiles.forEach(file => {
    exec(`docker-compose -f ${path.join(projectRoot, file)} down`, true);
  });

  console.log('\n[2/3] Deleting tunnel from Cloudflare...');
  exec(`cloudflared tunnel delete ${tunnelName}`);

  console.log('\n[3/3] Cleanup complete!');
  console.log('\nNote: You may want to manually delete:');
  console.log('  - cloudflared/{folder} directory');
  console.log('  - docker-compose-cloudflare-*.yml file');
  console.log('');

  rl.close();
}

main().catch(error => {
  console.error('Error:', error);
  rl.close();
  process.exit(1);
});

