// Non-interactive: start every tunnel with autostart=true that isn't already
// running. Respects docker/native mode per tunnel-ctrl.js's start path.
// Usage: node autostart.js [--json]
'use strict';
const {
  getEffectiveMode,
  getTunnelNames, getDockerTunnelNames,
  dockerStart, dockerStatus,
  nativeStart, nativeRunning,
  getCloudflaredProcesses,
} = require('./runtime');
const { getAutostart } = require('./tunnel-meta');
const authGate = require('./auth-gate');

function listCandidateNames(mode) {
  // Union of native + docker tunnel folders so a flagged tunnel is picked up
  // regardless of which one it was created under.
  const names = new Set([...getTunnelNames(), ...getDockerTunnelNames()]);
  return [...names].sort();
}

// The auth-gate proxy/container is a single shared process fronting every
// gate-enabled tunnel, independent of each tunnel's own autostart flag — a
// tunnel that never stopped across an app restart (native tunnels are
// WMI-detached and outlive the app) still needs its gate back, so this checks
// every candidate name's auth-gate.json, not just the ones this run started.
function ensureGateForEnabledTunnels(mode, allNames) {
  const tunnels = allNames.filter(name => {
    try { return authGate.readState(name).enabled; } catch { return false; }
  });
  if (!tunnels.length) return { needed: false, started: false, tunnels: [] };

  const wasRunning = mode === 'native' ? authGate.nativeGateRunning() : authGate.isGateRunning();
  try {
    if (mode === 'native') authGate.ensureNativeGateRunning();
    else authGate.ensureGateRunning();
    return { needed: true, started: !wasRunning, tunnels };
  } catch (err) {
    return { needed: true, started: false, error: err.message, tunnels };
  }
}

function run() {
  const mode = getEffectiveMode();
  const allNames = listCandidateNames(mode);
  const names = allNames.filter(getAutostart);

  const nativeProcesses = getCloudflaredProcesses();
  const started = [];
  const skipped = [];
  const failed = [];

  for (const name of names) {
    const isDocker = dockerStatus(name);
    const isNative = !isDocker && nativeRunning(name, nativeProcesses);
    if (isDocker || isNative) {
      skipped.push(name);
      continue;
    }
    try {
      if (mode === 'native') nativeStart(name);
      else dockerStart(name);
      started.push(name);
    } catch (err) {
      failed.push({ name, error: err.message });
    }
  }

  const gate = ensureGateForEnabledTunnels(mode, allNames);

  return { mode, started, skipped, failed, gate };
}

function main() {
  const jsonOutput = process.argv.includes('--json');
  let summary;
  try {
    summary = run();
  } catch (err) {
    process.stderr.write(`Fatal: ${err.message}\n`);
    process.exit(1);
    return;
  }

  if (jsonOutput) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Mode: ${summary.mode}`);
    console.log(`Started: ${summary.started.length ? summary.started.join(', ') : '(none)'}`);
    console.log(`Skipped (already running): ${summary.skipped.length ? summary.skipped.join(', ') : '(none)'}`);
    if (summary.failed.length) {
      console.log(`Failed: ${summary.failed.map(f => `${f.name} (${f.error})`).join(', ')}`);
    }
    if (summary.gate.needed) {
      const gateNote = summary.gate.error
        ? `error (${summary.gate.error})`
        : summary.gate.started ? 'started' : 'already running';
      console.log(`Auth gate: ${gateNote} — for ${summary.gate.tunnels.join(', ')}`);
    }
  }
  process.exit(0);
}

if (require.main === module) main();

module.exports = { run };
