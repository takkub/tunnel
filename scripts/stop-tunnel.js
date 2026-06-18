const readline = require('readline');
const ui = require('./ui-helper');
const { getEffectiveMode, dockerStop, nativeStop, getTunnelNames, getDockerTunnelNames } = require('./runtime');

function getAvailableTunnels(mode) {
    const names = mode === 'native' ? getTunnelNames() : getDockerTunnelNames();
    return names.sort().map(name => ({
        name,
        displayName: name.replace(/-/g, ' ').toUpperCase(),
    }));
}

function renderMenu(tunnels, selectedIndex, mode) {
    const width = ui.getWidth();
    const boxWidth = Math.min(Math.max(60, width - 4), 80);

    console.clear();

    console.log(`${ui.c.red}${ui.c.bold}╔${'═'.repeat(boxWidth - 2)}╗${ui.c.reset}`);
    console.log(`${ui.c.red}${ui.c.bold}║${ui.c.reset}  ${ui.c.brightRed}Stop Tunnel [${mode}]${ui.c.reset}${' '.repeat(Math.max(0, boxWidth - 21 - mode.length))}${ui.c.red}${ui.c.bold}║${ui.c.reset}`);
    console.log(`${ui.c.red}${ui.c.bold}╚${'═'.repeat(boxWidth - 2)}╝${ui.c.reset}`);

    console.log(`${ui.c.dim}Use Up/Down to navigate, Enter to select, ESC to cancel${ui.c.reset}`);
    console.log('');

    tunnels.forEach((tunnel, index) => {
        const isSelected = index === selectedIndex;
        const prefix = isSelected ? `${ui.c.red}${ui.icons.arrow}${ui.c.reset}` : ' ';

        if (isSelected) {
            console.log(`  ${prefix} ${ui.c.red}${ui.c.inverse} ${tunnel.displayName.padEnd(boxWidth - 6)} ${ui.c.reset}`);
        } else {
            console.log(`  ${prefix} ${ui.c.white}${tunnel.displayName}${ui.c.reset}`);
        }
    });
    console.log('');
}

async function selectTunnel(tunnels, mode) {
    let selectedIndex = 0;

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    return new Promise((resolve, reject) => {
        const handleKey = (str, key) => {
            if (key.name === 'c' && key.ctrl) {
                process.stdin.setRawMode(false);
                process.exit();
            }
            if (key.name === 'up') {
                selectedIndex = (selectedIndex - 1 + tunnels.length) % tunnels.length;
                renderMenu(tunnels, selectedIndex, mode);
            } else if (key.name === 'down') {
                selectedIndex = (selectedIndex + 1) % tunnels.length;
                renderMenu(tunnels, selectedIndex, mode);
            } else if (key.name === 'return') {
                process.stdin.removeListener('keypress', handleKey);
                if (process.stdin.isTTY) process.stdin.setRawMode(false);
                resolve(tunnels[selectedIndex]);
            } else if (key.name === 'escape') {
                process.stdin.removeListener('keypress', handleKey);
                if (process.stdin.isTTY) process.stdin.setRawMode(false);
                reject(new Error('Cancelled'));
            }
        };

        process.stdin.on('keypress', handleKey);
        renderMenu(tunnels, selectedIndex, mode);
    });
}

async function main() {
    try {
        const mode = getEffectiveMode();
        const tunnels = getAvailableTunnels(mode);

        if (tunnels.length === 0) {
            ui.fail('No tunnels found');
            process.exit(1);
        }

        const selected = await selectTunnel(tunnels, mode);

        console.clear();
        ui.header('Stopping Tunnel', selected.displayName);

        try {
            if (mode === 'native') {
                nativeStop(selected.name);
            } else {
                dockerStop(selected.name);
            }
            console.log('');
            ui.success(`Tunnel ${selected.displayName} stopped`);
            process.exit(0);
        } catch (error) {
            console.log('');
            ui.fail(`Failed to stop ${selected.displayName}: ${error.message}`);
            process.exit(1);
        }

    } catch (error) {
        if (error.message === 'Cancelled') {
            console.clear();
            console.log(`${ui.c.yellow}Cancelled${ui.c.reset}`);
            process.exit(0);
        }
        throw error;
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
