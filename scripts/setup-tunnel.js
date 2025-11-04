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

function checkCloudflared() {
  try {
    execSync('cloudflared --version', { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

function exec(command, description) {
  console.log(`\n✓ ${description}...`);
  try {
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(`✗ Failed: ${description}`);
    return false;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Cloudflare Tunnel - Setup Wizard    ║');
  console.log('╚════════════════════════════════════════╝\n');

  // Check if cloudflared is installed
  if (!checkCloudflared()) {
    console.log('❌ Error: cloudflared is not installed!\n');
    console.log('Please install cloudflared first:');
    console.log('  npm run check    # See installation instructions\n');
    console.log('Windows (using winget):');
    console.log('  winget install Cloudflare.cloudflared\n');
    console.log('Or download from:');
    console.log('  https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/\n');
    rl.close();
    process.exit(1);
  }

  // Step 1: Tunnel Name
  const tunnelName = await question('Enter tunnel name (e.g., app-tunnel, office-tunnel): ');
  if (!tunnelName) {
    console.log('✗ Tunnel name is required!');
    rl.close();
    process.exit(1);
  }

  // Step 2: Domain
  const domain = await question('Enter domain (e.g., app.sabuytube.xyz): ');
  if (!domain) {
    console.log('✗ Domain is required!');
    rl.close();
    process.exit(1);
  }

  // Step 3: Local Service
  const localPort = await question('Enter local port (default: 3000): ') || '3000';

  // Step 4: Folder Name
  const folderName = await question('Enter folder name for config (e.g., app, office): ');
  if (!folderName) {
    console.log('✗ Folder name is required!');
    rl.close();
    process.exit(1);
  }

  console.log('\n' + '='.repeat(50));
  console.log('Summary:');
  console.log('='.repeat(50));
  console.log(`Tunnel Name: ${tunnelName}`);
  console.log(`Domain:      ${domain}`);
  console.log(`Local Port:  ${localPort}`);
  console.log(`Folder:      cloudflared/${folderName}`);
  console.log('='.repeat(50) + '\n');

  const confirm = await question('Continue? (yes/no): ');
  if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
    console.log('Cancelled.');
    rl.close();
    return;
  }

  // Create tunnel
  console.log('\n[1/6] Creating Cloudflare Tunnel...');
  if (!exec(`cloudflared tunnel create ${tunnelName}`, 'Create tunnel')) {
    rl.close();
    return;
  }

  // Create folder
  console.log('\n[2/6] Creating config folder...');
  const projectRoot = path.join(__dirname, '..');
  const configDir = path.join(projectRoot, 'cloudflared', folderName);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
    console.log(`✓ Created: ${configDir}`);
  }

  // Copy credentials
  console.log('\n[3/6] Copying credentials...');
  const cloudflaredHome = path.join(process.env.USERPROFILE, '.cloudflared');
  const jsonFiles = fs.readdirSync(cloudflaredHome).filter(f => f.endsWith('.json'));
  
  if (jsonFiles.length > 0) {
    const latestJson = jsonFiles[jsonFiles.length - 1];
    fs.copyFileSync(
      path.join(cloudflaredHome, latestJson),
      path.join(configDir, latestJson)
    );
    console.log(`✓ Copied: ${latestJson}`);
  }

  // Copy cert.pem
  console.log('\n[4/6] Copying cert.pem...');
  fs.copyFileSync(
    path.join(cloudflaredHome, 'cert.pem'),
    path.join(configDir, 'cert.pem')
  );
  console.log('✓ Copied: cert.pem');

  // Create config.yml
  console.log('\n[5/6] Creating config.yml...');
  const tunnelId = jsonFiles[jsonFiles.length - 1]?.replace('.json', '') || 'TUNNEL_ID';
  const configContent = `tunnel: ${tunnelId}
credentials-file: /etc/cloudflared/${tunnelId}.json

ingress:
  - hostname: ${domain}
    service: http://host.docker.internal:${localPort}
  - service: http_status:404
`;
  fs.writeFileSync(path.join(configDir, 'config.yml'), configContent);
  console.log('✓ Created: config.yml');

  // Setup DNS
  console.log('\n[6/6] Setting up DNS...');
  exec(`cloudflared tunnel route dns ${tunnelName} ${domain}`, 'Setup DNS route');

  // Create docker-compose file
  console.log('\n[7/7] Creating docker-compose file...');
  const dockerComposeFile = `docker-compose-cloudflare-${folderName}.yml`;
  const dockerComposeContent = `version: '3.8'

services:
  cloudflared-${folderName}:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared-tunnel-${folderName}
    restart: unless-stopped
    command: tunnel --config /etc/cloudflared/config.yml run
    volumes:
      - ./cloudflared/${folderName}:/etc/cloudflared
    extra_hosts:
      - "host.docker.internal:host-gateway"
`;
  fs.writeFileSync(path.join(projectRoot, dockerComposeFile), dockerComposeContent);
  console.log(`✓ Created: ${dockerComposeFile}`);

  console.log('\n' + '='.repeat(50));
  console.log('✓ Setup Complete!');
  console.log('='.repeat(50));
  console.log(`\nTo start the tunnel, run:`);
  console.log(`  docker-compose -f ${dockerComposeFile} up -d`);
  console.log(`\nOr add it to package.json scripts and run:`);
  console.log(`  npm run tunnel:${folderName}:up`);
  console.log('');

  rl.close();
}

main().catch(error => {
  console.error('Error:', error);
  rl.close();
  process.exit(1);
});

