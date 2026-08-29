// Per-tunnel metadata (currently: autostart) persisted to
// <TUNNELS_DIR>/<name>/tunnel.json. Same read/merge-with-defaults convention
// as auth-gate.js's readState/writeState for tunnels/<name>/auth-gate.json.
'use strict';
const fs = require('fs');
const path = require('path');
const { TUNNELS_DIR } = require('./runtime');

const DEFAULTS = { autostart: false };

function getMetaPath(name) {
  return path.join(TUNNELS_DIR, name, 'tunnel.json');
}

function readMeta(name) {
  const p = getMetaPath(name);
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(p, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeMeta(name, meta) {
  const p = getMetaPath(name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(meta, null, 2) + '\n');
}

function getAutostart(name) {
  return readMeta(name).autostart === true;
}

function setAutostart(name, autostart) {
  const meta = readMeta(name);
  meta.autostart = Boolean(autostart);
  writeMeta(name, meta);
  return meta.autostart;
}

module.exports = {
  getMetaPath,
  readMeta,
  writeMeta,
  getAutostart,
  setAutostart,
};
