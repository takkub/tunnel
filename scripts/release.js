#!/usr/bin/env node
'use strict';

// One-command release: bump version -> commit -> tag -> push.
// GitHub Actions (.github/workflows/release.yml) picks up the pushed tag
// and builds/publishes the desktop installers.
//
// Usage: npm run release -- patch|minor|major

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ROOT_PKG_PATH = path.join(ROOT, 'package.json');
const DESKTOP_PKG_PATH = path.join(ROOT, 'desktop', 'package.json');

function run(cmd) {
  execSync(cmd, { stdio: 'inherit', cwd: ROOT });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function bumpVersion(version, type) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) {
    throw new Error(`Cannot parse version "${version}" (expected x.y.z)`);
  }
  let [major, minor, patch] = match.slice(1).map(Number);
  if (type === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (type === 'minor') {
    minor += 1;
    patch = 0;
  } else if (type === 'patch') {
    patch += 1;
  } else {
    throw new Error(`Unknown release type "${type}" (expected patch|minor|major)`);
  }
  return `${major}.${minor}.${patch}`;
}

function main() {
  const type = process.argv[2];
  if (!['patch', 'minor', 'major'].includes(type)) {
    console.error('Usage: npm run release -- <patch|minor|major>');
    process.exit(1);
  }

  const status = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
  if (status) {
    console.error('Working tree is not clean. Commit or stash changes before releasing.');
    process.exit(1);
  }

  const rootPkg = readJson(ROOT_PKG_PATH);
  const nextVersion = bumpVersion(rootPkg.version, type);
  const tag = `v${nextVersion}`;

  rootPkg.version = nextVersion;
  writeJson(ROOT_PKG_PATH, rootPkg);
  const filesToAdd = [ROOT_PKG_PATH];

  if (fs.existsSync(DESKTOP_PKG_PATH)) {
    const desktopPkg = readJson(DESKTOP_PKG_PATH);
    desktopPkg.version = nextVersion;
    writeJson(DESKTOP_PKG_PATH, desktopPkg);
    filesToAdd.push(DESKTOP_PKG_PATH);
  }

  run(`git add ${filesToAdd.map((f) => `"${f}"`).join(' ')}`);
  run(`git commit -m "chore(release): ${tag}"`);
  run(`git tag ${tag}`);
  run('git push');
  run(`git push origin ${tag}`);

  console.log(`Released ${tag}. GitHub Actions will build and publish the installers.`);
}

main();
