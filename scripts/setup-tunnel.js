const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ui = require('./ui-helper');
const readline = require('readline');
const { TUNNELS_DIR, getEffectiveMode, generateLaunchers, nativeStart, getRuntimeDir } = require('./runtime');
const { findCloudflared, ensureCloudflared } = require('./cloudflared-bin');

if (process.env.CI === '1' || !process.stdin.isTTY) {
  console.error('interactive mode required, run from terminal');
  process.exit(1);
}

// Force stdin to resume and ensure it's in proper state
process.stdin.setRawMode(false);
process.stdin.resume();
process.stdin.setEncoding('utf8');

// Create readline interface after ensuring stdin is ready
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true
});

function question(query) {
  return new Promise(resolve => {
    rl.question(`${ui.c.cyan}${ui.icons.arrow}${ui.c.reset} ${query}`, resolve);
  });
}

// Resolve how to run cloudflared commands for this setup run: a real binary
// (downloading it if needed) for native mode, or a `docker run` wrapper when
// the effective mode is 'docker'. Returns a quoted command prefix usable in
// shell strings, e.g. `"C:\...\cloudflared.exe"` or `docker run --rm ...`.
async function resolveCloudflaredCommand(mode) {
  if (mode === 'docker') {
    const cloudflaredDir = path.join(os.homedir(), '.cloudflared');
    return `docker run --rm -v "${TUNNELS_DIR.replace(/\\/g, '/')}:/etc/cloudflared" -v "${cloudflaredDir.replace(/\\/g, '/')}:/root/.cloudflared" cloudflare/cloudflared:latest`;
  }
  let bin = findCloudflared();
  if (!bin) {
    ui.info('cloudflared not found — downloading the latest release...');
    bin = await ensureCloudflared();
    ui.success('cloudflared downloaded');
    console.log('');
  }
  return `"${bin}"`;
}

function exec(command, description, returnOutput = false) {
  ui.subStep(description, 'pending');
  try {
    const result = execSync(command, {
      stdio: returnOutput ? 'pipe' : 'inherit',
      encoding: returnOutput ? 'utf8' : undefined
    });
    ui.subStep(description, 'success');
    return returnOutput ? result : true;
  } catch (error) {
    ui.subStep(description, 'error');
    if (returnOutput) {
      return null;
    }
    return false;
  }
}

