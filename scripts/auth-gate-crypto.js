// Shared crypto helpers for the per-tunnel login gate: password hashing (scrypt),
// signed session cookies (HMAC-SHA256), and the persistent gate secret.
// No dependencies — used by both auth-gate.js (host-side management) and
// auth-gate-server.js (the container-side login/verify HTTP service).
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SEVEN_DAYS = 7 * 24 * 3600;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hashHex] = parts;
  let expected, actual;
  try {
    expected = Buffer.from(hashHex, 'hex');
    actual = crypto.scryptSync(password, salt, expected.length);
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

// cookie value: "<expEpochSeconds>.<hmacHex>" — self-contained, no server-side session store
function signSession(tunnelName, secret, ttlSeconds = SEVEN_DAYS) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const mac = crypto.createHmac('sha256', secret).update(`${tunnelName}.${exp}`).digest('hex');
  return `${exp}.${mac}`;
}

function verifySession(tunnelName, cookieValue, secret) {
  if (!cookieValue || typeof cookieValue !== 'string') return false;
  const dot = cookieValue.indexOf('.');
  if (dot === -1) return false;
  const exp = parseInt(cookieValue.slice(0, dot), 10);
  const mac = cookieValue.slice(dot + 1);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${tunnelName}.${exp}`).digest('hex');
  const a = Buffer.from(mac, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function cookieName(tunnelName) {
  return `tunnel_gate_${tunnelName}`;
}

// Only a same-origin absolute path is a safe post-login redirect target.
function isSafeNextPath(next) {
  return typeof next === 'string' && /^\/(?!\/|\\)/.test(next);
}

// Generate-once, persist, reuse — so already-issued cookies survive a gate restart.
function ensureSecretFile(secretPath) {
  if (fs.existsSync(secretPath)) return fs.readFileSync(secretPath, 'utf8').trim();
  const generated = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  fs.writeFileSync(secretPath, generated);
  return generated;
}

module.exports = {
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  cookieName,
  isSafeNextPath,
  ensureSecretFile,
  SEVEN_DAYS,
};
