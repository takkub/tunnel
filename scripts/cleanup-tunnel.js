require('dotenv').config(); // Load env first thing!
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const ui = require('./ui-helper');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(`${ui.c.cyan}${ui.icons.arrow}${ui.c.reset} ${query}`, resolve));
}

const errors = [];
const success = [];
const projectRoot = path.join(__dirname, '..');

// ฟังก์ชันช่วยเหลือ
function exec(command, silent = true) {
  try {
    const result = execSync(command, {
      stdio: silent ? 'pipe' : 'inherit',
      encoding: 'utf8',
      windowsHide: true
    });
    return result || true;
  } catch (error) {
    return null;
  }
}

// รวบรวมรายการ tunnels จาก cloudflared และ config เพื่อให้เลือกได้
function collectTunnelChoices() {
  const choices = [];
  const tunnelsDir = path.join(projectRoot, 'tunnels');

  // อ่านจาก cloudflared tunnel list
  try {
    const list = exec('cloudflared tunnel list');
    if (list) {
      const lines = list.split('\n');
      for (const line of lines) {
        const match = line.match(/([a-f0-9-]{36})\s+(\S+)/i);
        if (match) {
          choices.push({ id: match[1], name: match[2], domain: null, source: 'cloudflared' });
        }
      }
    }
  } catch (_) { }

  // เติมข้อมูล domain จากโฟลเดอร์ config
  if (fs.existsSync(tunnelsDir)) {
    const folders = fs.readdirSync(tunnelsDir).filter(f => fs.statSync(path.join(tunnelsDir, f)).isDirectory());
    for (const folder of folders) {
      const configPath = path.join(tunnelsDir, folder, 'config.yml');
      let hostname = null;
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, 'utf8');
          const m = content.match(/hostname:\s+([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          if (m) hostname = m[1];
        } catch (_) { }
      }
      // รวมกับที่มีอยู่แล้วถ้าชื่อซ้ำ
      const existing = choices.find(c => c.name === folder);
      if (existing) {
        if (hostname) existing.domain = hostname;
      } else {
        choices.push({ id: null, name: folder, domain: hostname, source: 'folder' });
      }
    }
  }

  // กำจัด duplicates โดยชื่อ tunnel
  const uniq = [];
  const seen = new Set();
  for (const c of choices) {
    const key = c.name;
    if (!seen.has(key)) { seen.add(key); uniq.push(c); }
  }
  return uniq;
}

