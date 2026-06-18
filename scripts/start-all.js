const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ui = require('./ui-helper');
const { getEffectiveMode, dockerStart, nativeStart, getTunnelNames, getDockerTunnelNames, ROOT } = require('./runtime');

async function main() {
  const mode = getEffectiveMode();
  ui.header('Start All Tunnels', `Mode: ${mode}`);

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
    ui.step(i + 1, names.length, `Starting ${display}`);
    try {
      if (mode === 'native') {
        nativeStart(name);
      } else {
        dockerStart(name);
      }
      ui.subStep(`${display} is running`, 'success');
      successCount++;
    } catch (error) {
      ui.subStep(`Failed to start ${display}: ${error.message}`, 'error');
      failCount++;
    }
  }

  console.log('');
  if (failCount === 0) {
    ui.complete(`Successfully started all ${successCount} tunnels`);
    process.exit(0);
  } else {
    ui.warning(`Process completed: ${successCount} started, ${failCount} failed`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
