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

// ตรวจสอบว่ามี cloudflared ติดตั้งหรือไม่ ถ้าไม่ใช้ Docker แทน
function getCloudflaredCommand() {
  try {
    execSync('cloudflared --version', { stdio: 'pipe' });
    return 'cloudflared';
  } catch (error) {
    // ใช้ Docker แทน
    const projectRoot = path.join(__dirname, '..');
    return `docker run --rm -v "${projectRoot}/tunnels:/etc/cloudflared" -v "${process.env.USERPROFILE}/.cloudflared:/root/.cloudflared" cloudflare/cloudflared:latest`;
  }
}

function exec(command, description, returnOutput = false) {
  console.log(`\n✓ ${description}...`);
  try {
    const result = execSync(command, {
      stdio: returnOutput ? 'pipe' : 'inherit',
      encoding: returnOutput ? 'utf8' : undefined
    });
    return returnOutput ? result : true;
  } catch (error) {
    console.error(`✗ Failed: ${description}`);
    if (returnOutput) {
      return null;
    }
    return false;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Cloudflare Tunnel - Setup Wizard    ║');
  console.log('╚════════════════════════════════════════╝\n');

  // Check if cloudflared is installed
  const hasCloudflared = checkCloudflared();
  if (!hasCloudflared) {
    console.log('⚠️  Note: cloudflared is not installed locally.');
    console.log('   This script will use Docker to run cloudflared commands.\n');

    // ตรวจสอบว่ามี Docker หรือไม่
    try {
      execSync('docker --version', { stdio: 'pipe' });
      console.log('✓ Docker is available. Continuing...\n');
    } catch (error) {
      console.log('❌ Error: Neither cloudflared nor Docker is installed!\n');
      console.log('Please install one of the following:\n');
      console.log('Option 1 - Install cloudflared:');
      console.log('  npm run check    # See installation instructions\n');
      console.log('Option 2 - Install Docker:');
      console.log('  https://www.docker.com/products/docker-desktop/\n');
      rl.close();
      process.exit(1);
    }
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
  console.log(`Folder:      tunnels/${folderName}`);
  console.log('='.repeat(50) + '\n');

  const confirm = await question('Continue? (yes/no): ');
  if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
    console.log('Cancelled.');
    rl.close();
    return;
  }

  // Create tunnel
  console.log('\n[1/6] Creating Cloudflare Tunnel...');
  const cmd = getCloudflaredCommand();
  const createOutput = exec(`${cmd} tunnel create ${tunnelName}`, 'Create tunnel', true);
  if (!createOutput) {
    console.error('✗ Failed to create tunnel');
    rl.close();
    return;
  }

  // ดึง tunnel ID จาก output
  let tunnelId = null;
  const lines = createOutput.split('\n');
  for (const line of lines) {
    // หา line ที่มี "Created tunnel" และ UUID
    const match = line.match(/Created tunnel .+ with id ([a-f0-9-]{36})/i);
    if (match) {
      tunnelId = match[1];
      console.log(`✓ Tunnel ID: ${tunnelId}`);
      break;
    }
    // รูปแบบอื่น ๆ ที่อาจจะมี
    const match2 = line.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    if (match2 && !tunnelId) {
      tunnelId = match2[1];
    }
  }

  if (!tunnelId) {
    console.error('✗ Could not extract tunnel ID from output');
    console.log('Output:', createOutput);
    rl.close();
    return;
  }

  console.log(`✓ Tunnel created with ID: ${tunnelId}`);

  // Create folder
  console.log('\n[2/6] Creating config folder...');
  const projectRoot = path.join(__dirname, '..');
  const configDir = path.join(projectRoot, 'tunnels', folderName);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
    console.log(`✓ Created: ${configDir}`);
  }

  // Copy credentials
  console.log('\n[3/6] Copying credentials...');
  const cloudflaredHome = path.join(process.env.USERPROFILE, '.cloudflared');
  const credentialFile = `${tunnelId}.json`;
  const credentialPath = path.join(cloudflaredHome, credentialFile);

  if (fs.existsSync(credentialPath)) {
    fs.copyFileSync(
      credentialPath,
      path.join(configDir, credentialFile)
    );
    console.log(`✓ Copied: ${credentialFile}`);
  } else {
    console.error(`✗ Credential file not found: ${credentialFile}`);
    console.log('Looking for any JSON files in .cloudflared...');
    const jsonFiles = fs.readdirSync(cloudflaredHome).filter(f => f.endsWith('.json'));
    if (jsonFiles.length > 0) {
      const latestJson = jsonFiles[jsonFiles.length - 1];
      fs.copyFileSync(
        path.join(cloudflaredHome, latestJson),
        path.join(configDir, latestJson)
      );
      console.log(`✓ Copied latest file: ${latestJson}`);
      // อัปเดต tunnelId ตามไฟล์ที่คัดลอก
      const foundId = latestJson.replace('.json', '');
      if (foundId.match(/[a-f0-9-]{36}/)) {
        tunnelId = foundId;
        console.log(`✓ Using tunnel ID from file: ${tunnelId}`);
      }
    } else {
      console.error('✗ No credential files found!');
      rl.close();
      return;
    }
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
  const configContent = `tunnel: ${tunnelId}
credentials-file: /etc/cloudflared/${tunnelId}.json

ingress:
  - hostname: ${domain}
    service: http://host.docker.internal:${localPort}
  - service: http_status:404
`;
  fs.writeFileSync(path.join(configDir, 'config.yml'), configContent);
  console.log('✓ Created: config.yml');
  console.log(`  Tunnel ID: ${tunnelId}`);
  console.log(`  Domain: ${domain}`);

  // Setup DNS
  console.log('\n[6/6] Setting up DNS...');
  console.log(`Creating CNAME: ${domain} -> ${tunnelId}.cfargotunnel.com`);
  const dnsResult = exec(`${cmd} tunnel route dns ${tunnelId} ${domain}`, 'Setup DNS route', true);
  if (dnsResult) {
    console.log(`✓ DNS route created`);
    console.log(`  Domain: ${domain}`);
    console.log(`  Target: ${tunnelId}.cfargotunnel.com`);
  } else {
    console.log('⚠ DNS route setup may have failed, but you can add it manually:');
    console.log(`  CNAME: ${domain} -> ${tunnelId}.cfargotunnel.com`);
  }

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
      - ./tunnels/${folderName}:/etc/cloudflared
    extra_hosts:
      - "host.docker.internal:host-gateway"
`;
  fs.writeFileSync(path.join(projectRoot, dockerComposeFile), dockerComposeContent);
  console.log(`✓ Created: ${dockerComposeFile}`);

  console.log('\n' + '='.repeat(50));
  console.log('✓ Setup Complete!');
  console.log('='.repeat(50));
  console.log(`\nTunnel Information:`);
  console.log(`  Name:      ${tunnelName}`);
  console.log(`  ID:        ${tunnelId}`);
  console.log(`  Domain:    ${domain}`);
  console.log(`  CNAME:     ${tunnelId}.cfargotunnel.com`);
  console.log(`  Local:     http://localhost:${localPort}`);
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

