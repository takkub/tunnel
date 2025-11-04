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

if (!cloudflaredInstalled && !dockerInstalled) {
  console.log('\n❌ You need either Cloudflared OR Docker to continue.\n');
  console.log('📦 Option 1 - Install Cloudflared:\n');
  console.log('Windows (using winget):');
  console.log('  winget install Cloudflare.cloudflared\n');
  console.log('Or download from:');
  console.log('  https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/\n');
  console.log('🐳 Option 2 - Install Docker (Recommended):\n');
  console.log('Download Docker Desktop from:');
  console.log('  https://www.docker.com/products/docker-desktop/\n');
  console.log('\n⚠️  Please install one of the above options first.\n');
} else if (!cloudflaredInstalled && dockerInstalled) {
  console.log('\n💡 Cloudflared is not installed, but that\'s OK!\n');
  console.log('✅ You have Docker, which can run cloudflared commands.\n');
  console.log('All scripts will use Docker automatically.\n');
  console.log('='.repeat(50));
  console.log('\n✅ You\'re ready to go! Next steps:\n');
  console.log('  npm run login    # Login to Cloudflare (via Docker)');
  console.log('  npm run setup    # Create a new tunnel');
  console.log('  npm start        # Start tunnels\n');
  console.log('📝 Optional: Install cloudflared for faster commands:');
  console.log('  winget install Cloudflare.cloudflared\n');
} else if (cloudflaredInstalled && !dockerInstalled) {
  console.log('\n⚠️  Docker is required to run tunnels in containers.\n');
  console.log('🐳 How to install Docker:\n');
  console.log('Download Docker Desktop from:');
  console.log('  https://www.docker.com/products/docker-desktop/\n');
  console.log('\n⚠️  Please install Docker to continue.\n');
} else if (cloudflaredInstalled && dockerInstalled) {
  console.log('\n✅ Perfect! All requirements are met!\n');
  console.log('You can now run:\n');
  console.log('  npm run login    # Login to Cloudflare');
  console.log('  npm run setup    # Create a new tunnel');
  console.log('  npm start        # Start tunnels\n');
}

if (!dockerComposeInstalled && dockerInstalled) {
  console.log('📝 Note: Docker Compose is usually included with Docker Desktop\n');
}

