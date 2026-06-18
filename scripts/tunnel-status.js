const fs = require('fs');
const path = require('path');
const { getEffectiveMode, dockerStatus, nativeStatus, TUNNELS_DIR } = require('./runtime');

const filterName = process.argv[2] || null;

function getHostnameFromConfig(tunnelName) {
  try {
    const configPath = path.join(TUNNELS_DIR, tunnelName, 'config.yml');
    if (!fs.existsSync(configPath)) return null;
    const content = fs.readFileSync(configPath, 'utf8');
    const match = content.match(/hostname:\s*(\S+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function getTunnelFolders() {
  if (!fs.existsSync(TUNNELS_DIR)) return [];
  return fs.readdirSync(TUNNELS_DIR).filter(f =>
    fs.statSync(path.join(TUNNELS_DIR, f)).isDirectory()
  );
}

const mode = getEffectiveMode();
const folders = getTunnelFolders().filter(n => !filterName || n === filterName);

const tunnels = folders.map(name => ({
  name,
  running: mode === 'native' ? nativeStatus(name) : dockerStatus(name),
  hostname: getHostnameFromConfig(name),
}));

console.log(JSON.stringify({ tunnels }, null, 2));
