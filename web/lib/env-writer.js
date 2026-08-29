// Updates KEY=value lines in <dataDir>/.env without disturbing anything else
// in the file (comments, blank lines, unrelated keys) — so the setup wizard
// can hand-write ADMIN_PASSWORD/SESSION_SECRET without clobbering a user's
// existing CLOUDFLARE_API_TOKEN/ZONE_ID (or vice versa).
//
// Plain CommonJS so scripts/__tests__/*.test.js can require() it directly
// with node:test, same convention as env-file.js / redirect-origin.js.
'use strict';
const fs = require('fs');
const path = require('path');

// Always double-quotes so values with spaces/#/etc. round-trip safely;
// backslashes and embedded double quotes are escaped.
function quoteValue(value) {
  const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

// Never logs `updates` — callers pass secrets (ADMIN_PASSWORD, SESSION_SECRET).
function updateEnvFile(dataDir, updates) {
  const envPath = path.join(dataDir, '.env');
  let content = '';
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch {
    // no .env yet — start from an empty file
  }

  const lines = content.length ? content.split(/\r?\n/) : [];
  const remaining = new Map(Object.entries(updates));

  const nextLines = lines.map((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (!match) return line;
    const key = match[1];
    if (!remaining.has(key)) return line;
    const value = remaining.get(key);
    remaining.delete(key);
    return `${key}=${quoteValue(value)}`;
  });

  while (nextLines.length && nextLines[nextLines.length - 1] === '') nextLines.pop();

  for (const [key, value] of remaining) {
    nextLines.push(`${key}=${quoteValue(value)}`);
  }

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(envPath, nextLines.join('\n') + '\n', { mode: 0o600 });
  try {
    fs.chmodSync(envPath, 0o600);
  } catch {
    // best-effort on platforms without POSIX permission bits (e.g. Windows)
  }
}

module.exports = { updateEnvFile, quoteValue };
