const fs = require('fs');
const path = require('path');
const { getDockerContainerNames, getCloudflaredProcesses, nativeRunning, TUNNELS_DIR } = require('./runtime');

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

function getPortFromConfig(tunnelName) {
  try {
    const configPath = path.join(TUNNELS_DIR, tunnelName, 'config.yml');
    if (!fs.existsSync(configPath)) return null;
    const content = fs.readFileSync(configPath, 'utf8');
    const match = content.match(/service:\s*https?:\/\/[^:]+:(\d+)/);
    return match ? parseInt(match[1], 10) : null;
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

const folders = getTunnelFolders().filter(n => !filterName || n === filterName);

// Gather state once — reused for all tunnels (no per-tunnel subprocess spawning)
const dockerContainers = getDockerContainerNames();
const nativeProcesses = getCloudflaredProcesses();

const tunnels = folders.map(name => ({
  name,
  running: dockerContainers.has(`cloudflared-tunnel-${name}`) || nativeRunning(name, nativeProcesses),
  hostname: getHostnameFromConfig(name),
  port: getPortFromConfig(name),
}));

console.log(JSON.stringify({ tunnels }, null, 2));
