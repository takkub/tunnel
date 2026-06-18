const ui = require('./ui-helper');
const { getEffectiveMode, dockerStop, nativeStop, getTunnelNames, getDockerTunnelNames } = require('./runtime');

async function main() {
  const mode = getEffectiveMode();
  ui.header('Stop All Tunnels', `Mode: ${mode}`);

  const names = mode === 'native' ? getTunnelNames() : getDockerTunnelNames();

  if (names.length === 0) {
    ui.fail('No tunnels found');
    process.exit(1);
  }

  console.log(`${ui.c.dim}Found ${names.length} tunnels${ui.c.reset}\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const display = name.replace(/-/g, ' ').toUpperCase();
    ui.step(i + 1, names.length, `Stopping ${display}`);
    try {
      if (mode === 'native') {
        nativeStop(name);
      } else {
        dockerStop(name);
      }
      ui.subStep(`${display} stopped`, 'success');
      successCount++;
    } catch (error) {
      ui.subStep(`Failed to stop ${display}: ${error.message}`, 'error');
      failCount++;
    }
  }

  console.log('');
  if (failCount === 0) {
    ui.complete(`Successfully stopped all ${successCount} tunnels`);
    process.exit(0);
  } else {
    ui.warning(`Process completed: ${successCount} stopped, ${failCount} failed`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
