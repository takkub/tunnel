// Fallback for installUpdate(): finds an already-downloaded installer on disk
// that electron-updater's own in-memory state has lost track of (e.g. this
// process never ran the download — it was a previous app session that did,
// or autoUpdater's internal DownloadedUpdateHelper state didn't survive a
// restart). electron-updater (NsisUpdater/MacUpdater/AppImageUpdater) caches
// a completed download under <userData>/../<appName>-updater/pending/ — see
// electron-updater's DownloadedUpdateHelper.cacheDirForPendingUpdate. Kept as
// a plain, electron-free CJS module so it's unit-testable with node:test
// directly (see __tests__/updater-pending.test.js).
'use strict';
const fs = require('fs');
const path = require('path');

const INSTALLER_EXT_BY_PLATFORM = {
  win32: ['.exe'],
  darwin: ['.dmg', '.pkg', '.zip'],
  linux: ['.AppImage', '.deb', '.rpm'],
};

function getUpdaterCacheDir(userDataDir, appName) {
  return path.join(userDataDir, '..', `${appName}-updater`);
}

function getPendingDir(userDataDir, appName) {
  return path.join(getUpdaterCacheDir(userDataDir, appName), 'pending');
}

// A metadata file (electron-updater has used names like update-info.json /
// installer.json across versions) can name the exact installer explicitly —
// preferred when present and it actually resolves to a file on disk. Falls
// back to the newest installer-shaped file in the pending dir otherwise, so
// this still works even if the metadata file's name/shape has changed.
function readMetadataPath(pendingDir) {
  let entries;
  try { entries = fs.readdirSync(pendingDir); } catch { return null; }
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(pendingDir, entry), 'utf8'));
      const candidate = data.packageFile || data.installerPath || data.path;
      if (typeof candidate === 'string') {
        const resolved = path.isAbsolute(candidate) ? candidate : path.join(pendingDir, candidate);
        if (fs.existsSync(resolved)) return resolved;
      }
    } catch {
      // not a metadata file we recognize — ignore
    }
  }
  return null;
}

function newestInstallerFile(pendingDir, platform) {
  const exts = INSTALLER_EXT_BY_PLATFORM[platform] || [];
  let entries;
  try { entries = fs.readdirSync(pendingDir); } catch { return null; }
  let best = null;
  for (const entry of entries) {
    if (!exts.some(ext => entry.toLowerCase().endsWith(ext.toLowerCase()))) continue;
    const full = path.join(pendingDir, entry);
    let mtimeMs;
    try { mtimeMs = fs.statSync(full).mtimeMs; } catch { continue; }
    if (!best || mtimeMs > best.mtimeMs) best = { full, mtimeMs };
  }
  return best ? best.full : null;
}

// Returns the absolute path to a pending installer for `platform`, or null
// if none is found.
function findPendingInstaller(userDataDir, appName, platform = process.platform) {
  const pendingDir = getPendingDir(userDataDir, appName);
  return readMetadataPath(pendingDir) || newestInstallerFile(pendingDir, platform);
}

// Mirrors electron-updater's own NsisUpdater install invocation
// (isSilent -> '/S', isForceRunAfter -> '--force-run') so a manually-spawned
// fallback behaves the same as the flow it's standing in for.
function buildInstallerArgs(platform = process.platform) {
  if (platform !== 'win32') return [];
  return ['--updated', '/S', '--force-run'];
}

module.exports = {
  getUpdaterCacheDir,
  getPendingDir,
  findPendingInstaller,
  buildInstallerArgs,
};
