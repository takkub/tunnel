// Pure port-selection logic, kept free of electron/node I/O so it can run
// under plain `node --test` — see __tests__/port-resolver.test.js.
'use strict';

// TUNNEL_WEB_PORT (env) wins over settings.json's desktop.webPort. Returns
// null when neither is a valid port, meaning "no fixed port requested".
function resolveConfiguredPort({ envPort, settingsWebPort } = {}) {
  const fromEnv = parsePort(envPort);
  if (fromEnv !== null) return fromEnv;
  return parsePort(settingsWebPort);
}

function parsePort(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
  return n;
}

// If configuredPort is set, retries `isPortFree(configuredPort)` up to
// `retries` times (2s apart by default) before falling back to
// `getFallbackPort()`. Every dependency is injected so this stays testable
// without real sockets/timers.
async function acquirePort(configuredPort, opts) {
  const { retries = 5, delayMs = 2000, isPortFree, getFallbackPort, log = () => {}, sleep = defaultSleep } = opts;

  if (configuredPort !== null) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      if (await isPortFree(configuredPort)) return configuredPort;
      log(`[server] configured port ${configuredPort} is in use (attempt ${attempt}/${retries})`);
      if (attempt < retries) await sleep(delayMs);
    }
    log(`[server] configured port ${configuredPort} still in use after ${retries} attempts — falling back to an available port`);
  }

  return getFallbackPort();
}

function defaultSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { resolveConfiguredPort, acquirePort };