async function main() {
  ui.header('Cloudflare Tunnel', 'Setup Wizard');

  const mode = getEffectiveMode(); // 'docker' | 'native' — same setting the web dashboard uses
  ui.info(`Runtime mode: ${ui.c.cyan}${mode}${ui.c.reset}`);
  console.log('');

  // Step 1: Tunnel Name (simple name, will auto-append -tunnel)
  ui.section('Configuration');
  console.log('');
  const baseName = await question('Enter tunnel name (e.g., good): ');
  if (!baseName) {
    ui.error('Tunnel name is required!');
    process.exit(1);
  }

  // Auto-append -tunnel suffix
  const tunnelName = `${baseName}-tunnel`;
  console.log('');
  ui.info(`Full tunnel name: ${ui.c.cyan}${tunnelName}${ui.c.reset}`);

  // Step 2: Root Domain
  const rootDomain = await question('Enter root domain (e.g., google.com): ');
  if (!rootDomain) {
    ui.error('Root domain is required!');
    process.exit(1);
  }

  // Auto-generate full domain: {baseName}.{rootDomain}
  const domain = `${baseName}.${rootDomain}`;
  console.log('');
  ui.info(`Full domain: ${ui.c.cyan}${domain}${ui.c.reset}`);

  // Step 3: Local Service
  const localPort = await question('Enter local port (default: 3000): ') || '3000';

  // Auto-set folder name based on tunnel name
  const folderName = tunnelName;

  console.log('');
  ui.info(`Folder name: ${ui.c.cyan}${folderName}${ui.c.reset}`);

  // Summary
  ui.summaryBox('Configuration Summary', [
    ['Tunnel Name', tunnelName],
    ['Domain', domain],
    ['Local Port', localPort],
    ['Config Folder', `tunnels/${folderName}`],
    ['Runtime Mode', mode === 'docker' ? 'Docker' : 'Native']
  ]);

  console.log('');
  const confirm = await question('Continue with setup? (yes/no): ');
  if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
    ui.warning('Setup cancelled.');
    rl.close();
    return;
  }

  // Create tunnel
  ui.step(1, 7, `${ui.icons.cloud} Creating Cloudflare Tunnel...`);
  const cmd = await resolveCloudflaredCommand(mode);
  const createOutput = exec(`${cmd} tunnel create ${tunnelName}`, 'Create tunnel', true);
  if (!createOutput) {
    ui.error('Failed to create tunnel');
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
      break;
    }
    const match2 = line.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    if (match2 && !tunnelId) {
      tunnelId = match2[1];
    }
  }

  if (!tunnelId) {
    ui.error('Could not extract tunnel ID from output');
    console.log(`${ui.c.dim}Output: ${createOutput}${ui.c.reset}`);
    rl.close();
    return;
  }

  ui.success(`Tunnel ID: ${ui.c.cyan}${tunnelId}${ui.c.reset}`);

  // Create folder
  ui.step(2, 7, `${ui.icons.folder} Creating config folder...`);
  const configDir = path.join(TUNNELS_DIR, folderName);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  ui.subStep(`Created: tunnels/${folderName}/`, 'success');

  // Copy credentials
  ui.step(3, 7, `${ui.icons.lock} Copying credentials...`);
  const cloudflaredHome = path.join(os.homedir(), '.cloudflared');
  const credentialFile = `${tunnelId}.json`;
  const credentialPath = path.join(cloudflaredHome, credentialFile);

  if (fs.existsSync(credentialPath)) {
    fs.copyFileSync(
      credentialPath,
      path.join(configDir, credentialFile)
    );
    ui.subStep(`Copied: ${credentialFile}`, 'success');
  } else {
    ui.subStep(`Credential file not found: ${credentialFile}`, 'error');
    console.log(`${ui.c.dim}   Looking for any JSON files in .cloudflared...${ui.c.reset}`);
    const jsonFiles = fs.readdirSync(cloudflaredHome).filter(f => f.endsWith('.json'));
    if (jsonFiles.length > 0) {
      const latestJson = jsonFiles[jsonFiles.length - 1];
      fs.copyFileSync(
        path.join(cloudflaredHome, latestJson),
        path.join(configDir, latestJson)
      );
      ui.subStep(`Copied latest file: ${latestJson}`, 'success');
      // อัปเดต tunnelId ตามไฟล์ที่คัดลอก
      const foundId = latestJson.replace('.json', '');
      if (foundId.match(/[a-f0-9-]{36}/)) {
        tunnelId = foundId;
        ui.subStep(`Using tunnel ID from file: ${tunnelId}`, 'success');
      }
    } else {
      ui.error('No credential files found!');
      rl.close();
      return;
    }
  }

  // Copy cert.pem
  ui.step(4, 7, `${ui.icons.lock} Copying cert.pem...`);
  try {
    fs.copyFileSync(
      path.join(cloudflaredHome, 'cert.pem'),
      path.join(configDir, 'cert.pem')
    );
    ui.subStep('Copied: cert.pem', 'success');
  } catch (e) {
    ui.subStep('Could not copy cert.pem (optional for running)', 'skip');
  }

  // Create config.yml
  ui.step(5, 7, `${ui.icons.settings} Creating config.yml...`);

  const credentialsPathConfig = mode === 'docker'
    ? `/etc/cloudflared/${tunnelId}.json`
    : path.join(configDir, `${tunnelId}.json`).replace(/\\/g, '/');
  const serviceUrl = mode === 'docker'
    ? `http://host.docker.internal:${localPort}`
    : `http://localhost:${localPort}`;

  const configContent = `tunnel: ${tunnelId}
credentials-file: ${credentialsPathConfig}

# Protocol: auto triggers QUIC first, fallback to HTTP/2
protocol: auto

ingress:
  - hostname: ${domain}
    service: ${serviceUrl}
  - service: http_status:404
`;
  fs.writeFileSync(path.join(configDir, 'config.yml'), configContent);
  ui.subStep('Created: config.yml', 'success');
  console.log(`   ${ui.c.dim}Runtime mode: ${mode}${ui.c.reset}`);

  // Setup DNS
  ui.step(6, 7, `${ui.icons.dns} Setting up DNS...`);
  console.log(`   ${ui.c.dim}Domain: ${domain}${ui.c.reset}`);
  const dnsResult = exec(`${cmd} tunnel route dns ${tunnelId} ${domain}`, 'Setup DNS route', true);
  if (dnsResult) {
    ui.subStep(`DNS route created for ${domain}`, 'success');
  } else {
    ui.warning('DNS route setup may have failed');
    ui.tip(`You can add it manually: cloudflared tunnel route dns ${tunnelId} ${domain}`);
  }

  // Generate Run Script / Docker Compose
  ui.step(7, 7, `${ui.icons.rocket} Generating run scripts...`);

  if (mode === 'docker') {
    // Create docker-compose inside tunnel folder (volume . = this folder)
    const composeFilePath = path.join(configDir, 'docker-compose.yml');
    const dockerComposeContent = `version: '3.8'

services:
  cloudflared-${folderName}:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared-tunnel-${folderName}
    restart: unless-stopped
    command: tunnel --config /etc/cloudflared/config.yml run
    volumes:
      - .:/etc/cloudflared
    extra_hosts:
      - "host.docker.internal:host-gateway"
`;
    fs.writeFileSync(composeFilePath, dockerComposeContent);
    ui.subStep(`Created: tunnels/${folderName}/docker-compose.yml`, 'success');

    generateLaunchers(folderName);
    ui.subStep(`Created: tunnels/${folderName}/start.{bat,sh,command}`, 'success');

    ui.complete('Setup Complete!');
    ui.summaryBox('Tunnel Information', [
      ['Name', tunnelName],
      ['ID', tunnelId],
      ['Domain', domain],
      ['Type', 'Docker Container']
    ]);

    ui.nextSteps([
      `Start: ${ui.c.cyan}docker compose -f tunnels/${folderName}/docker-compose.yml up -d${ui.c.reset}`,
      `Logs: ${ui.c.cyan}docker logs -f cloudflared-tunnel-${folderName}${ui.c.reset}`
    ]);

    // Ask if user wants to start now
    console.log('');
    const startNow = await ui.confirmAction(
      '🚀 Do you want to start the tunnel now?',
      true // Default to Yes
    );

    if (startNow) {
      console.log('');
      ui.section('Starting Tunnel...');

      try {
        execSync(`docker compose -f "${composeFilePath}" up -d`, {
          stdio: 'inherit' // Show output directly, only throw on non-zero exit
        });

        console.log('');
        ui.success('Tunnel started successfully!');
        console.log('');
        ui.tip(`View logs with: ${ui.c.cyan}docker logs -f cloudflared-tunnel-${folderName}${ui.c.reset}`);
      } catch (error) {
        console.log('');
        ui.error('Failed to start tunnel');
        console.log('');

        ui.section('Common Issues:');
        console.log(`  ${ui.c.yellow}1.${ui.c.reset} Docker Desktop is not running`);
        console.log(`     ${ui.c.dim}→ Start Docker Desktop and try again${ui.c.reset}`);
        console.log('');
        console.log(`  ${ui.c.yellow}2.${ui.c.reset} Port ${localPort} is already in use`);
        console.log(`     ${ui.c.dim}→ Stop the service using that port${ui.c.reset}`);
        console.log('');

        ui.section('Manual Start:');
        ui.command(`docker compose -f tunnels/${folderName}/docker-compose.yml up -d`);
        console.log('');
      }
    }

  } else {
    // Native mode — cross-platform launchers, no Docker involved
    generateLaunchers(folderName);
    ui.subStep(`Created: tunnels/${folderName}/start.{bat,sh,command}`, 'success');

    ui.complete('Setup Complete!');
    ui.summaryBox('Tunnel Information', [
      ['Name', tunnelName],
      ['ID', tunnelId],
      ['Domain', domain],
      ['Type', 'Native']
    ]);

    console.log('');
    ui.section('Quick Start');
    if (process.platform === 'win32') {
      ui.command(`tunnels\\${folderName}\\start.bat`);
    } else {
      ui.command(`tunnels/${folderName}/start.sh`);
    }

    // Ask if user wants to start now
    console.log('');
    const startNow = await ui.confirmAction(
      '🚀 Do you want to start the tunnel now?',
      true // Default to Yes
    );

    if (startNow) {
      console.log('');
      ui.section('Starting Tunnel...');
      try {
        const pid = nativeStart(folderName);
        ui.success(`Tunnel started (pid ${pid})`);
        console.log('');
        ui.tip(`Logs: ${ui.c.cyan}${path.join(getRuntimeDir(folderName), '.log')}${ui.c.reset}`);
      } catch (error) {
        console.log('');
        ui.error(`Failed to start tunnel: ${error.message}`);
        console.log('');
        ui.section('Manual Start:');
        ui.command(process.platform === 'win32' ? `tunnels\\${folderName}\\start.bat` : `tunnels/${folderName}/start.sh`);
        console.log('');
      }
    }
  }

  rl.close();
}

main().catch(error => {
  ui.error(`Error: ${error.message}`);
  rl.close();
  process.exit(1);
});
