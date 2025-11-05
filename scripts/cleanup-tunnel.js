const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
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

function safeDelete(filePath, description) {
  try {
    if (fs.existsSync(filePath)) {
      if (fs.statSync(filePath).isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
      success.push(`✓ ลบ ${description}`);
      return true;
    }
  } catch (error) {
    errors.push(`✗ ไม่สามารถลบ ${description}: ${error.message}`);
  }
  return false;
}

async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   ลบ Tunnel ทั้งหมด                   ║');
  console.log('╚════════════════════════════════════════╝\n');

  // แสดงรายการ tunnels ที่มี
  console.log('📋 Tunnels ที่มีอยู่:\n');

  const tunnelsDir = path.join(projectRoot, 'tunnels');
  if (fs.existsSync(tunnelsDir)) {
    const folders = fs.readdirSync(tunnelsDir).filter(f => {
      return fs.statSync(path.join(tunnelsDir, f)).isDirectory();
    });

    if (folders.length > 0) {
      folders.forEach((folder, index) => {
        console.log(`  ${index + 1}. ${folder}`);
      });
      console.log('');
    } else {
      console.log('  (ไม่พบ tunnel)\n');
    }
  }

  // ถามชื่อ tunnel ที่ต้องการลบ
  const tunnelName = await question('ชื่อ tunnel ที่ต้องการลบ (เช่น app, office): ');

  if (!tunnelName) {
    console.log('\n❌ กรุณาระบุชื่อ tunnel\n');
    rl.close();
    process.exit(1);
  }

  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║   ลบทุกอย่างของ: ${tunnelName.padEnd(22)} ║`);
  console.log(`╚════════════════════════════════════════╝\n`);

  // ยืนยันการลบ
  const confirm = await question(`⚠️  ต้องการลบ "${tunnelName}" ทุกอย่างจริงหรือ? (yes/no): `);

  if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
    console.log('\n❌ ยกเลิกการลบ\n');
    rl.close();
    process.exit(0);
  }

  console.log('\n🚀 เริ่มทำงาน...\n');

  // [1] หยุด Docker Container
  console.log('[1/5] 🛑 หยุด Docker Container...');
  const dockerFile = `docker-compose-cloudflare-${tunnelName}.yml`;
  const dockerPath = path.join(projectRoot, dockerFile);

  if (fs.existsSync(dockerPath)) {
    const stopped = exec(`docker-compose -f "${dockerPath}" down`);
    if (stopped !== null) {
      success.push('✓ หยุด Docker container');
    } else {
      errors.push('✗ ไม่สามารถหยุด Docker container (อาจหยุดอยู่แล้ว)');
    }
  } else {
    console.log('  ⊘ ไม่พบ docker-compose file');
  }

  // ตรวจสอบ containers ที่ค้างอยู่
  const containerCheck = exec(`docker ps -a --filter name=cloudflared-tunnel-${tunnelName} --format "{{.ID}}"`);
  if (containerCheck && typeof containerCheck === 'string' && containerCheck.trim()) {
    const containerIds = containerCheck.trim().split('\n');
    containerIds.forEach(id => {
      exec(`docker stop ${id}`);
      exec(`docker rm ${id}`);
    });
    success.push(`✓ ทำความสะอาด ${containerIds.length} container(s) ที่ค้างอยู่`);
  }
  console.log('');

  // [2] หา Tunnel ID
  console.log('[2/5] 🔍 หา Tunnel ID...');
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
          success.push(`✓ พบ tunnel: ${match[2]} (${tunnelId})`);
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
          success.push(`✓ พบ tunnel ID จากไฟล์: ${tunnelId}`);
        }
      }
    }
  } catch (error) {
    errors.push('✗ ไม่มี cloudflared ติดตั้ง - ข้ามการลบ tunnel จาก Cloudflare');
  }

  if (!tunnelId) {
    console.log('  ⊘ ไม่พบ tunnel ID (อาจถูกลบไปแล้ว)');
  }
  console.log('');

  // [3] ลบ DNS Routes และ CNAME Records
  console.log('[3/5] 🌐 ลบ DNS Routes และ CNAME Records...');
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
        console.log(`  ✓ พบ domain จาก config: ${domain}`);
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
                success.push(`✓ ลบ DNS route: ${domain}`);
              }
            }
          }
        }

        if (deletedCount > 0) {
          console.log(`  ✓ ลบ DNS routes: ${deletedCount} รายการ`);
        } else {
          console.log('  ⊘ ไม่พบ DNS routes');
        }
      }
    } catch (error) {
      errors.push('✗ ไม่สามารถลบ DNS routes');
    }

    // ลบ CNAME records ผ่าน API
    if (domainsToDelete.length > 0) {
      console.log('\n  🔄 กำลังลบ CNAME records ผ่าน Cloudflare API...');
      console.log(`  📋 Domains ที่ต้องลบ: ${domainsToDelete.join(', ')}`);
      console.log(`  🔑 Tunnel ID: ${tunnelId}\n`);

      try {
        // ลบแต่ละ domain ทีละตัว
        const { deleteDnsRecord, listDnsRecords } = require('./cloudflare-api');
        const apiToken = process.env.CLOUDFLARE_API_TOKEN;
        const zoneId = process.env.ZONE_ID;

        if (!apiToken || !zoneId) {
          console.log('  ⚠️  ไม่พบ CLOUDFLARE_API_TOKEN หรือ ZONE_ID ใน .env');
          console.log('  💡 กรุณาตั้งค่า .env เพื่อลบ CNAME อัตโนมัติ\n');
          console.log('  📝 หรือลบ CNAME records ด้วยตนเอง:');
          console.log('     https://dash.cloudflare.com/ → DNS → Records');
          domainsToDelete.forEach(d => console.log(`     • ${d}`));

          errors.push(`⚠️  ไม่สามารถลบ CNAME ผ่าน API: ${domainsToDelete.join(', ')}`);
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
              console.log(`  🗑️  กำลังลบ: ${record.name}`);
              const deleted = await deleteDnsRecord(zoneId, record.id, apiToken);
              if (deleted) {
                deletedCount++;
                success.push(`✓ ลบ CNAME: ${record.name}`);
                console.log(`     ✅ สำเร็จ`);
              } else {
                console.log(`     ❌ ล้มเหลว`);
              }
            } else {
              console.log(`  ⊘ ไม่พบ CNAME record สำหรับ: ${domain}`);
            }
          }

          if (deletedCount > 0) {
            console.log(`\n  ✅ ลบ CNAME records สำเร็จ: ${deletedCount} รายการ`);
          } else {
            console.log(`\n  ⊘ ไม่พบ CNAME records ที่ต้องลบ`);
          }
        }
      } catch (e) {
        console.log('  ❌ Error:', e.message);
        console.log('  📝 กรุณาลบ CNAME records ด้วยตนเอง:');
        console.log('     https://dash.cloudflare.com/ → DNS → Records');
        domainsToDelete.forEach(d => console.log(`     • ${d}`));

        errors.push(`⚠️  Error ลบ CNAME: ${e.message}`);
      }
    }
  } else {
    console.log('  ⊘ ข้ามเนื่องจากไม่มี tunnel ID');
  }
  console.log('');

  // [4] ลบ Tunnel จาก Cloudflare
  console.log('[4/5] ☁️  ลบ Tunnel จาก Cloudflare...');
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
      success.push('✓ ลบ tunnel จาก Cloudflare');
    } else {
      errors.push(`✗ ไม่สามารถลบ tunnel จาก Cloudflare (ID: ${tunnelId})`);
    }
  } else {
    console.log('  ⊘ ข้ามเนื่องจากไม่มี tunnel ID');
  }
  console.log('');

  // [5] ลบไฟล์ Local
  console.log('[5/5] 📁 ลบไฟล์ Local...');

  // ลบ config folder
  const configFolder = path.join(projectRoot, 'tunnels', tunnelName);
  safeDelete(configFolder, `โฟลเดอร์ config (tunnels/${tunnelName}/)`);

  // ลบ docker-compose file
  safeDelete(dockerPath, `docker-compose file (${dockerFile})`);

  console.log('');

  // สรุปผลลัพธ์
  console.log('═'.repeat(50));
  console.log('📊 สรุปผลการทำงาน');
  console.log('═'.repeat(50));
  console.log('');

  if (success.length > 0) {
    console.log('✅ สำเร็จ:');
    success.forEach(msg => console.log(`   ${msg}`));
    console.log('');
  }

  if (errors.length > 0) {
    console.log('⚠️  ข้อผิดพลาด:');
    errors.forEach(msg => console.log(`   ${msg}`));
    console.log('');

    console.log('💡 แนวทางแก้ไข:');

    // แนะนำวิธีแก้ไขตาม error ที่เกิด
    if (errors.some(e => e.includes('CNAME') || e.includes('.env'))) {
      console.log('   • ตรวจสอบไฟล์ .env:');
      console.log('     CLOUDFLARE_API_TOKEN=your-api-token');
      console.log('     ZONE_ID=your-zone-id');
      console.log('');
      console.log('   • หรือลบ CNAME ด้วยตนเอง:');
      console.log('     https://dash.cloudflare.com/ → DNS → Records');
      console.log('');
    }

    if (errors.some(e => e.includes('Cloudflare') && !e.includes('CNAME'))) {
      console.log('   • ลบ tunnel ด้วยตนเอง:');
      if (tunnelId) {
        console.log(`     cloudflared tunnel delete -f ${tunnelId}`);
      }
      console.log('   • หรือลบผ่าน Dashboard:');
      console.log('     https://dash.cloudflare.com/');
      console.log('     → Traffic → Cloudflare Tunnel → Delete');
      console.log('');
    }

    if (errors.some(e => e.includes('cloudflared ติดตั้ง'))) {
      console.log('   • ติดตั้ง cloudflared:');
      console.log('     winget install Cloudflare.cloudflared');
      console.log('   • จากนั้นเปิด terminal ใหม่และลองอีกครั้ง');
      console.log('');
    }

    console.log('');
  }

  // แสดงสถานะสุดท้าย
  console.log('═'.repeat(50));
  if (errors.length === 0) {
    console.log('🎉 ลบทุกอย่างเสร็จสมบูรณ์!');
  } else {
    console.log(`⚠️  ลบเสร็จบางส่วน (มี ${errors.length} ข้อผิดพลาด)`);
  }
  console.log('═'.repeat(50));
  console.log('');

  // Close readline interface
  rl.close();

  // Exit code
  process.exit(errors.length > 0 ? 1 : 0);
}

// รัน main function
main().catch(error => {
  console.error('\n❌ Fatal Error:', error);
  rl.close();
  process.exit(1);
});

