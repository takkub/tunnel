'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  getUpdaterCacheDir,
  getPendingDir,
  findPendingInstaller,
  buildInstallerArgs,
} = require('../updater-pending');

function tmpUserDataDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-updater-pending-'));
  const userData = path.join(root, 'userData');
  fs.mkdirSync(userData, { recursive: true });
  return userData;
}

test('getUpdaterCacheDir: sibling of userData named "<appName>-updater"', () => {
  const userData = path.join('C:', 'Users', 'x', 'AppData', 'Roaming', 'Tunnel Manager');
  assert.equal(
    getUpdaterCacheDir(userData, 'tunnel-desktop'),
    path.join('C:', 'Users', 'x', 'AppData', 'Roaming', 'tunnel-desktop-updater')
  );
});

test('findPendingInstaller: returns null when the pending dir does not exist', () => {
  const userData = tmpUserDataDir();
  assert.equal(findPendingInstaller(userData, 'tunnel-desktop', 'win32'), null);
});

test('findPendingInstaller: picks the newest matching installer file by mtime', () => {
  const userData = tmpUserDataDir();
  const pendingDir = getPendingDir(userData, 'tunnel-desktop');
  fs.mkdirSync(pendingDir, { recursive: true });

  const older = path.join(pendingDir, 'tunnel-1.1.10-win-x64.exe');
  const newer = path.join(pendingDir, 'tunnel-1.1.11-win-x64.exe');
  fs.writeFileSync(older, 'a');
  fs.writeFileSync(newer, 'b');
  const now = Date.now();
  fs.utimesSync(older, new Date(now - 60000), new Date(now - 60000));
  fs.utimesSync(newer, new Date(now), new Date(now));

  assert.equal(findPendingInstaller(userData, 'tunnel-desktop', 'win32'), newer);
});

test('findPendingInstaller: ignores files that do not match the platform installer extension', () => {
  const userData = tmpUserDataDir();
  const pendingDir = getPendingDir(userData, 'tunnel-desktop');
  fs.mkdirSync(pendingDir, { recursive: true });
  fs.writeFileSync(path.join(pendingDir, 'tunnel-1.1.11-mac.dmg'), 'a');
  fs.writeFileSync(path.join(pendingDir, 'readme.txt'), 'a');

  assert.equal(findPendingInstaller(userData, 'tunnel-desktop', 'win32'), null);
});

test('findPendingInstaller: prefers a metadata file naming the installer explicitly, when it resolves', () => {
  const userData = tmpUserDataDir();
  const pendingDir = getPendingDir(userData, 'tunnel-desktop');
  fs.mkdirSync(pendingDir, { recursive: true });
  const named = path.join(pendingDir, 'tunnel-1.1.11-win-x64.exe');
  const decoy = path.join(pendingDir, 'tunnel-1.1.12-win-x64.exe');
  fs.writeFileSync(named, 'a');
  fs.writeFileSync(decoy, 'b');
  fs.writeFileSync(path.join(pendingDir, 'update-info.json'), JSON.stringify({ packageFile: 'tunnel-1.1.11-win-x64.exe' }));

  assert.equal(findPendingInstaller(userData, 'tunnel-desktop', 'win32'), named);
});

test('findPendingInstaller: falls back to newest-by-mtime when the metadata file points at a missing file', () => {
  const userData = tmpUserDataDir();
  const pendingDir = getPendingDir(userData, 'tunnel-desktop');
  fs.mkdirSync(pendingDir, { recursive: true });
  const real = path.join(pendingDir, 'tunnel-1.1.11-win-x64.exe');
  fs.writeFileSync(real, 'a');
  fs.writeFileSync(path.join(pendingDir, 'update-info.json'), JSON.stringify({ packageFile: 'does-not-exist.exe' }));

  assert.equal(findPendingInstaller(userData, 'tunnel-desktop', 'win32'), real);
});

test('buildInstallerArgs: mirrors electron-updater NSIS silent+force-run flags on win32, empty elsewhere', () => {
  assert.deepEqual(buildInstallerArgs('win32'), ['--updated', '/S', '--force-run']);
  assert.deepEqual(buildInstallerArgs('darwin'), []);
  assert.deepEqual(buildInstallerArgs('linux'), []);
});
