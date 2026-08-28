try { require('dotenv').config(); } catch {}
const { listDnsRecords } = require('./cloudflare-api');
const settingsStore = require('./settings-store');
const ui = require('./ui-helper');

async function main() {
    ui.header('CNAME Checker', 'List all Tunnel CNAME records');

    const zoneId = settingsStore.getZoneId();
    const apiToken = settingsStore.getCloudflareToken();

    if (!zoneId || !apiToken) {
        ui.error('Missing Cloudflare configuration');
        console.log(`  ${ui.c.dim}Set these in Settings, or in your .env file:${ui.c.reset}`);
        console.log(`  ${ui.c.dim}ZONE_ID=${zoneId || 'MISSING'}${ui.c.reset}`);
        console.log(`  ${ui.c.dim}CLOUDFLARE_API_TOKEN=${apiToken ? '********' : 'MISSING'}${ui.c.reset}`);
        process.exit(1);
    }

    ui.step(1, 1, `${ui.icons.cloud} Fetching DNS records from Cloudflare...`);

    try {
        const records = await listDnsRecords(zoneId, apiToken);

        const cnames = records.filter(r =>
            r.type === 'CNAME' &&
            r.content.includes('cfargotunnel.com')
        );

        if (cnames.length === 0) {
            ui.success('No Tunnel CNAME records found');
        } else {
            console.log('');
            ui.tableHeader(['NAME', 'TARGET'], [30, 40]);

            cnames.forEach(r => {
                ui.tableRow([r.name, r.content], [30, 40]);
            });

            console.log('');
            ui.info(`Found ${cnames.length} CNAME records`);
        }

    } catch (error) {
        ui.fail(`Error fetching records: ${error.message}`);
    }
}

main();
