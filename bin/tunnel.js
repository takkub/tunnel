#!/usr/bin/env node
// CLI entry point for the globally-installed `tunnel` command. Thin dispatcher
// over the existing scripts/*.js — TUNNEL_ROOT/TUNNEL_DATA_DIR are the same
// contract those scripts already read (see scripts/runtime.js), just pointed
// at this package's install dir and the user's home instead of a repo clone.
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawnSync } = require('child_process');

const PKG_ROOT = path.join(__dirname, '..');
if (!process.env.TUNNEL_ROOT) process.env.TUNNEL_ROOT = PKG_ROOT;
if (!process.env.TUNNEL_DATA_DIR) process.env.TUNNEL_DATA_DIR = path.join(os.homedir(), '.tunnel');
fs.mkdirSync(process.env.TUNNEL_DATA_DIR, { recursive: true });

const ROOT = process.env.TUNNEL_ROOT;

function scriptPath(name) {
  return path.join(ROOT, 'scripts', name);
}

// Runs one of the existing scripts/*.js CLIs as a child process, inheriting
// stdio and this process's already-resolved TUNNEL_ROOT/TUNNEL_DATA_DIR env.
function runScript(name, args) {
  const r = spawnSync(process.execPath, [scriptPath(name), ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  if (r.error) {
    console.error(r.error.message);
    process.exit(1);
  }
  process.exit(r.status === null ? 1 : r.status);
}

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      spawnSync('cmd', ['/c', 'start', '""', url], { stdio: 'ignore', windowsHide: true });
    } else if (process.platform === 'darwin') {
      spawnSync('open', [url], { stdio: 'ignore' });
    } else {
      spawnSync('xdg-open', [url], { stdio: 'ignore' });
    }
  } catch {}
}

