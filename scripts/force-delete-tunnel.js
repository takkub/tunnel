const { execSync } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

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
    console.error('\n❌ Error: cloudflared is not installed!');
    console.error('Please install cloudflared first:');
    console.error('  winget install Cloudflare.cloudflared\n');
    console.error('Then restart your terminal and try again.\n');
    process.exit(1);
  }
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Force Delete Tunnel Wizard           ║');
  console.log('╚════════════════════════════════════════╝\n');

  const tunnelName = process.argv[2];
  if (!tunnelName) {
    console.log('Usage: npm run force-delete <tunnel-name>');
    console.log('Example: npm run force-delete tak\n');

    console.log('Available shortcuts:');
    console.log('  npm run force-delete:tak');
    console.log('  npm run force-delete:app');
    console.log('  npm run force-delete:office');
    console.log('  npm run force-delete:home');
    rl.close();
    return;
  }

  console.log(`⚠️  FORCE DELETE MODE`);
  console.log(`This will attempt to delete: ${tunnelName}`);
  console.log('This is more aggressive than regular delete.\n');

  const confirm = await question('Type "FORCE DELETE" to confirm: ');
  if (confirm !== 'FORCE DELETE') {
    console.log('Cancelled.');
    rl.close();
    return;
  }

  const cmd = getCloudflaredCommand();
  const projectRoot = path.join(__dirname, '..');

  // [1/5] หยุด Docker containers
  console.log('\n[1/5] Stopping Docker containers...');
  const dockerFile = `docker-compose-cloudflare-${tunnelName}.yml`;
  const dockerPath = path.join(projectRoot, dockerFile);

  if (fs.existsSync(dockerPath)) {
    const result = exec(`docker-compose -f "${dockerPath}" down`, true);
    if (result.success) {
      console.log('✓ Docker container stopped');
    } else {
      console.log('⚠ No running container or already stopped');
    }
  } else {
    console.log('⊘ No docker-compose file found');
  }

  // ตรวจสอบและหยุด containers ที่ค้างอยู่
  console.log('Checking for hanging containers...');
  const psResult = exec(`docker ps -a --filter name=cloudflared-tunnel-${tunnelName} --format "{{.ID}}"`, true);
  if (psResult.success && psResult.output.trim()) {
    const containerIds = psResult.output.trim().split('\n');
    for (const id of containerIds) {
      console.log(`  Stopping container: ${id}`);
      exec(`docker stop ${id}`, true);
      exec(`docker rm ${id}`, true);
    }
    console.log('✓ Cleaned up hanging containers');
  }

  // [2/5] หา tunnel ID
  console.log('\n[2/5] Finding tunnel ID...');
  let tunnelId = null;

  const listResult = exec(`${cmd} tunnel list`, true);
  if (listResult.success) {
    const lines = listResult.output.split('\n');
    for (const line of lines) {
      const match = line.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\s+(\S+)/i);
      if (match && match[2] === tunnelName) {
        tunnelId = match[1];
        console.log(`✓ Found tunnel ID: ${tunnelId}`);
        break;
      }
    }
  }

  // ถ้าหาไม่เจอจาก list ลองหาจากไฟล์
  if (!tunnelId) {
    console.log('Searching in config files...');
    const tunnelFolder = path.join(projectRoot, 'tunnels', tunnelName);
    if (fs.existsSync(tunnelFolder)) {
      const jsonFiles = fs.readdirSync(tunnelFolder)
        .filter(f => f.endsWith('.json') && f.match(/[a-f0-9-]{36}\.json/));
      if (jsonFiles.length > 0) {
        tunnelId = jsonFiles[0].replace('.json', '');
        console.log(`✓ Found tunnel ID from file: ${tunnelId}`);
      }
    }
  }

  if (!tunnelId) {
    console.log('⚠ Could not find tunnel ID, will use tunnel name');
    tunnelId = tunnelName;
  }

  // [3/5] ลบ DNS routes ทั้งหมด
  console.log('\n[3/5] Deleting all DNS routes...');
  const routeResult = exec(`${cmd} tunnel route dns list`, true);
  if (routeResult.success) {
    const lines = routeResult.output.split('\n');
    let deletedCount = 0;

    for (const line of lines) {
      // หา domain ที่เกี่ยวข้องกับ tunnel นี้
      if (line.includes(tunnelId) || line.includes(tunnelName)) {
        const match = line.match(/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (match) {
          const domain = match[1];
          console.log(`  Deleting: ${domain}`);
          const delResult = exec(`${cmd} tunnel route dns delete ${tunnelId} ${domain}`, true);
          if (delResult.success) {
            console.log(`  ✓ Deleted: ${domain}`);
            deletedCount++;
          }
        }
      }
    }

    if (deletedCount > 0) {
      console.log(`✓ Deleted ${deletedCount} DNS route(s)`);
    } else {
      console.log('⊘ No DNS routes found');
    }
  } else {
    console.log('⚠ Could not list DNS routes');
  }

  // [4/5] ลบ tunnel จาก Cloudflare (หลายวิธี)
  console.log('\n[4/5] Force deleting tunnel from Cloudflare...');

  let deleted = false;

  // ลองวิธีที่ 1: ใช้ tunnel ID + force flag
  console.log('  Attempt 1: Using tunnel ID with force flag...');
  let result = exec(`${cmd} tunnel delete -f ${tunnelId}`, true);
  if (result.success) {
    console.log('✓ Tunnel deleted successfully (method 1)');
    deleted = true;
  } else {
    // ลองวิธีที่ 2: ใช้ tunnel name + force flag
    console.log('  Attempt 2: Using tunnel name with force flag...');
    result = exec(`${cmd} tunnel delete -f ${tunnelName}`, true);
    if (result.success) {
      console.log('✓ Tunnel deleted successfully (method 2)');
      deleted = true;
    } else {
      // ลองวิธีที่ 3: ไม่ใช้ force flag
      console.log('  Attempt 3: Without force flag...');
      result = exec(`${cmd} tunnel delete ${tunnelId}`, true);
      if (result.success) {
        console.log('✓ Tunnel deleted successfully (method 3)');
        deleted = true;
      }
    }
  }

  if (!deleted) {
    console.log('\n❌ Could not delete tunnel automatically');
    console.log('\n📋 Manual deletion required:');
    console.log('   1. Go to: https://dash.cloudflare.com/');
    console.log('   2. Select your domain');
    console.log('   3. Go to: Traffic → Cloudflare Tunnel');
    console.log(`   4. Find tunnel: ${tunnelName} (ID: ${tunnelId})`);
    console.log('   5. Click ... → Delete');
    console.log('\n   Or try command:');
    console.log(`   cloudflared tunnel delete ${tunnelId}`);
  }

  // [5/5] ลบ local files
  console.log('\n[5/5] Cleaning up local files...');

  const configFolder = path.join(projectRoot, 'tunnels', tunnelName);
  if (fs.existsSync(configFolder)) {
    try {
      fs.rmSync(configFolder, { recursive: true, force: true });
      console.log(`✓ Deleted: tunnels/${tunnelName}/`);
    } catch (error) {
      console.log(`⚠ Could not delete folder: ${error.message}`);
    }
  } else {
    console.log('⊘ No config folder found');
  }

  if (fs.existsSync(dockerPath)) {
    try {
      fs.unlinkSync(dockerPath);
      console.log(`✓ Deleted: ${dockerFile}`);
    } catch (error) {
      console.log(`⚠ Could not delete file: ${error.message}`);
    }
  } else {
    console.log('⊘ No docker-compose file found');
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('✓ Force Delete Complete!');
  console.log('='.repeat(50));
  console.log(`\nTunnel: ${tunnelName}`);
  console.log(`ID: ${tunnelId}`);
  console.log(`Cloudflare Status: ${deleted ? 'DELETED' : 'MANUAL DELETION REQUIRED'}`);
  console.log(`Local Files: CLEANED UP`);
  console.log('');

  if (!deleted) {
    console.log('⚠️  Please delete the tunnel manually from Cloudflare Dashboard');
    console.log('   Dashboard: https://dash.cloudflare.com/');
    console.log('');
  }

  rl.close();
}

main().catch(error => {
  console.error('Error:', error);
  rl.close();
  process.exit(1);
});

