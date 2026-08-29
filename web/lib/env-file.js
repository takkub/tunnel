// Lazy, mtime-cached reader for <dataDir>/.env — for long-running Node.js
// server code (API routes) that needs a value written to .env *after* this
// process started (e.g. the setup wizard's PUT /api/settings) to take effect
// without a restart. Unlike scripts/settings-store.js's process.env fallback
// (populated once at each short-lived CLI script's startup via `dotenv.config()`
// — a fresh process every run, so there's nothing to go stale), this server
// keeps running, so ADMIN_PASSWORD/CLOUDFLARE_API_TOKEN/ZONE_ID written to disk
// later must be picked up on the next read, not just at boot.
//
// Plain CommonJS (not .ts) so scripts/__tests__/*.test.js can require() it
// directly with node:test — same convention as web/lib/redirect-origin.js.
'use strict';
const fs = require('fs');
const path = require('path');

// dataDir -> { mtimeMs, vars }
const cache = new Map();

function parseEnvFile(content) {
  const vars = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1);
      }
    }
    vars[key] = value;
  }
  return vars;
}

function readEnvFileVars(dataDir) {
  const envPath = path.join(dataDir, '.env');
  let stat;
  try {
    stat = fs.statSync(envPath);
  } catch {
    cache.delete(dataDir);
    return {};
  }
  const cached = cache.get(dataDir);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.vars;
  const vars = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
  cache.set(dataDir, { mtimeMs: stat.mtimeMs, vars });
  return vars;
}

// A real process.env value always wins over the file — same precedence as
// scripts/settings-store.js / desktop/src/dotenv-env.js elsewhere in this repo.
function getEnvValue(dataDir, key) {
  if (process.env[key] !== undefined) return process.env[key];
  const value = readEnvFileVars(dataDir)[key];
  return value === undefined ? null : value;
}

function __resetCacheForTests(dataDir) {
  if (dataDir) cache.delete(dataDir);
  else cache.clear();
}

module.exports = { getEnvValue, readEnvFileVars, parseEnvFile, __resetCacheForTests };