function cmdWeb(args) {
  const webServe = require(scriptPath('web-serve.js'));
  const sub = args[0];

  if (sub === 'stop') {
    console.log(JSON.stringify(webServe.stop()));
    return;
  }
  if (sub === 'status') {
    console.log(JSON.stringify(webServe.status()));
    return;
  }

  const rest = sub === 'start' ? args.slice(1) : args;
  const portIdx = rest.indexOf('--port');
  const port = portIdx !== -1 ? parseInt(rest[portIdx + 1], 10) : 8888;
  const noOpen = rest.includes('--no-open');

  let result;
  try {
    result = webServe.start(port);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const actualPort = result.port || port;
  console.log(`Web admin running at http://localhost:${actualPort} (pid ${result.pid})`);
  if (!noOpen) openBrowser(`http://localhost:${actualPort}`);
}

function cmdSetup() {
  const webServe = require(scriptPath('web-serve.js'));
  let result;
  try {
    result = webServe.start(8888);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const port = result.port || 8888;
  console.log(`Web admin running at http://localhost:${port}`);
  openBrowser(`http://localhost:${port}/setup`);
}

function cmdList(args) {
  const runtime = require(scriptPath('runtime.js'));
  const json = args.includes('--json');
  const names = Array.from(new Set([...runtime.getTunnelNames(), ...runtime.getDockerTunnelNames()])).sort();
  const processes = runtime.getCloudflaredProcesses();

  const rows = names.map(name => {
    const isDocker = runtime.dockerStatus(name);
    const isNative = !isDocker && runtime.nativeRunning(name, processes);
    return { name, running: isDocker || isNative, mode: isDocker ? 'docker' : (isNative ? 'native' : null) };
  });

  if (json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (!rows.length) {
    console.log('No tunnels found.');
    return;
  }
  for (const r of rows) {
    console.log(`${r.running ? '●' : '○'} ${r.name}${r.mode ? ` (${r.mode})` : ''}`);
  }
}

function autostartLoginTarget() {
  return { node: process.execPath, cli: path.join(PKG_ROOT, 'bin', 'tunnel.js') };
}

function autostartInstall() {
  const { node, cli } = autostartLoginTarget();
  if (process.platform === 'win32') {
    const psCmd = `& '${node}' '${cli}' autostart; & '${node}' '${cli}' web --no-open`;
    const tr = `powershell.exe -WindowStyle Hidden -NoProfile -NonInteractive -Command "${psCmd.replace(/"/g, '\\"')}"`;
    const r = spawnSync('schtasks', ['/create', '/tn', 'TunnelAutostart', '/tr', tr, '/sc', 'onlogon', '/rl', 'limited', '/f'], { stdio: 'inherit' });
    process.exit(r.status || 0);
  } else if (process.platform === 'darwin') {
    const label = 'com.takkub.tunnel.autostart';
    const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
    const shCmd = `'${node}' '${cli}' autostart && '${node}' '${cli}' web --no-open`;
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>${shCmd}</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
`;
    fs.mkdirSync(path.dirname(plistPath), { recursive: true });
    fs.writeFileSync(plistPath, plist);
    spawnSync('launchctl', ['load', plistPath], { stdio: 'inherit' });
    console.log(`Installed login item: ${plistPath}`);
  } else {
    console.error('autostart install is only supported on Windows and macOS. On Linux, add a systemd --user unit or cron @reboot entry that runs: ' +
      `${node} ${cli} autostart && ${node} ${cli} web --no-open`);
    process.exit(1);
  }
}

function autostartUninstall() {
  if (process.platform === 'win32') {
    const r = spawnSync('schtasks', ['/delete', '/tn', 'TunnelAutostart', '/f'], { stdio: 'inherit' });
    process.exit(r.status || 0);
  } else if (process.platform === 'darwin') {
    const label = 'com.takkub.tunnel.autostart';
    const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
    spawnSync('launchctl', ['unload', plistPath], { stdio: 'ignore' });
    try { fs.unlinkSync(plistPath); } catch {}
    console.log(`Removed login item: ${plistPath}`);
  } else {
    console.error('Nothing to uninstall on this platform.');
    process.exit(1);
  }
}

function cmdAutostart(args) {
  const sub = args[0];
  if (sub === 'install') return autostartInstall();
  if (sub === 'uninstall') return autostartUninstall();
  runScript('autostart.js', args);
}

const USAGE = `Usage: tunnel <command> [options]

  web [--port 8888] [--no-open]   Start the web admin dashboard
  web stop                        Stop the web admin dashboard
  web status                      Show whether the web admin is running
  setup                           Open the setup wizard in your browser
  list [--json]                   List all tunnels and their status
  create <name> <hostname> <port> Create a new tunnel
  start <name>                    Start one tunnel
  stop <name>                     Stop one tunnel
  start-all                       Start every configured tunnel
  stop-all                        Stop every configured tunnel
  autostart [--json]              Start every tunnel flagged autostart=true
  autostart install               Register "tunnel" to run at login (Windows/macOS)
  autostart uninstall             Remove the login item

Env:
  TUNNEL_DATA_DIR   Where tunnels/config/credentials are stored (default: ~/.tunnel)
`;

function main() {
  const [cmd, ...args] = process.argv.slice(2);

  switch (cmd) {
    case 'web': return cmdWeb(args);
    case 'setup': return cmdSetup();
    case 'list': return cmdList(args);
    case 'create': return runScript('create-tunnel.js', args);
    case 'start': return runScript('tunnel-ctrl.js', ['start', ...args]);
    case 'stop': return runScript('tunnel-ctrl.js', ['stop', ...args]);
    case 'start-all': return runScript('start-all.js', args);
    case 'stop-all': return runScript('stop-all.js', args);
    case 'autostart': return cmdAutostart(args);
    case undefined:
    case '-h':
    case '--help':
    case 'help':
      console.log(USAGE);
      process.exit(cmd === undefined ? 1 : 0);
      return;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.log(USAGE);
      process.exit(1);
  }
}

main();
