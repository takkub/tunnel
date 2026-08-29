// Collects *.test.js files under each test directory and runs them via
// `node --test <files...>`. Avoids both shell glob expansion (pwsh on
// windows-latest does not expand `*.test.js`, unlike bash) and node's own
// version-gated glob-pattern support in test-runner positional args.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TEST_DIRS = ['scripts/__tests__', 'desktop/src/__tests__'];

const files = [];
for (const dir of TEST_DIRS) {
  const abs = path.join(__dirname, '..', dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs)) {
    if (f.endsWith('.test.js')) files.push(path.join(abs, f));
  }
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
