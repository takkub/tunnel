const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('╔════════════════════════════════════════╗');
console.log('║   Cloudflare - Login                   ║');
console.log('╚════════════════════════════════════════╝\n');

// ตรวจสอบว่ามี cloudflared ติดตั้งหรือไม่
function checkCloudflared() {
  // ลองหาใน PATH ก่อน
  try {
    execSync('cloudflared --version', { stdio: 'pipe' });
    return { found: true, command: 'cloudflared' };
  } catch (error) {
    // ลองหาในตำแหน่งที่ติดตั้งปกติ
    const possiblePaths = [
      'C:\\Program Files\\Cloudflare\\Cloudflared\\cloudflared.exe',
      'C:\\Program Files\\cloudflared\\cloudflared.exe',
      'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    ];

    for (const cfPath of possiblePaths) {
      if (fs.existsSync(cfPath)) {
        return { found: true, command: `"${cfPath}"` };
      }
    }

    return { found: false, command: null };
  }
}

// ตรวจสอบว่า login แล้วหรือยัง
function isLoggedIn() {
  const certPath = path.join(process.env.USERPROFILE, '.cloudflared', 'cert.pem');
  return fs.existsSync(certPath);
}

const cloudflared = checkCloudflared();

// ตรวจสอบว่า login แล้วหรือยัง
if (isLoggedIn()) {
  console.log('✅ You are already logged in to Cloudflare!\n');
  console.log('Certificate found at: %USERPROFILE%\\.cloudflared\\cert.pem\n');
  console.log('Next steps:');
  console.log('  npm run setup    # Create a new tunnel');
  console.log('  npm run status   # Check tunnel status\n');
  process.exit(0);
}

console.log('🔐 Logging in to Cloudflare...\n');

if (cloudflared.found) {
  // ใช้ cloudflared ที่ติดตั้งไว้
  console.log('Using cloudflared...\n');
  try {
    execSync(`${cloudflared.command} tunnel login`, { stdio: 'inherit' });
    console.log('\n✅ Login successful!\n');
    console.log('Next steps:');
    console.log('  npm run setup    # Create a new tunnel\n');
  } catch (error) {
    console.error('\n❌ Login failed!');
    process.exit(1);
  }
} else {
  // ตรวจสอบว่าติดตั้งผ่าน winget หรือไม่
  try {
    const wingetList = execSync('winget list Cloudflare.cloudflared', { encoding: 'utf8', stdio: 'pipe' });
    if (wingetList.includes('Cloudflare.cloudflared')) {
      console.log('⚠️  Cloudflared is installed but not in PATH.\n');
      console.log('Please restart your terminal/PowerShell and try again.\n');
      console.log('Or use Docker instead:\n');
    }
  } catch (e) {
    // ไม่มีติดตั้งเลย
  }

  // ใช้ Docker
  console.log('Using Docker to run cloudflared...\n');
  console.log('📌 Important: Your browser will open for authentication.\n');

  const userProfile = process.env.USERPROFILE;
  const cloudflaredDir = path.join(userProfile, '.cloudflared');

  // สร้างโฟลเดอร์ .cloudflared ถ้ายังไม่มี
  if (!fs.existsSync(cloudflaredDir)) {
    fs.mkdirSync(cloudflaredDir, { recursive: true });
    console.log(`✓ Created directory: ${cloudflaredDir}\n`);
  }

  // รัน cloudflared login ผ่าน Docker
  try {
    const dockerCmd = `docker run --rm -it -v "${cloudflaredDir}:/root/.cloudflared" cloudflare/cloudflared:latest tunnel login`;

    console.log('Running command:');
    console.log(dockerCmd);
    console.log('\n' + '='.repeat(50) + '\n');

    execSync(dockerCmd, { stdio: 'inherit' });

    console.log('\n' + '='.repeat(50));
    console.log('\n✅ Login successful!\n');
    console.log('Certificate saved to: %USERPROFILE%\\.cloudflared\\cert.pem\n');
    console.log('Next steps:');
    console.log('  npm run setup    # Create a new tunnel\n');
  } catch (error) {
    console.error('\n❌ Login failed!');
    console.error('\nTroubleshooting:');
    console.error('  1. Make sure Docker Desktop is running');
    console.error('  2. Try running: docker ps');
    console.error('  3. Restart Docker Desktop and try again\n');
    process.exit(1);
  }
}

