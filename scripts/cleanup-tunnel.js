const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ตรวจสอบว่ามี argument
const tunnelName = process.argv[2];
if (!tunnelName) {
  console.log('\n❌ กรุณาระบุชื่อ tunnel ที่ต้องการลบ');
  console.log('\nตัวอย่าง:');
  console.log('  npm run cleanup tak');
  console.log('  npm run cleanup home');
  console.log('  npm run cleanup app');
  console.log('  npm run cleanup office\n');
  process.exit(1);
}

console.log('\n╔════════════════════════════════════════╗');
console.log(`║   ลบทุกอย่างของ: ${tunnelName.padEnd(22)} ║`);
console.log('╚════════════════════════════════════════╝\n');

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

// เริ่มต้นทำงาน
console.log('🚀 เริ่มทำงาน...\n');

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

// [3] ลบ DNS Routes
console.log('[3/5] 🌐 ลบ DNS Routes...');
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
            const deleted = exec(`cloudflared tunnel route dns delete ${tunnelId} ${domain}`);
            if (deleted !== null) {
              deletedCount++;
            }
          }
        }
      }

      if (deletedCount > 0) {
        success.push(`✓ ลบ DNS routes: ${deletedCount} รายการ`);
      } else {
        console.log('  ⊘ ไม่พบ DNS routes');
      }
    }
  } catch (error) {
    errors.push('✗ ไม่สามารถลบ DNS routes');
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
  if (errors.some(e => e.includes('Cloudflare'))) {
    console.log('   • ลบ tunnel ด้วยตนเอง:');
    if (tunnelId) {
      console.log(`     cloudflared tunnel delete -f ${tunnelId}`);
    }
    console.log('   • หรือลบผ่าน Dashboard:');
    console.log('     https://dash.cloudflare.com/');
    console.log('     → Traffic → Cloudflare Tunnel → Delete');
  }

  if (errors.some(e => e.includes('cloudflared ติดตั้ง'))) {
    console.log('   • ติดตั้ง cloudflared:');
    console.log('     winget install Cloudflare.cloudflared');
    console.log('   • จากนั้นเปิด terminal ใหม่และลองอีกครั้ง');
  }

  console.log('');
}

// แสดงสถานะสุดท้าย
const totalTasks = 5;
const completedTasks = success.length;

console.log('═'.repeat(50));
if (errors.length === 0) {
  console.log('🎉 ลบทุกอย่างเสร็จสมบูรณ์!');
} else {
  console.log(`⚠️  ลบเสร็จ ${completedTasks}/${totalTasks} งาน (มี ${errors.length} ข้อผิดพลาด)`);
}
console.log('═'.repeat(50));
console.log('');

// Exit code
process.exit(errors.length > 0 ? 1 : 0);

