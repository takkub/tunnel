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

function listCandidateNames(mode) {
  // Union of native + docker tunnel folders so a flagged tunnel is picked up
  // regardless of which one it was created under.
  const names = new Set([...getTunnelNames(), ...getDockerTunnelNames()]);
  return [...names].sort();
}

function run() {
  const mode = getEffectiveMode();
  const names = listCandidateNames(mode).filter(getAutostart);

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

  return { mode, started, skipped, failed };
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
  }
  process.exit(0);
}

if (require.main === module) main();

module.exports = { run };
