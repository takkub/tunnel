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
    console.error('\n❌ Error: cloudflared is not installed!');
    console.error('Please install cloudflared first:');
    console.error('  winget install Cloudflare.cloudflared\n');
    console.error('Then restart your terminal and try again.\n');
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
      // หารูปแบบ: ID  NAME  CREATED  CONNECTIONS
      // ตัวอย่าง: b8b6a8f8-e2fa-4c9b-9282-398e82b0a214  tak  2024-01-01T00:00:00Z  0
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
    // ดึงข้อมูล tunnel เพื่อหา DNS records
    const result = execSync(`${cmd} tunnel route dns list`, { encoding: 'utf8' });
    const lines = result.split('\n');
    const records = [];

    // แยก DNS records ที่เกี่ยวข้องกับ tunnel นี้
    lines.forEach(line => {
      if (line.includes(tunnelName)) {
        // Extract hostname from line
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

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Cloudflare Tunnel - Delete Wizard    ║');
  console.log('╚════════════════════════════════════════╝\n');

  // ตรวจสอบว่ามีการส่ง argument มาหรือไม่
  let tunnelName = process.argv[2];

  if (!tunnelName) {
    console.log('Available tunnels:\n');
    const cmd = getCloudflaredCommand();
    exec(`${cmd} tunnel list`);

    console.log('\n' + '='.repeat(50));
    tunnelName = await question('\nEnter tunnel name to delete (or press Enter to cancel): ');

    if (!tunnelName) {
      console.log('Cancelled.');
      rl.close();
      return;
    }
  } else {
    console.log(`Deleting tunnel: ${tunnelName}\n`);
  }

  // ดึง tunnel ID
  console.log('Fetching tunnel ID...');
  const tunnelId = getTunnelId(tunnelName);
  if (tunnelId) {
    console.log(`✓ Found tunnel ID: ${tunnelId}`);
  } else {
    console.log(`⚠ Could not find tunnel ID for: ${tunnelName}`);
    console.log('Will try to delete using tunnel name...');
  }

  // ดึงข้อมูล DNS records
  console.log('\nFetching tunnel information...');
  const dnsRecords = getDNSRecords(tunnelName);

  console.log(`\n⚠️  WARNING: You are about to delete tunnel: ${tunnelName}`);
  if (dnsRecords.length > 0) {
    console.log('\nThe following DNS records will be removed:');
    dnsRecords.forEach(record => console.log(`  - ${record}`));
  }

  const confirm = await question('\nType "DELETE" to confirm: ');

  if (confirm !== 'DELETE') {
    console.log('Cancelled.');
    rl.close();
    return;
  }

  // ถามว่าจะลบอะไรบ้าง
  console.log('\n' + '='.repeat(50));
  console.log('Select what to delete:');
  console.log('='.repeat(50));

  const deleteDNS = (await question('Delete DNS routes? (y/n): ')).toLowerCase() === 'y';
  const deleteTunnel = (await question('Delete tunnel from Cloudflare? (y/n): ')).toLowerCase() === 'y';
  const deleteConfigFolder = (await question('Delete configuration folder? (y/n): ')).toLowerCase() === 'y';
  const deleteDockerCompose = (await question('Delete docker-compose file? (y/n): ')).toLowerCase() === 'y';

  const projectRoot = path.join(__dirname, '..');

  // [1/6] หา folder ที่เกี่ยวข้อง
  console.log('\n[1/6] Finding related configuration...');
  const tunnelsDir = path.join(projectRoot, 'tunnels');
  let configFolder = null;

  if (fs.existsSync(tunnelsDir)) {
    const folders = fs.readdirSync(tunnelsDir);
    for (const folder of folders) {
      const configPath = path.join(tunnelsDir, folder, 'config.yml');
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        // ตรวจสอบว่า config นี้เป็นของ tunnel ที่จะลบหรือไม่
        if (configContent.includes(tunnelName) || dnsRecords.some(record => configContent.includes(record))) {
          configFolder = folder;
          console.log(`✓ Found configuration in: tunnels/${folder}`);
          break;
        }
      }
    }
  }

  // [2/6] หยุด Docker containers
  console.log('\n[2/6] Stopping Docker containers...');
  const composeFiles = fs.existsSync(projectRoot) ? fs.readdirSync(projectRoot)
    .filter(f => f.startsWith('docker-compose-cloudflare-') && f.endsWith('.yml')) : [];

  let dockerComposeFile = null;
  composeFiles.forEach(file => {
    const filePath = path.join(projectRoot, file);
    if (configFolder && file.includes(configFolder)) {
      dockerComposeFile = file;
      console.log(`✓ Stopping container from: ${file}`);
      exec(`docker-compose -f "${filePath}" down`, true);
    }
  });

  // [3/6] ลบ DNS routes
  console.log('\n[3/6] Removing DNS routes...');
  const cmd = getCloudflaredCommand();
  if (deleteDNS && dnsRecords.length > 0) {
    for (const record of dnsRecords) {
      console.log(`  Removing: ${record}`);
      // ลองใช้ทั้ง tunnel ID และชื่อ
      const identifier = tunnelId || tunnelName;
      const result = exec(`${cmd} tunnel route dns delete ${identifier} ${record}`, true);
      if (result.success) {
        console.log(`  ✓ Deleted: ${record}`);
      } else {
        console.log(`  ⚠ Could not delete: ${record} (may not exist)`);
      }
    }
  } else if (!deleteDNS) {
    console.log('  ⊘ Skipped (user choice)');
  } else {
    console.log('  No DNS records found (or using CNAME directly)');
  }

  // [4/6] ลบ tunnel จาก Cloudflare
  console.log('\n[4/6] Deleting tunnel from Cloudflare...');
  if (deleteTunnel) {
    // ลองใช้ tunnel ID ก่อน ถ้าไม่ได้ค่อยใช้ชื่อ
    const identifier = tunnelId || tunnelName;
    console.log(`  Using identifier: ${identifier}`);

    // ลองลบด้วย -f flag ก่อน (force delete)
    let deleteResult = exec(`${cmd} tunnel delete -f ${identifier}`, true);

    if (!deleteResult.success) {
      // ถ้าไม่ได้ ลองไม่ใช้ -f flag
      console.log('  Retrying without force flag...');
      deleteResult = exec(`${cmd} tunnel delete ${identifier}`, true);
    }

    if (!deleteResult.success && tunnelId && tunnelId !== tunnelName) {
      // ถ้ายังไม่ได้และมี tunnel ID ลองใช้ชื่อแทน
      console.log('  Retrying with tunnel name...');
      deleteResult = exec(`${cmd} tunnel delete -f ${tunnelName}`, true);
    }

    if (deleteResult.success) {
      console.log('✓ Tunnel deleted from Cloudflare');
    } else {
      console.log('⚠ Could not delete tunnel');
      console.log('  Possible reasons:');
      console.log('  - Tunnel has active connections');
      console.log('  - Tunnel already deleted');
      console.log('  - Permission issues');
      console.log('\n  You can try manually:');
      console.log(`  cloudflared tunnel delete ${identifier}`);
      console.log('  Or delete from Cloudflare Dashboard');
    }
  } else {
    console.log('  ⊘ Skipped (user choice)');
  }

  // [5/6] ลบ configuration folder
  console.log('\n[5/6] Removing configuration files...');
  if (deleteConfigFolder && configFolder) {
    const configPath = path.join(tunnelsDir, configFolder);
    try {
      fs.rmSync(configPath, { recursive: true, force: true });
      console.log(`✓ Deleted: tunnels/${configFolder}/`);
    } catch (error) {
      console.log(`⚠ Could not delete folder: ${error.message}`);
    }
  } else if (!deleteConfigFolder) {
    console.log('  ⊘ Skipped (user choice)');
  } else {
    console.log('  No configuration folder found');
  }

  // [6/6] ลบ docker-compose file
  console.log('\n[6/6] Removing docker-compose file...');
  if (deleteDockerCompose && dockerComposeFile) {
    const composePath = path.join(projectRoot, dockerComposeFile);
    try {
      fs.unlinkSync(composePath);
      console.log(`✓ Deleted: ${dockerComposeFile}`);
    } catch (error) {
      console.log(`⚠ Could not delete file: ${error.message}`);
    }
  } else if (!deleteDockerCompose) {
    console.log('  ⊘ Skipped (user choice)');
  } else {
    console.log('  No docker-compose file found');
  }

  console.log('\n' + '='.repeat(50));
  console.log('✓ Cleanup complete!');
  console.log('='.repeat(50));
  console.log('\nSummary:');
  console.log(`  Tunnel: ${tunnelName}`);
  if (deleteDNS && dnsRecords.length > 0) {
    console.log(`  DNS Records: ${dnsRecords.length} removed`);
  } else if (!deleteDNS) {
    console.log(`  DNS Records: KEPT (skipped)`);
  }
  if (deleteTunnel) {
    console.log(`  Tunnel on Cloudflare: DELETED`);
  } else {
    console.log(`  Tunnel on Cloudflare: KEPT (skipped)`);
  }
  if (deleteConfigFolder && configFolder) {
    console.log(`  Config Folder: tunnels/${configFolder} - DELETED`);
  } else if (!deleteConfigFolder && configFolder) {
    console.log(`  Config Folder: tunnels/${configFolder} - KEPT (skipped)`);
  }
  if (deleteDockerCompose && dockerComposeFile) {
    console.log(`  Docker Compose: ${dockerComposeFile} - DELETED`);
  } else if (!deleteDockerCompose && dockerComposeFile) {
    console.log(`  Docker Compose: ${dockerComposeFile} - KEPT (skipped)`);
  }
  console.log('');

  rl.close();
}

main().catch(error => {
  console.error('Error:', error);
  rl.close();
  process.exit(1);
});

