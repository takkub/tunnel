const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const ui = require('./ui-helper');

ui.header('Cloudflare', 'Login to your Cloudflare account');

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
  ui.success('You are already logged in to Cloudflare!');
  console.log('');
  ui.box('Certificate Location', [
    `${ui.c.cyan}%USERPROFILE%\\.cloudflared\\cert.pem${ui.c.reset}`
  ]);

  ui.nextSteps([
    `Create a new tunnel: ${ui.c.cyan}npm run setup${ui.c.reset}`,
    `Check tunnel status: ${ui.c.cyan}npm run status${ui.c.reset}`
  ]);
  process.exit(0);
}

ui.section(`${ui.icons.lock} Logging in to Cloudflare...`);
console.log('');

if (cloudflared.found) {
  // ใช้ cloudflared ที่ติดตั้งไว้
  ui.info('Using local cloudflared installation');
  console.log('');

  try {
    execSync(`${cloudflared.command} tunnel login`, { stdio: 'inherit' });
    console.log('');
    ui.complete('Login Successful!');

    ui.nextSteps([
      `Create a new tunnel: ${ui.c.cyan}npm run setup${ui.c.reset}`
    ]);
  } catch (error) {
    ui.fail('Login failed!');
    process.exit(1);
  }
} else {
  // ตรวจสอบว่าติดตั้งผ่าน winget หรือไม่
  try {
    const wingetList = execSync('winget list Cloudflare.cloudflared', { encoding: 'utf8', stdio: 'pipe' });
    if (wingetList.includes('Cloudflare.cloudflared')) {
      ui.warning('Cloudflared is installed but not in PATH.');
      ui.tip('Please restart your terminal/PowerShell and try again.');
      console.log('');
      ui.info('Or use Docker instead:');
      console.log('');
    }
  } catch (e) {
    // ไม่มีติดตั้งเลย
  }

  // ใช้ Docker
  ui.info('Using Docker to run cloudflared...');
  console.log('');
  ui.warning('Your browser will open for authentication.');
  console.log('');

  const userProfile = process.env.USERPROFILE;
  const cloudflaredDir = path.join(userProfile, '.cloudflared');

  // สร้างโฟลเดอร์ .cloudflared ถ้ายังไม่มี
  if (!fs.existsSync(cloudflaredDir)) {
    fs.mkdirSync(cloudflaredDir, { recursive: true });
    ui.success(`Created directory: ${cloudflaredDir}`);
    console.log('');
  }

  // รัน cloudflared login ผ่าน Docker
  try {
    const dockerCmd = `docker run --rm -it -v "${cloudflaredDir}:/root/.cloudflared" cloudflare/cloudflared:latest tunnel login`;

    ui.section('Running Docker Command');
    ui.command(dockerCmd);
    console.log('');
    ui.divider();
    console.log('');

    execSync(dockerCmd, { stdio: 'inherit' });

    console.log('');
    ui.divider();
    ui.complete('Login Successful!');

    ui.box('Certificate Saved', [
      `${ui.c.cyan}%USERPROFILE%\\.cloudflared\\cert.pem${ui.c.reset}`
    ]);

    ui.nextSteps([
      `Create a new tunnel: ${ui.c.cyan}npm run setup${ui.c.reset}`
    ]);
  } catch (error) {
    ui.fail('Login failed!');
    console.log('');
    ui.section('Troubleshooting');
    console.log(`  ${ui.c.dim}1. Make sure Docker Desktop is running${ui.c.reset}`);
    console.log(`  ${ui.c.dim}2. Try running: ${ui.c.cyan}docker ps${ui.c.reset}`);
    console.log(`  ${ui.c.dim}3. Restart Docker Desktop and try again${ui.c.reset}`);
    console.log('');
    process.exit(1);
  }
}
