// "Try once, and on failure retry once more" helper for starting the local
// web server. Every side effect is injected so this stays testable without a
// real child process/timers — see __tests__/server-startup.test.js.
//
// v1.1.11 update incident: after a fresh install relaunch, the server child
// was alive (visible in the process list, near-zero CPU) but never bound its
// listen socket, so waitForServer() timed out at 30s and the app just showed
// a dialog and quit — a single stuck launch took the whole app down with no
// second chance and no trace of why. This gives it one retry (a fresh spawn,
// after killing the stuck one) before giving up for real.
'use strict';

/**
 * @param {{
 *   spawnAndWait: () => Promise<{ port: number; url: string }>,
 *   killPrevious: () => Promise<void>,
 *   log?: (line: string) => void,
 * }} opts
 * @returns {Promise<{ port: number; url: string }>}
 */
async function startServerWithRetry({ spawnAndWait, killPrevious, log = () => {} }) {
  try {
    return await spawnAndWait();
  } catch (err) {
    log(`[server] first start attempt failed, retrying once: ${err.message}`);
    await killPrevious();
    try {
      return await spawnAndWait();
    } catch (retryErr) {
      log(`[server] retry also failed, giving up: ${retryErr.message}`);
      throw retryErr;
    }
  }
}

module.exports = { startServerWithRetry };
