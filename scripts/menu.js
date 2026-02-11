#!/usr/bin/env node
const { execSync } = require('child_process');
const readline = require('readline');
const ui = require('./ui-helper');

// Menu Configuration
const menuItems = [
    {
        category: '🚀 Status & Start',
        items: [
            { name: 'Show Status', cmd: 'npm run status', desc: 'View tunnel & docker status' },
            { name: 'Start Tunnels', cmd: 'npm start', desc: 'Start all tunnels (docker up)' },
            { name: 'Stop Tunnels', cmd: 'npm stop', desc: 'Stop all tunnels (docker down)' }
        ]
    },
    {
        category: '⚙️  Management',
        items: [
            { name: 'Setup New Tunnel', cmd: 'npm run setup', desc: 'Create & configure a new tunnel' },
            { name: 'Delete Tunnel', cmd: 'npm run delete', desc: 'Remove an existing tunnel' },
            { name: 'Login to Cloudflare', cmd: 'npm run login', desc: 'Authenticate with Cloudflare' }
        ]
    },
    {
        category: '🔧 Utilities',
        items: [
            { name: 'Check Requirements', cmd: 'npm run check', desc: 'Verify system dependencies' },
            { name: 'Check DNS', cmd: 'npm run check:dns', desc: 'Inspect DNS records' },
            { name: 'Check CNAMEs', cmd: 'npm run check:cnames', desc: 'List all tunnel CNAMEs' },
            { name: 'Cleanup All CNAMEs', cmd: 'npm run cleanup:cnames', desc: 'Delete ALL tunnel CNAMEs' }
        ]
    },
    {
        category: '❌ Exit',
        items: [
            { name: 'Exit', cmd: 'exit', desc: 'Close this menu' }
        ]
    }
];

// Flatten items for linear navigation
const flatItems = [];
menuItems.forEach(cat => {
    cat.items.forEach(item => {
        flatItems.push({ ...item, categoryTitle: cat.category });
    });
});

function renderMenu(selectedIndex) {
    const width = ui.getWidth();
    const boxWidth = Math.min(Math.max(60, width - 4), 80);

    console.clear();

    // Header
    console.log(`${ui.c.cyan}${ui.c.bold}╔${'═'.repeat(boxWidth - 2)}╗${ui.c.reset}`);
    console.log(`${ui.c.cyan}${ui.c.bold}║${ui.c.reset}  ${ui.c.brightCyan}Cloudflare Tunnel Manager${ui.c.reset}${' '.repeat(boxWidth - 27)}${ui.c.cyan}${ui.c.bold}║${ui.c.reset}`);
    console.log(`${ui.c.cyan}${ui.c.bold}╚${'═'.repeat(boxWidth - 2)}╝${ui.c.reset}`);

    console.log(`${ui.c.dim}Use Up/Down to navigate, Enter to select${ui.c.reset}`);
    console.log('');

    let currentCategory = '';

    flatItems.forEach((item, index) => {
        // Print Category Header if changed
        if (item.categoryTitle !== currentCategory) {
            currentCategory = item.categoryTitle;
            console.log(`  ${ui.c.bold}${ui.c.brightMagenta}${currentCategory}${ui.c.reset}`);
        }

        const isSelected = index === selectedIndex;
        const prefix = isSelected ? `${ui.c.cyan}${ui.icons.arrow}${ui.c.reset}` : ' ';
        const nameColor = isSelected ? `${ui.c.inverse}${ui.c.bold}` : `${ui.c.white}`;
        const descColor = isSelected ? `${ui.c.inverse}${ui.c.dim}` : `${ui.c.dim}`;

        // Calculate padding
        const nameWidth = 25;
        const nameStr = item.name.padEnd(nameWidth);

        // Reset inverse for padding if needed, but easier to just inverse whole line if selected
        if (isSelected) {
            console.log(`  ${prefix} ${ui.c.cyan}${ui.c.inverse} ${nameStr} ${item.desc.padEnd(boxWidth - nameWidth - 6)} ${ui.c.reset}`);
        } else {
            console.log(`  ${prefix} ${nameColor}${nameStr}${ui.c.reset} ${descColor}${item.desc}${ui.c.reset}`);
        }
    });
    console.log('');
}

async function runMenu() {
    let selectedIndex = 0;

    // Setup keypress handling
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }

    return new Promise((resolve) => {
        const handleKey = (str, key) => {
            if (key.name === 'c' && key.ctrl) {
                process.stdin.setRawMode(false);
                process.exit();
            }

            if (key.name === 'up') {
                selectedIndex = (selectedIndex - 1 + flatItems.length) % flatItems.length;
                renderMenu(selectedIndex);
            } else if (key.name === 'down') {
                selectedIndex = (selectedIndex + 1) % flatItems.length;
                renderMenu(selectedIndex);
            } else if (key.name === 'return') {
                process.stdin.removeListener('keypress', handleKey);
                if (process.stdin.isTTY) {
                    process.stdin.setRawMode(false);
                }
                resolve(flatItems[selectedIndex]);
            } else if (key.name === 'escape') {
                process.stdin.setRawMode(false);
                process.exit();
            }
        };

        process.stdin.on('keypress', handleKey);
        renderMenu(selectedIndex);
    });
}

async function main() {
    while (true) {
        const selected = await runMenu();

        if (selected.cmd === 'exit') {
            console.clear();
            console.log('Goodbye! 👋');
            process.exit(0);
        }

        console.clear();
        ui.header('Executing', selected.name);
        // Ensure stdin is flowing and raw mode is off
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
        }
        process.stdin.resume();

        try {
            execSync(selected.cmd, { stdio: 'inherit' });
        } catch (error) {
            console.log('');
            ui.fail(`Failed to execute: ${selected.name}`);
        }

        console.log('');
        console.log(`${ui.c.dim}Press any key to return to menu...${ui.c.reset}`);

        // Wait for keypress to return to menu
        await new Promise(resolve => {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.once('data', () => {
                process.stdin.setRawMode(false);
                resolve();
            });
        });
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
