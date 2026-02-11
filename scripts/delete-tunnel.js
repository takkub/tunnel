const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ui = require('./ui-helper');

function exec(command, silent = false) {
  try {
    const output = execSync(command, { stdio: silent ? 'pipe' : 'inherit', encoding: 'utf8' });
    return { success: true, output };
  } catch (error) {
    return { success: false, error };
  }
}

// ตรวจสอบว่ามี cloudflared ติดตั้งหรือไม่
function getCloudflaredCommand() {
  try {
    execSync('cloudflared --version', { stdio: 'pipe' });
    return 'cloudflared';
  } catch (error) {
    ui.fail('cloudflared is not installed!');
    console.log('');
    ui.section('Installation');
    ui.command('winget install Cloudflare.cloudflared');
    console.log('');
    ui.tip('Then restart your terminal and try again.');
    console.log('');
    process.exit(1);
  }
}

function getTunnelInfo(tunnelName) {
  try {
    const cmd = getCloudflaredCommand();
    const result = execSync(`${cmd} tunnel info ${tunnelName}`, { encoding: 'utf8' });
    return result;
  } catch (error) {
    return null;
  }
}

function getTunnelId(tunnelName) {
  try {
    const cmd = getCloudflaredCommand();
    const result = execSync(`${cmd} tunnel list`, { encoding: 'utf8' });
    const lines = result.split('\n');

    for (const line of lines) {
      const match = line.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\s+(\S+)/i);
      if (match && match[2] === tunnelName) {
        return match[1];
      }
    }

    // ลองหาจากไฟล์ JSON ในโฟลเดอร์
    const projectRoot = path.join(__dirname, '..');
    const tunnelsDir = path.join(projectRoot, 'tunnels');
    if (fs.existsSync(tunnelsDir)) {
      const folders = fs.readdirSync(tunnelsDir);
      for (const folder of folders) {
        const jsonFiles = fs.readdirSync(path.join(tunnelsDir, folder))
          .filter(f => f.endsWith('.json') && f.match(/[a-f0-9-]{36}\.json/));
        if (jsonFiles.length > 0) {
          return jsonFiles[0].replace('.json', '');
        }
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

function getDNSRecords(tunnelName) {
  try {
    const cmd = getCloudflaredCommand();
    const result = execSync(`${cmd} tunnel route dns list`, { encoding: 'utf8' });
    const lines = result.split('\n');
    const records = [];

    lines.forEach(line => {
      if (line.includes(tunnelName)) {
        const match = line.match(/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (match) {
          records.push(match[1]);
        }
      }
    });

    return records;
  } catch (error) {
    return [];
  }
}

// Get list of available tunnel names for selection
function getTunnelList() {
  try {
    const cmd = getCloudflaredCommand();
    const result = execSync(`${cmd} tunnel list`, { encoding: 'utf8' });
    const lines = result.split('\n');
    const tunnels = [];

    for (const line of lines) {
      const match = line.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\s+(\S+)/i);
      if (match && match[2]) {
        tunnels.push(match[2]);
      }
    }

    return tunnels;
  } catch (error) {
    return [];
  }
}

async function main() {
  ui.warningHeader('Delete Tunnel', 'Remove tunnel and all associated resources');

  // ตรวจสอบว่ามีการส่ง argument มาหรือไม่
  let tunnelName = process.argv[2];

  if (!tunnelName) {
    // Get list of available tunnels
    const availableTunnels = getTunnelList();

    if (availableTunnels.length === 0) {
      ui.error('No tunnels found!');
      console.log('');
      ui.tip('Create a tunnel first with: npm run setup');
      process.exit(1);
    }

    // Add cancel option
    const options = [...availableTunnels, { label: '❌ Cancel', value: null }];

    try {
      tunnelName = await ui.selectFromList(
        `${ui.icons.list} Select tunnel to delete:`,
        options
      );

      if (!tunnelName) {
        ui.warning('Cancelled.');
        return;
      }
    } catch (error) {
      ui.warning('Cancelled.');
      return;
    }
  } else {
    ui.info(`Deleting tunnel: ${ui.c.bold}${tunnelName}${ui.c.reset}`);
  }

  // ดึง tunnel ID
  ui.step(1, 6, `${ui.icons.dns} Finding Tunnel ID...`);
  const tunnelId = getTunnelId(tunnelName);
  if (tunnelId) {
    ui.subStep(`Found tunnel ID: ${ui.c.cyan}${tunnelId}${ui.c.reset}`, 'success');
  } else {
    ui.subStep(`Could not find tunnel ID for: ${tunnelName}`, 'error');
    ui.tip('Will try to delete using tunnel name...');
  }

  // ดึงข้อมูล DNS records
  const dnsRecords = getDNSRecords(tunnelName);

  // Warning box
  console.log('');
  ui.box(`${ui.icons.warning} WARNING: You are about to delete`, [
    `Tunnel: ${tunnelName}`,
    `ID: ${tunnelId || 'unknown'}`,
    `DNS Records: ${dnsRecords.length > 0 ? dnsRecords.join(', ') : 'none'}`,
  ]);

  console.log('');
  const confirmDelete = await ui.confirmAction(
    `⚠️  Are you sure you want to delete tunnel "${tunnelName}"?`,
    false // Default to No for safety
  );

  if (!confirmDelete) {
    ui.warning('Cancelled.');
    return;
  }

  // ถามว่าจะลบอะไรบ้าง
  console.log('');
  const deletionOptions = await ui.multiSelect(
    '🗑️  Select what to delete:',
    [
      { label: '🌐 DNS routes', value: 'dns', checked: true },
      { label: '☁️  Tunnel from Cloudflare', value: 'tunnel', checked: true },
      { label: '📁 Configuration folder', value: 'config', checked: true },
      { label: '🐳 Docker compose file', value: 'docker', checked: true }
    ]
  );

  const deleteDNS = deletionOptions.includes('dns');
  const deleteTunnel = deletionOptions.includes('tunnel');
  const deleteConfigFolder = deletionOptions.includes('config');
  const deleteDockerCompose = deletionOptions.includes('docker');


  const projectRoot = path.join(__dirname, '..');

  // [1/6] หา folder ที่เกี่ยวข้อง
  ui.step(2, 6, `${ui.icons.folder} Finding related configuration...`);
  const tunnelsDir = path.join(projectRoot, 'tunnels');
  let configFolder = null;

  if (fs.existsSync(tunnelsDir)) {
    const folders = fs.readdirSync(tunnelsDir);
    for (const folder of folders) {
      const configPath = path.join(tunnelsDir, folder, 'config.yml');
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        if (configContent.includes(tunnelName) || dnsRecords.some(record => configContent.includes(record))) {
          configFolder = folder;
          ui.subStep(`Found configuration in: tunnels/${folder}`, 'success');
          break;
        }
      }
    }
  }

  // [2/6] หยุด Docker containers
  ui.step(3, 6, `${ui.icons.docker} Stopping Docker containers...`);
  const composeFiles = fs.existsSync(projectRoot) ? fs.readdirSync(projectRoot)
    .filter(f => f.startsWith('docker-compose-cloudflare-') && f.endsWith('.yml')) : [];

  let dockerComposeFile = null;
  composeFiles.forEach(file => {
    const filePath = path.join(projectRoot, file);
    if (configFolder && file.includes(configFolder)) {
      dockerComposeFile = file;
      ui.subStep(`Stopping container from: ${file}`, 'pending');
      exec(`docker-compose -f "${filePath}" down`, true);
      ui.subStep(`Stopped: ${file}`, 'success');
    }
  });

  // [3/6] ลบ DNS routes
  ui.step(4, 6, `${ui.icons.globe} Removing DNS routes...`);
  const cmd = getCloudflaredCommand();
  if (deleteDNS && dnsRecords.length > 0) {
    for (const record of dnsRecords) {
      const identifier = tunnelId || tunnelName;
      const result = exec(`${cmd} tunnel route dns delete ${identifier} ${record}`, true);
      if (result.success) {
        ui.subStep(`Deleted: ${record}`, 'success');
      } else {
        ui.subStep(`Could not delete: ${record}`, 'error');
      }
    }
  } else if (!deleteDNS) {
    ui.subStep('Skipped (user choice)', 'skip');
  } else {
    ui.subStep('No DNS records found', 'skip');
  }

  // [4/6] ลบ tunnel จาก Cloudflare
  ui.step(5, 6, `${ui.icons.cloud} Deleting tunnel from Cloudflare...`);
  if (deleteTunnel) {
    const identifier = tunnelId || tunnelName;

    let deleteResult = exec(`${cmd} tunnel delete -f ${identifier}`, true);

    if (!deleteResult.success) {
      deleteResult = exec(`${cmd} tunnel delete ${identifier}`, true);
    }

    if (!deleteResult.success && tunnelId && tunnelId !== tunnelName) {
      deleteResult = exec(`${cmd} tunnel delete -f ${tunnelName}`, true);
    }

    if (deleteResult.success) {
      ui.subStep('Tunnel deleted from Cloudflare', 'success');
    } else {
      ui.subStep('Could not delete tunnel', 'error');
      console.log(`   ${ui.c.dim}You may need to delete it manually from the Dashboard${ui.c.reset}`);
    }
  } else {
    ui.subStep('Skipped (user choice)', 'skip');
  }

  // [5/6] ลบ configuration folder
  ui.step(6, 6, `${ui.icons.trash} Removing local files...`);
  if (deleteConfigFolder && configFolder) {
    const configPath = path.join(tunnelsDir, configFolder);
    try {
      fs.rmSync(configPath, { recursive: true, force: true });
      ui.subStep(`Deleted: tunnels/${configFolder}/`, 'success');
    } catch (error) {
      ui.subStep(`Could not delete folder: ${error.message}`, 'error');
    }
  } else if (!deleteConfigFolder) {
    ui.subStep('Config folder skipped (user choice)', 'skip');
  } else {
    ui.subStep('No configuration folder found', 'skip');
  }

  // ลบ docker-compose file
  if (deleteDockerCompose && dockerComposeFile) {
    const composePath = path.join(projectRoot, dockerComposeFile);
    try {
      fs.unlinkSync(composePath);
      ui.subStep(`Deleted: ${dockerComposeFile}`, 'success');
    } catch (error) {
      ui.subStep(`Could not delete file: ${error.message}`, 'error');
    }
  } else if (!deleteDockerCompose) {
    ui.subStep('Docker compose skipped (user choice)', 'skip');
  } else {
    ui.subStep('No docker-compose file found', 'skip');
  }

  // Summary
  ui.complete('Cleanup Complete!');

  ui.summaryBox('Summary', [
    ['Tunnel', tunnelName],
    ['DNS Records', deleteDNS && dnsRecords.length > 0 ? `${dnsRecords.length} removed` : 'skipped'],
    ['Cloudflare', deleteTunnel ? 'deleted' : 'kept'],
    ['Local Files', deleteConfigFolder || deleteDockerCompose ? 'cleaned' : 'kept']
  ]);
}

main().catch(error => {
  ui.error(`Error: ${error.message}`);
  process.exit(1);
});
