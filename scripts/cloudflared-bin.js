// Locates a usable cloudflared binary, downloading the latest release for the
// current platform/arch into <TUNNEL_DATA_DIR>/bin when none is installed —
// so native mode never depends on Docker to obtain the binary.
'use strict';
// Namespace import (not destructured) so tests can mock cp.spawnSync at call time.
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

const ROOT = process.env.TUNNEL_ROOT || path.join(__dirname, '..');
const DATA_DIR = process.env.TUNNEL_DATA_DIR || ROOT;
const BIN_DIR = path.join(DATA_DIR, 'bin');

function binName() {
  return process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
}

function managedPath() {
  return path.join(BIN_DIR, binName());
}

// Backward compat: earlier versions of this project expected a bundled
// cloudflared.exe dropped directly at the project root on Windows.
function legacyRootPath() {
  return path.join(ROOT, 'cloudflared.exe');
}

function isExecutable(bin) {
  try {
    const r = cp.spawnSync(bin, ['--version'], { stdio: 'pipe', timeout: 10000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

// Locate an already-installed cloudflared. No network access.
// Returns an absolute path, the bare command 'cloudflared' (found on PATH), or null.
function findCloudflared() {
  const managed = managedPath();
  if (fs.existsSync(managed) && isExecutable(managed)) return managed;

  if (process.platform === 'win32') {
    const legacy = legacyRootPath();
    if (fs.existsSync(legacy) && isExecutable(legacy)) return legacy;
  }

  if (isExecutable('cloudflared')) return 'cloudflared';

  return null;
}

// Synchronous accessor for callers that cannot await a download (e.g. nativeStart).
// Throws with install instructions when nothing is found.
function getCloudflaredPath() {
  const found = findCloudflared();
  if (found) return found;
  throw new Error(
    'cloudflared not found. Run "npm run login" (downloads it automatically), ' +
    'or "node scripts/cloudflared-bin.js install", ' +
    'or install manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/'
  );
}

function releaseAsset() {
  const plat = process.platform;
  const arch = process.arch;
  if (plat === 'win32') {
    return arch === 'arm64' ? 'cloudflared-windows-arm64.exe' : 'cloudflared-windows-amd64.exe';
  }
  if (plat === 'darwin') {
    return arch === 'arm64' ? 'cloudflared-darwin-arm64.tgz' : 'cloudflared-darwin-amd64.tgz';
  }
  if (plat === 'linux') {
    if (arch === 'arm64') return 'cloudflared-linux-arm64';
    if (arch === 'arm') return 'cloudflared-linux-arm';
    return 'cloudflared-linux-amd64';
  }
  throw new Error(`Unsupported platform for cloudflared auto-download: ${plat}/${arch}`);
}

const RELEASE_BASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download/';

function httpGetBuffer(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'tunnel-app' } }, res => {
      const { statusCode, headers } = res;
      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error('Too many redirects downloading cloudflared'));
        return resolve(httpGetBuffer(headers.location, redirectsLeft - 1));
      }
      if (statusCode !== 200) {
        res.resume();
        return reject(new Error(`Download failed: HTTP ${statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('Timed out downloading cloudflared')));
  });
}

// Downloads the latest cloudflared release for the current platform/arch into
// <TUNNEL_DATA_DIR>/bin, verifies it runs, and returns its path.
async function downloadCloudflared() {
  const asset = releaseAsset();
  const url = RELEASE_BASE + asset;
  fs.mkdirSync(BIN_DIR, { recursive: true });
  const buf = await httpGetBuffer(url);
  const dest = managedPath();

  if (asset.endsWith('.tgz')) {
    // cloudflared's macOS release is a flat tarball containing a single
    // 'cloudflared' file — extract with the system tar (present by default
    // on macOS/Linux) rather than adding a tar-parsing dependency.
    const tmp = path.join(os.tmpdir(), `cloudflared-${Date.now()}.tgz`);
    fs.writeFileSync(tmp, buf);
    try {
      const r = cp.spawnSync('tar', ['-xzf', tmp, '-C', BIN_DIR], { stdio: 'pipe' });
      if (r.status !== 0) {
        throw new Error(`Failed to extract cloudflared archive: ${(r.stderr || '').toString().trim()}`);
      }
    } finally {
      try { fs.unlinkSync(tmp); } catch {}
    }
    if (!fs.existsSync(dest)) throw new Error('cloudflared binary missing after extraction');
  } else {
    fs.writeFileSync(dest, buf);
  }

  try { fs.chmodSync(dest, 0o755); } catch {}

  if (!isExecutable(dest)) {
    throw new Error(`Downloaded cloudflared but it failed to run: ${dest}`);
  }
  return dest;
}

// Locate cloudflared, downloading it automatically if it isn't installed yet.
async function ensureCloudflared() {
  const found = findCloudflared();
  if (found) return found;
  return downloadCloudflared();
}

module.exports = {
  BIN_DIR,
  findCloudflared,
  getCloudflaredPath,
  releaseAsset,
  downloadCloudflared,
  ensureCloudflared,
};

if (require.main === module) {
  if (process.argv[2] === 'install') {
    ensureCloudflared()
      .then(p => console.log(`cloudflared ready: ${p}`))
      .catch(err => { console.error(`Error: ${err.message}`); process.exit(1); });
  } else {
    try {
      console.log(getCloudflaredPath());
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }
}
