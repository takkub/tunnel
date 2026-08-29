// Loads <TUNNEL_DATA_DIR>/.env via dotenv.parse (never dotenv.config()) so it
// never mutates this process's own process.env — values are threaded
// explicitly into each spawned child's env instead. Kept as a plain,
// electron-free CJS module so it's unit-testable with node:test directly
// (see scripts/__tests__/desktop-dotenv-env.test.js) without an Electron
// runtime, and compiled into dist/ via tsconfig's allowJs like the rest of
// desktop/src.
'use strict';
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function loadDotEnvVars(dataDir) {
  try {
    return dotenv.parse(fs.readFileSync(path.join(dataDir, '.env'), 'utf8'));
  } catch {
    return {};
  }
}

// .env values fill gaps; a key already present on this process's real
// process.env (an actual OS/Electron env var, not one merely read from the
// file) always wins over it — same precedence as scripts/web-serve.js's
// dotenvVars merge. `overrides` (computed values like PORT/SESSION_SECRET)
// wins over both.
function buildSpawnEnv(dataDir, overrides = {}) {
  return { ...loadDotEnvVars(dataDir), ...process.env, ...overrides };
}

module.exports = { loadDotEnvVars, buildSpawnEnv };
