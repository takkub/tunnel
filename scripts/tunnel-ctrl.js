// Non-interactive tunnel control: node tunnel-ctrl.js <start|stop> <tunnelName>
const { getEffectiveMode, dockerStart, dockerStop, nativeStart, nativeStop } = require('./runtime');

const [action, tunnelName] = process.argv.slice(2);

if (!action || !tunnelName || !['start', 'stop'].includes(action)) {
  process.stderr.write('Usage: node tunnel-ctrl.js <start|stop> <tunnelName>\n');
  process.exit(1);
}

try {
  const mode = getEffectiveMode();
  if (action === 'start') {
    if (mode === 'native') {
      const pid = nativeStart(tunnelName);
      process.stdout.write(`started native (pid ${pid})\n`);
    } else {
      dockerStart(tunnelName);
      process.stdout.write('start ok\n');
    }
  } else {
    if (mode === 'native') {
      nativeStop(tunnelName);
      process.stdout.write('stopped native\n');
    } else {
      dockerStop(tunnelName);
      process.stdout.write('stop ok\n');
    }
  }
} catch (e) {
  process.stderr.write(e.message + '\n');
  process.exit(1);
}