function safeDelete(filePath, description) {
  try {
    if (fs.existsSync(filePath)) {
      if (fs.statSync(filePath).isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
      success.push(`Deleted ${description}`);
      return true;
    }
  } catch (error) {
    errors.push(`Could not delete ${description}: ${error.message}`);
  }
  return false;
}

function renderChoices(choices, index) {
  const width = ui.getWidth();
  const boxWidth = Math.min(Math.max(60, width - 4), 120);

  console.clear();

  // Header
  console.log(`${ui.c.cyan}${ui.c.bold}╔${'═'.repeat(boxWidth - 2)}╗${ui.c.reset}`);
  console.log(`${ui.c.cyan}${ui.c.bold}║${ui.c.reset}  ${ui.c.brightCyan}Select Tunnel to Cleanup${ui.c.reset}${' '.repeat(boxWidth - 26)}${ui.c.cyan}${ui.c.bold}║${ui.c.reset}`);
  console.log(`${ui.c.cyan}${ui.c.bold}╚${'═'.repeat(boxWidth - 2)}╝${ui.c.reset}`);

  console.log(`${ui.c.dim}Use Up/Down arrows to navigate, Enter to select, Esc to cancel${ui.c.reset}`);
  console.log('');

  // Table Header
  const nameW = 20;
  const domainW = 30;
  const idW = boxWidth - nameW - domainW - 8;

  console.log(`  ${ui.c.bold}${ui.c.white}${'NAME'.padEnd(nameW)}${'DOMAIN'.padEnd(domainW)}${'ID'.padEnd(idW)}${ui.c.reset}`);
  console.log(`  ${ui.c.dim}${'─'.repeat(boxWidth - 4)}${ui.c.reset}`);

  // Rows
  choices.forEach((c, i) => {
    const name = (c.name || '').slice(0, nameW - 1).padEnd(nameW);
    const domain = (c.domain || '-').slice(0, domainW - 1).padEnd(domainW);
    const id = (c.id || '-').slice(0, idW - 1).padEnd(idW);

    if (i === index) {
      console.log(`${ui.c.cyan}${ui.icons.arrow} ${ui.c.inverse} ${name}${domain}${id} ${ui.c.reset}`);
    } else {
      console.log(`    ${ui.c.dim}${name}${domain}${id}${ui.c.reset}`);
    }
  });
}

async function selectChoiceInteractive(choices) {
  return new Promise(resolve => {
    let index = 0;
    renderChoices(choices, index);

    // Enable raw mode for keypress
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onData = (key) => {
      // Handle special keys
      if (key === '\u0003') { // Ctrl+C
        process.stdin.removeListener('data', onData);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        rl.close();
        process.exit(1);
      }
      if (key === '\r') { // Enter
        process.stdin.removeListener('data', onData);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        console.clear();
        resolve(choices[index]);
        return;
      }
      if (key === '\u001b') { // ESC
        process.stdin.removeListener('data', onData);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        console.clear();
        rl.close();
        process.exit(0);
      }
      // Arrow keys come as escape sequences
      // Up: \u001b[A, Down: \u001b[B
      if (key === '\u001b[A') { // Up
        index = (index - 1 + choices.length) % choices.length;
        renderChoices(choices, index);
      } else if (key === '\u001b[B') { // Down
        index = (index + 1) % choices.length;
        renderChoices(choices, index);
      }
    };

    process.stdin.on('data', onData);
  });
}

async function main() {
  // ไม่ต้องใช้ header() ตรงนี้เพราะจะแสดงใน selectChoiceInteractive

  // แสดงรายการ tunnels ที่มี (จาก cloudflared + config)
  const choices = collectTunnelChoices();
  if (!choices.length) {
    ui.fail('No tunnels found');
    rl.close();
    process.exit(0);
  }

  // Interactive selection with arrow keys
  const picked = await selectChoiceInteractive(choices);
  const tunnelName = picked.name;

  ui.warningHeader('Cleanup Tunnel', `Removing: ${tunnelName}`);
  ui.warning('You are about to delete everything associated with this tunnel.');
  console.log('');

  // ยืนยันการลบ
  const confirm = await question(`Type "${ui.c.red}yes${ui.c.reset}" to confirm: `);

  if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
    ui.warning('Cancelled');
    rl.close();
    process.exit(0);
  }

  // [1] หยุด Docker Container
  ui.step(1, 5, `${ui.icons.docker} Stopping Docker containers...`);
  const dockerFile = `docker-compose-cloudflare-${tunnelName}.yml`;
  const dockerPath = path.join(projectRoot, dockerFile);

  if (fs.existsSync(dockerPath)) {
    const stopped = exec(`docker compose -f "${dockerPath}" down`);
    if (stopped !== null) {
      ui.subStep('Stopped Docker container', 'success');
      success.push('Stopped Docker container');
    } else {
      ui.subStep('Could not stop container (or already stopped)', 'error');
      errors.push('Could not stop Docker container');
    }
  } else {
    ui.subStep('No docker-compose file found', 'skip');
  }

  // ตรวจสอบ containers ที่ค้างอยู่
  const containerCheck = exec(`docker ps -a --filter name=cloudflared-tunnel-${tunnelName} --format "{{.ID}}"`);
  if (containerCheck && typeof containerCheck === 'string' && containerCheck.trim()) {
    const containerIds = containerCheck.trim().split('\n');
    containerIds.forEach(id => {
      exec(`docker stop ${id}`);
      exec(`docker rm ${id}`);
    });
    ui.subStep(`Cleaned up ${containerIds.length} hanging container(s)`, 'success');
    success.push(`Cleaned up ${containerIds.length} hanging container(s)`);
  }

  // [2] หา Tunnel ID
  ui.step(2, 5, `${ui.icons.dns} Finding Tunnel ID...`);
  let tunnelId = null;

  try {
    execSync('cloudflared --version', { stdio: 'pipe' });

    const list = exec('cloudflared tunnel list');
    if (list) {
      const lines = list.split('\n');
      for (const line of lines) {
        const match = line.match(/([a-f0-9-]{36})\s+(\S+)/i);
        if (match && match[2].includes(tunnelName)) {
          tunnelId = match[1];
          ui.subStep(`Found tunnel: ${ui.c.cyan}${match[2]}${ui.c.reset}`, 'success');
          success.push(`Found tunnel: ${match[2]} (${tunnelId})`);
          break;
        }
      }
    }

    // ถ้าไม่เจอจาก list ลองหาจากไฟล์
    if (!tunnelId) {
      const tunnelFolder = path.join(projectRoot, 'tunnels', tunnelName);
      if (fs.existsSync(tunnelFolder)) {
        const jsonFiles = fs.readdirSync(tunnelFolder)
          .filter(f => f.endsWith('.json') && f.match(/[a-f0-9-]{36}\.json/));
        if (jsonFiles.length > 0) {
          tunnelId = jsonFiles[0].replace('.json', '');
          ui.subStep(`Found tunnel ID from file: ${ui.c.cyan}${tunnelId}${ui.c.reset}`, 'success');
          success.push(`Found tunnel ID from file: ${tunnelId}`);
        }
      }
    }
  } catch (error) {
    ui.subStep('cloudflared not installed, skipping Cloudflare deletion', 'error');
    errors.push('cloudflared not installed');
  }

  if (!tunnelId) {
    ui.subStep('Tunnel ID not found (may already be deleted)', 'skip');
  }

  // [3] ลบ DNS Routes และ CNAME Records
  ui.step(3, 5, `${ui.icons.globe} Removing DNS Routes & CNAMEs...`);
  const domainsToDelete = [];

  // หา domain จาก config.yml ก่อน (เพื่อให้ลบ CNAME ได้แม้ไม่มี DNS routes)
  const configPath = path.join(projectRoot, 'tunnels', tunnelName, 'config.yml');
  if (fs.existsSync(configPath)) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const hostnameMatch = configContent.match(/hostname:\s+([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (hostnameMatch) {
        const domain = hostnameMatch[1];
        domainsToDelete.push(domain);
        ui.subStep(`Found domain in config: ${ui.c.yellow}${domain}${ui.c.reset}`, 'success');
      }
    } catch (e) {
      // ไม่สำคัญถ้าอ่านไม่ได้
    }
  }

  if (tunnelId) {
    try {
      const routes = exec('cloudflared tunnel route dns list');
      if (routes) {
        const lines = routes.split('\n');
        let deletedCount = 0;

        for (const line of lines) {
          if (line.includes(tunnelId) || line.includes(tunnelName)) {
            const match = line.match(/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (match) {
              const domain = match[1];
              if (!domainsToDelete.includes(domain)) {
                domainsToDelete.push(domain);
              }

              // ลบ route mapping
              const deleted = exec(`cloudflared tunnel route dns delete ${tunnelId} ${domain}`);
              if (deleted !== null) {
                deletedCount++;
                ui.subStep(`Deleted DNS route: ${domain}`, 'success');
                success.push(`Deleted DNS route: ${domain}`);
              }
            }
          }
        }

        if (deletedCount === 0) {
          ui.subStep('No active DNS routes found', 'skip');
        }
      }
    } catch (error) {
      ui.subStep('Could not list/delete DNS routes', 'error');
      errors.push('Could not delete DNS routes');
    }

    // ลบ CNAME records ผ่าน API
    if (domainsToDelete.length > 0) {
      ui.info('Attempting to remove CNAME records via Cloudflare API...');

      try {
        // ลบแต่ละ domain ทีละตัว
        const { deleteDnsRecord, listDnsRecords } = require('./cloudflare-api');
        const apiToken = process.env.CLOUDFLARE_API_TOKEN;
        const zoneId = process.env.ZONE_ID;

        if (!apiToken || !zoneId) {
          ui.warning('Missing CLOUDFLARE_API_TOKEN or ZONE_ID in .env');
          ui.tip('Set these in .env to enable automatic CNAME deletion');
          console.log('');
          ui.box('Manual Deletion Required', [
            'Please delete CNAME records manually:',
            `${ui.c.cyan}https://dash.cloudflare.com/ → DNS → Records${ui.c.reset}`,
            ...domainsToDelete.map(d => `• ${d}`)
          ]);
          errors.push(`Could not delete CNAMEs (missing .env): ${domainsToDelete.join(', ')}`);
        } else {
          // ดึงรายการ DNS records
          const allRecords = await listDnsRecords(zoneId, apiToken);
          let deletedCount = 0;

          // ลบ CNAME ที่ตรงกับ domains ที่เราต้องการ
          for (const domain of domainsToDelete) {
            const record = allRecords.find(r =>
              r.type === 'CNAME' &&
              r.name === domain &&
              r.content.includes('cfargotunnel.com')
            );

            if (record) {
              ui.subStep(`Deleting CNAME: ${domain}`, 'pending');
              const deleted = await deleteDnsRecord(zoneId, record.id, apiToken);
              if (deleted) {
                deletedCount++;
                success.push(`Deleted CNAME: ${record.name}`);
                ui.subStep(`Deleted CNAME: ${domain}`, 'success');
              } else {
                ui.subStep(`Failed to delete CNAME: ${domain}`, 'error');
              }
            } else {
              ui.subStep(`CNAME not found for: ${domain}`, 'skip');
            }
          }

          if (deletedCount > 0) {
            success.push(`Deleted ${deletedCount} CNAME records`);
          }
        }
      } catch (e) {
        ui.error(`API Error: ${e.message}`);
        errors.push(`API Error deleting CNAME: ${e.message}`);
      }
    }
  } else {
    ui.subStep('Skipping DNS cleanup (no tunnel ID)', 'skip');
  }

  // [4] ลบ Tunnel จาก Cloudflare
  ui.step(4, 5, `${ui.icons.cloud} Deleting Tunnel from Cloudflare...`);
  if (tunnelId) {
    let deleted = false;

    // ลองวิธีที่ 1: ใช้ tunnel ID + force flag
    try {
      execSync(`cloudflared tunnel delete -f ${tunnelId}`, {
        stdio: 'pipe',
        encoding: 'utf8',
        windowsHide: true
      });
      deleted = true;
    } catch (e1) {
      // ลองวิธีที่ 2: ใช้ tunnel ID แบบปกติ
      try {
        execSync(`cloudflared tunnel delete ${tunnelId}`, {
          stdio: 'pipe',
          encoding: 'utf8',
          windowsHide: true
        });
        deleted = true;
      } catch (e2) {
        // ลองวิธีที่ 3: ใช้ชื่อ tunnel
        try {
          execSync(`cloudflared tunnel delete -f ${tunnelName}`, {
            stdio: 'pipe',
            encoding: 'utf8',
            windowsHide: true
          });
          deleted = true;
        } catch (e3) {
          // ทุกวิธีล้มเหลว
        }
      }
    }

    if (deleted) {
      ui.subStep('Tunnel deleted from Cloudflare', 'success');
      success.push('Deleted tunnel from Cloudflare');
    } else {
      ui.subStep('Could not delete tunnel from Cloudflare', 'error');
      errors.push(`Could not delete tunnel from Cloudflare (ID: ${tunnelId})`);
    }
  } else {
    ui.subStep('Skipping tunnel deletion (no ID)', 'skip');
  }

  // [5] ลบไฟล์ Local
  ui.step(5, 5, `${ui.icons.trash} Removing Local Files...`);

  // ลบ config folder
  const configFolder = path.join(projectRoot, 'tunnels', tunnelName);
  safeDelete(configFolder, `config folder (tunnels/${tunnelName}/)`);

  // ลบ docker-compose file
  safeDelete(dockerPath, `docker-compose file (${dockerFile})`);

  // สรุปผลลัพธ์
  if (errors.length === 0) {
    ui.complete('Cleanup Complete!');
  } else {
    console.log('');
    ui.warning(`Cleanup completed with ${errors.length} errors`);
  }

  ui.summaryBox('Summary', [
    ['Tunnel', tunnelName],
    ['DNS/CNAME', success.some(s => s.includes('CNAME') || s.includes('DNS')) ? 'Cleaned' : 'Check manually'],
    ['Cloudflare', success.some(s => s.includes('Deleted tunnel')) ? 'Deleted' : 'Check manually'],
    ['Local Files', 'Cleaned']
  ]);

  if (errors.length > 0) {
    console.log('');
    ui.section('Issues Found');
    errors.forEach(e => console.log(`  ${ui.c.red}•${ui.c.reset} ${e}`));
  }

  rl.close();
}

// รัน main function
main().catch(error => {
  ui.error(`Fatal Error: ${error.message}`);
  rl.close();
  process.exit(1);
});
