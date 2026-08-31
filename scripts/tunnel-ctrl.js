// Non-interactive tunnel control: node tunnel-ctrl.js <start|stop|restart> <tunnelName>
const {
  getEffectiveMode,
  dockerStart, dockerStop, dockerStatus,
  nativeStart, nativeStop, nativeRunning,
  getCloudflaredProcesses,
} = require('./runtime');

const [action, tunnelName] = process.argv.slice(2);

if (!action || !tunnelName || !['start', 'stop', 'restart'].includes(action)) {
  process.stderr.write('Usage: node tunnel-ctrl.js <start|stop|restart> <tunnelName>\n');
  process.exit(1);
}

try {
  if (action === 'stop') {
    const isDocker = dockerStatus(tunnelName);
    const processes = isDocker ? [] : getCloudflaredProcesses();
    const isNative = !isDocker && nativeRunning(tunnelName, processes);

    if (!isDocker && !isNative) {
      process.stdout.write('already stopped\n');
      process.exit(0);
    }

    if (isDocker) dockerStop(tunnelName);
    if (isNative) nativeStop(tunnelName);
    process.stdout.write('stopped\n');
  } else if (action === 'start') {
    // start — idempotent: no-op if already running in either runtime
    const isDocker = dockerStatus(tunnelName);
    if (isDocker) {
      process.stdout.write('already running\n');
      process.exit(0);
    }
    const processes = getCloudflaredProcesses();
    if (nativeRunning(tunnelName, processes)) {
      process.stdout.write('already running\n');
      process.exit(0);
    }

    const mode = getEffectiveMode();
    if (mode === 'native') {
      const pid = nativeStart(tunnelName);
      process.stdout.write(`started native (pid ${pid})\n`);
    } else {
      dockerStart(tunnelName);
      process.stdout.write('start ok\n');
    }
  } else {
    // restart — always stop+start, unlike 'start': also covers a "foreign"
    // native process (one running outside this app, with no .pid file this
    // app recorded — see runtime.js's nativeRunningDetail). nativeStop()
    // knows how to find and kill that case too, so this both hands a foreign
    // process back under app management and guarantees the *current*
    // config.yml (e.g. after an auth-gate toggle) actually takes effect.
    const isDocker = dockerStatus(tunnelName);
    if (isDocker) {
      dockerStop(tunnelName);
      dockerStart(tunnelName);
      process.stdout.write('restarted (docker)\n');
    } else {
      if (nativeRunning(tunnelName, getCloudflaredProcesses())) nativeStop(tunnelName);
      const mode = getEffectiveMode();
      if (mode === 'native') {
        const pid = nativeStart(tunnelName);
        process.stdout.write(`restarted native (pid ${pid})\n`);
      } else {
        dockerStart(tunnelName);
        process.stdout.write('restarted (docker)\n');
      }
    }
  }
} catch (e) {
  process.stderr.write(e.message + '\n');
  process.exit(1);
}
