const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const ui = require('./ui-helper');
const { ROOT, TUNNELS_DIR } = require('./runtime');

function exec(command, silent = false) {
  try {
    const output = execSync(command, {
      stdio: silent ? 'pipe' : 'inherit',
      encoding: 'utf8'
    });
    return { success: true, output };
  } catch (error) {
    return { success: false, error };
  }
}

function getCloudflaredCommand() {
  try {
    execSync('cloudflared --version', { stdio: 'pipe' });
    return 'cloudflared';
  } catch (error) {
    ui.fail('cloudflared is not installed!');
    ui.command('winget install Cloudflare.cloudflared');
    ui.tip('Then restart your terminal and try again.');
    console.log('');
    process.exit(1);
  }
}

async function main() {
  ui.warningHeader('Force Delete Tunnel', 'Aggressive deletion mode');

  const tunnelName = process.argv[2];
  if (!tunnelName) {
    ui.section('Usage');
    ui.command('npm run force-delete <tunnel-name>');
    console.log('');
    console.log(`  ${ui.c.dim}Example:${ui.c.reset} ${ui.c.cyan}npm run force-delete tak${ui.c.reset}`);
    console.log('');
    ui.section('Available Shortcuts');
    console.log(`  ${ui.c.dim}•${ui.c.reset} npm run force-delete:tak`);
    console.log(`  ${ui.c.dim}•${ui.c.reset} npm run force-delete:app`);
    console.log(`  ${ui.c.dim}•${ui.c.reset} npm run force-delete:office`);
    console.log(`  ${ui.c.dim}•${ui.c.reset} npm run force-delete:home`);
    console.log('');
    return;
  }

  ui.warning(`FORCE DELETE MODE`);
  ui.info(`Target: ${ui.c.bold}${tunnelName}${ui.c.reset}`);
  console.log(`  ${ui.c.dim}This is more aggressive than regular delete.${ui.c.reset}`);
  console.log('');

  const confirm = await ui.confirmAction(
    `⚠️  FORCE DELETE tunnel "${tunnelName}"? (Aggressive mode)`,
    false // Default to No for safety
  );

  if (!confirm) {
    ui.warning('Cancelled.');
    return;
  }

  const cmd = getCloudflaredCommand();
  const projectRoot = ROOT;

  // [1/5] หยุด Docker containers
  ui.step(1, 5, `${ui.icons.docker} Stopping Docker containers...`);
  const dockerFile = `docker-compose-cloudflare-${tunnelName}.yml`;
  const dockerPath = path.join(projectRoot, dockerFile);

  if (fs.existsSync(dockerPath)) {
    const result = exec(`docker compose -f "${dockerPath}" down`, true);
    if (result.success) {
      ui.subStep('Docker container stopped', 'success');
    } else {
      ui.subStep('No running container or already stopped', 'skip');
    }
  } else {
    ui.subStep('No docker-compose file found', 'skip');
  }

  // ตรวจสอบและหยุด containers ที่ค้างอยู่
  const psResult = exec(`docker ps -a --filter name=cloudflared-tunnel-${tunnelName} --format "{{.ID}}"`, true);
  if (psResult.success && psResult.output && psResult.output.trim()) {
    const containerIds = psResult.output.trim().split('\n');
    for (const id of containerIds) {
      exec(`docker stop ${id}`, true);
      exec(`docker rm ${id}`, true);
    }
    ui.subStep(`Cleaned up ${containerIds.length} hanging container(s)`, 'success');
  }

  // [2/5] หา tunnel ID
  ui.step(2, 5, `${ui.icons.dns} Finding tunnel ID...`);
  let tunnelId = null;

  const listResult = exec(`${cmd} tunnel list`, true);
  if (listResult.success) {
    const lines = listResult.output.split('\n');
    for (const line of lines) {
      const match = line.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\s+(\S+)/i);
      if (match && match[2] === tunnelName) {
        tunnelId = match[1];
        ui.subStep(`Found tunnel ID: ${ui.c.cyan}${tunnelId}${ui.c.reset}`, 'success');
        break;
      }
    }
  }

  // ถ้าหาไม่เจอจาก list ลองหาจากไฟล์
  if (!tunnelId) {
    const tunnelFolder = path.join(TUNNELS_DIR, tunnelName);
    if (fs.existsSync(tunnelFolder)) {
      const jsonFiles = fs.readdirSync(tunnelFolder)
        .filter(f => f.endsWith('.json') && f.match(/[a-f0-9-]{36}\.json/));
      if (jsonFiles.length > 0) {
        tunnelId = jsonFiles[0].replace('.json', '');
        ui.subStep(`Found tunnel ID from file: ${ui.c.cyan}${tunnelId}${ui.c.reset}`, 'success');
      }
    }
  }

  if (!tunnelId) {
    ui.subStep('Could not find tunnel ID, will use tunnel name', 'skip');
    tunnelId = tunnelName;
  }

  // [3/5] ลบ DNS routes ทั้งหมด
  ui.step(3, 5, `${ui.icons.globe} Deleting all DNS routes...`);
  const routeResult = exec(`${cmd} tunnel route dns list`, true);
  if (routeResult.success) {
    const lines = routeResult.output.split('\n');
    let deletedCount = 0;

    for (const line of lines) {
      if (line.includes(tunnelId) || line.includes(tunnelName)) {
        const match = line.match(/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (match) {
          const domain = match[1];
          const delResult = exec(`${cmd} tunnel route dns delete ${tunnelId} ${domain}`, true);
          if (delResult.success) {
            ui.subStep(`Deleted: ${domain}`, 'success');
            deletedCount++;
          }
        }
      }
    }

    if (deletedCount > 0) {
      ui.subStep(`Deleted ${deletedCount} DNS route(s)`, 'success');
    } else {
      ui.subStep('No DNS routes found', 'skip');
    }
  } else {
    ui.subStep('Could not list DNS routes', 'error');
  }

  // [4/5] ลบ tunnel จาก Cloudflare (หลายวิธี)
  ui.step(4, 5, `${ui.icons.cloud} Force deleting tunnel from Cloudflare...`);

  let deleted = false;
  const attempts = [
    { cmd: `${cmd} tunnel delete -f ${tunnelId}`, desc: 'Using tunnel ID with force flag' },
    { cmd: `${cmd} tunnel delete -f ${tunnelName}`, desc: 'Using tunnel name with force flag' },
    { cmd: `${cmd} tunnel delete ${tunnelId}`, desc: 'Without force flag' }
  ];

  for (let i = 0; i < attempts.length && !deleted; i++) {
    ui.subStep(`Attempt ${i + 1}: ${attempts[i].desc}...`, 'pending');
    const result = exec(attempts[i].cmd, true);
    if (result.success) {
      ui.subStep(`Tunnel deleted successfully (method ${i + 1})`, 'success');
      deleted = true;
    }
  }

  if (!deleted) {
    ui.subStep('Could not delete tunnel automatically', 'error');
    console.log('');
    ui.section(`${ui.icons.note} Manual Deletion Required`);
    console.log(`  ${ui.c.dim}1. Go to:${ui.c.reset} ${ui.c.cyan}https://dash.cloudflare.com/${ui.c.reset}`);
    console.log(`  ${ui.c.dim}2. Navigate to:${ui.c.reset} Traffic → Cloudflare Tunnel`);
    console.log(`  ${ui.c.dim}3. Find tunnel:${ui.c.reset} ${ui.c.yellow}${tunnelName}${ui.c.reset}`);
    console.log(`  ${ui.c.dim}4. Click ... → Delete${ui.c.reset}`);
    console.log('');
    console.log(`  ${ui.c.dim}Or try command:${ui.c.reset}`);
    ui.command(`cloudflared tunnel delete ${tunnelId}`);
  }

  // [5/5] ลบ local files
  ui.step(5, 5, `${ui.icons.trash} Cleaning up local files...`);

  const configFolder = path.join(TUNNELS_DIR, tunnelName);
  if (fs.existsSync(configFolder)) {
    try {
      fs.rmSync(configFolder, { recursive: true, force: true });
      ui.subStep(`Deleted: tunnels/${tunnelName}/`, 'success');
    } catch (error) {
      ui.subStep(`Could not delete folder: ${error.message}`, 'error');
    }
  } else {
    ui.subStep('No config folder found', 'skip');
  }

  if (fs.existsSync(dockerPath)) {
    try {
      fs.unlinkSync(dockerPath);
      ui.subStep(`Deleted: ${dockerFile}`, 'success');
    } catch (error) {
      ui.subStep(`Could not delete file: ${error.message}`, 'error');
    }
  } else {
    ui.subStep('No docker-compose file found', 'skip');
  }

  // Summary
  if (deleted) {
    ui.complete('Force Delete Complete!');
  } else {
    console.log('');
    ui.warning('Force delete completed with issues');
  }

  ui.summaryBox('Summary', [
    ['Tunnel', tunnelName],
    ['ID', tunnelId],
    ['Cloudflare', deleted ? 'DELETED' : 'MANUAL DELETION REQUIRED'],
    ['Local Files', 'CLEANED UP']
  ]);

  if (!deleted) {
    console.log('');
    ui.warning('Please delete the tunnel manually from Cloudflare Dashboard');
    console.log(`  ${ui.c.dim}Dashboard:${ui.c.reset} ${ui.c.cyan}https://dash.cloudflare.com/${ui.c.reset}`);
    console.log('');
  }

}

main().catch(error => {
  ui.error(`Error: ${error.message}`);
  process.exit(1);
});
