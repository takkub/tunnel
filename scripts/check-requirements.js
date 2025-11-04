const { execSync } = require('child_process');

function checkCommand(command, name) {
  try {
    execSync(`${command} --version`, { stdio: 'pipe' });
    console.log(`✅ ${name} is installed`);
    return true;
  } catch (error) {
    console.log(`❌ ${name} is NOT installed`);
    return false;
  }
}

console.log('╔════════════════════════════════════════╗');
console.log('║   System Requirements Check            ║');
console.log('╚════════════════════════════════════════╝\n');

const cloudflaredInstalled = checkCommand('cloudflared', 'Cloudflared');
const dockerInstalled = checkCommand('docker', 'Docker');
const dockerComposeInstalled = checkCommand('docker-compose', 'Docker Compose');

console.log('\n' + '='.repeat(50));

if (!cloudflaredInstalled) {
  console.log('\n📦 How to install Cloudflared:\n');
  console.log('Windows (using winget):');
  console.log('  winget install Cloudflare.cloudflared\n');
  console.log('Or download from:');
  console.log('  https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/\n');
  console.log('After installation, restart your terminal and run:');
  console.log('  npm run check\n');
}

if (!dockerInstalled) {
  console.log('\n🐳 How to install Docker:\n');
  console.log('Download Docker Desktop from:');
  console.log('  https://www.docker.com/products/docker-desktop/\n');
}

if (!dockerComposeInstalled && dockerInstalled) {
  console.log('\n📝 Note: Docker Compose is usually included with Docker Desktop\n');
}

if (cloudflaredInstalled && dockerInstalled) {
  console.log('\n✅ All requirements are met! You can now run:\n');
  console.log('  npm run login    # Login to Cloudflare');
  console.log('  npm run setup    # Create a new tunnel');
  console.log('  npm start        # Start tunnels\n');
} else {
  console.log('\n⚠️  Please install the missing requirements first.\n');
}

