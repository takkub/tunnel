try { require('dotenv').config(); } catch {}
const { listDnsRecords, deleteDnsRecord } = require('./cloudflare-api');
const ui = require('./ui-helper');
const readline = require('readline');

const CI_MODE = process.env.CI === '1' || !process.stdin.isTTY;

const rl = CI_MODE ? null : readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => {
        // Print styled prompt (console.log ensures flush)
        console.log(`${ui.c.cyan}${ui.icons.arrow}${ui.c.reset} ${query}`);
        // Read input on next line
        rl.question('', resolve);
    });
}

async function main() {
    ui.warningHeader('Cleanup CNAMEs', 'Delete ALL Tunnel CNAME records');

    const zoneId = process.env.ZONE_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!zoneId || !apiToken) {
        ui.error('Missing .env configuration');
        console.log(`  ${ui.c.dim}Please check check your .env file:${ui.c.reset}`);
        process.exit(1);
    }

    ui.step(1, 2, `${ui.icons.cloud} Scanning for Tunnel CNAME records...`);

    try {
        const records = await listDnsRecords(zoneId, apiToken);

        // Filter for CNAMEs pointing to cfargotunnel.com
        const cnames = records.filter(r =>
            r.type === 'CNAME' &&
            r.content.includes('cfargotunnel.com')
        );

        if (cnames.length === 0) {
            ui.success('No Tunnel CNAME records found to delete');
            if (rl) rl.close();
            return;
        }

        // List records to be deleted
        console.log('');
        ui.section(`Found ${cnames.length} records to DELETE:`);
        console.log('');
        ui.tableHeader(['NAME', 'TARGET'], [30, 40]);
        cnames.forEach(r => {
            console.log(`  ${ui.c.red}${r.name.padEnd(30)}${ui.c.reset} ${ui.c.dim}${r.content.slice(0, 40)}${ui.c.reset}`);
        });

        console.log('');
        ui.box(`${ui.icons.warning} DANGER ZONE`, [
            'These records will be permanently deleted.',
            'This action cannot be undone.',
            '',
            `Total Records: ${cnames.length}`
        ]);
        console.log('');

        if (!CI_MODE) {
            const confirm = await question(`Type "${ui.c.red}DELETE ALL${ui.c.reset}" to confirm: `);
            if (confirm !== 'DELETE ALL') {
                ui.warning('Cancelled');
                if (rl) rl.close();
                return;
            }
        } else {
            ui.warning('CI mode: skipping confirmation, deleting all');
        }

        ui.step(2, 2, `${ui.icons.trash} Deleting records...`);

        let deletedCount = 0;
        let failCount = 0;

        for (const record of cnames) {
            process.stdout.write(`  ${ui.c.dim}Deleting ${record.name}... ${ui.c.reset}`);
            const success = await deleteDnsRecord(zoneId, record.id, apiToken);

            if (success) {
                console.log(`${ui.c.green}OK${ui.c.reset}`);
                deletedCount++;
            } else {
                console.log(`${ui.c.red}FAILED${ui.c.reset}`);
                failCount++;
            }
        }

        console.log('');
        ui.summaryBox('Cleanup Results', [
            ['Total Found', cnames.length],
            ['Deleted', deletedCount],
            ['Failed', failCount]
        ]);

        if (failCount === 0) {
            ui.complete('All CNAMEs deleted successfully!');
        } else {
            ui.warning('Some records could not be deleted');
        }

    } catch (error) {
        ui.fail(`Error: ${error.message}`);
    }

    if (rl) rl.close();
}

main();
