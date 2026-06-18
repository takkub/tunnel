// One-time migration: move root docker-compose-cloudflare-<name>.yml
// into tunnels/<name>/docker-compose.yml with corrected volume path.
// Also generates launchers for each tunnel.
const fs = require('fs');
const path = require('path');
const { generateLaunchers } = require('./runtime');

const ROOT = path.join(__dirname, '..');
const TUNNELS_DIR = path.join(ROOT, 'tunnels');

const files = fs.readdirSync(ROOT).filter(
  f => f.startsWith('docker-compose-cloudflare-') && f.endsWith('.yml')
);

console.log(`Found ${files.length} root compose files to migrate.\n`);

let ok = 0, skip = 0, err = 0;

for (const file of files) {
  const m = file.match(/^docker-compose-cloudflare-(.+)\.yml$/);
  if (!m) { skip++; continue; }
  const name = m[1];
  const tunnelDir = path.join(TUNNELS_DIR, name);

  if (!fs.existsSync(tunnelDir)) {
    console.warn(`  [SKIP] tunnels/${name}/ not found — skipping ${file}`);
    skip++;
    continue;
  }

  const destFile = path.join(tunnelDir, 'docker-compose.yml');
  if (fs.existsSync(destFile)) {
    console.log(`  [SKIP] tunnels/${name}/docker-compose.yml already exists`);
    skip++;
    continue;
  }

  // Read original and replace volume path
  let content = fs.readFileSync(path.join(ROOT, file), 'utf8');
  // Replace: ./tunnels/<name>:/etc/cloudflared  →  .:/etc/cloudflared
  content = content.replace(
    new RegExp(`\\.\/tunnels\\/${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\/etc\\/cloudflared`, 'g'),
    '.:/etc/cloudflared'
  );

  try {
    fs.writeFileSync(destFile, content);
    generateLaunchers(name);
    fs.unlinkSync(path.join(ROOT, file));
    console.log(`  [OK]   ${file}  →  tunnels/${name}/docker-compose.yml  (+launchers, deleted root)`);
    ok++;
  } catch (e) {
    console.error(`  [ERR]  ${name}: ${e.message}`);
    err++;
  }
}

console.log(`\nDone: ${ok} migrated, ${skip} skipped, ${err} errors.`);
