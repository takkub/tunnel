const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const ui = require('./ui-helper');
const { findCloudflared, ensureCloudflared } = require('./cloudflared-bin');

ui.header('Cloudflare', 'Login to your Cloudflare account');

function isLoggedIn() {
  const certPath = path.join(os.homedir(), '.cloudflared', 'cert.pem');
  return fs.existsSync(certPath);
}

const certLocation = path.join(os.homedir(), '.cloudflared', 'cert.pem');

if (isLoggedIn()) {
  ui.success('You are already logged in to Cloudflare!');
  console.log('');
  ui.box('Certificate Location', [`${ui.c.cyan}${certLocation}${ui.c.reset}`]);

  ui.nextSteps([
    `Create a new tunnel: ${ui.c.cyan}npm run setup${ui.c.reset}`,
    `Check tunnel status: ${ui.c.cyan}npm run status${ui.c.reset}`
  ]);
  process.exit(0);
}

ui.section(`${ui.icons.lock} Logging in to Cloudflare...`);
console.log('');

// Resolves (downloading if needed) a working cloudflared binary. Throws only
// when no binary could be obtained at all — a real login failure below is
// reported directly rather than silently retried through Docker.
async function resolveBinary() {
  let bin = findCloudflared();
  if (!bin) {
    ui.info('cloudflared not found — downloading the latest release...');
    bin = await ensureCloudflared();
    ui.success('cloudflared downloaded');
    console.log('');
  } else {
    ui.info('Using local cloudflared installation');
    console.log('');
  }
  return bin;
}

function loginWithBinary(bin) {
  execSync(`"${bin}" tunnel login`, { stdio: 'inherit' });
  console.log('');
  ui.complete('Login Successful!');

  ui.nextSteps([
    `Create a new tunnel: ${ui.c.cyan}npm run setup${ui.c.reset}`
  ]);
}

async function loginWithDocker() {
  ui.info('Using Docker to run cloudflared...');
  console.log('');
  ui.warning('Your browser will open for authentication.');
  console.log('');

  const cloudflaredDir = path.join(os.homedir(), '.cloudflared');
  if (!fs.existsSync(cloudflaredDir)) {
    fs.mkdirSync(cloudflaredDir, { recursive: true });
    ui.success(`Created directory: ${cloudflaredDir}`);
    console.log('');
  }

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

  ui.box('Certificate Saved', [`${ui.c.cyan}${certLocation}${ui.c.reset}`]);

  ui.nextSteps([
    `Create a new tunnel: ${ui.c.cyan}npm run setup${ui.c.reset}`
  ]);
}

async function main() {
  let bin;
  try {
    bin = await resolveBinary();
  } catch (error) {
    // No usable binary and the download failed (e.g. unsupported platform,
    // offline) — fall back to Docker to obtain and run cloudflared instead.
    ui.warning(`Could not get a local cloudflared binary: ${error.message}`);
    console.log('');
    try {
      await loginWithDocker();
    } catch (dockerError) {
      ui.fail('Login failed!');
      console.log('');
      ui.section('Troubleshooting');
      console.log(`  ${ui.c.dim}1. Install cloudflared manually and re-run: npm run login${ui.c.reset}`);
      console.log(`  ${ui.c.dim}2. Or make sure Docker Desktop is running${ui.c.reset}`);
      console.log(`  ${ui.c.dim}3. Try running: ${ui.c.cyan}docker ps${ui.c.reset}`);
      console.log('');
      process.exit(1);
    }
    return;
  }

  try {
    loginWithBinary(bin);
  } catch (error) {
    ui.fail('Login failed!');
    console.log('');
    process.exit(1);
  }
}

main();
