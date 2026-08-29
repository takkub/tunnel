const test = require('node:test');
const assert = require('node:assert/strict');

const { computeNeedsOnboarding } = require('../../web/lib/setup-status');

const COMPLETE = { installed: true, loggedIn: true, zoneSet: true, adminPasswordSet: true, desktopMode: false };

test('needs onboarding when cloudflared is not installed', () => {
  assert.equal(computeNeedsOnboarding({ ...COMPLETE, installed: false }), true);
});

test('needs onboarding when not logged in to cloudflared', () => {
  assert.equal(computeNeedsOnboarding({ ...COMPLETE, loggedIn: false }), true);
});

test('needs onboarding when no zone is set', () => {
  assert.equal(computeNeedsOnboarding({ ...COMPLETE, zoneSet: false }), true);
});

test('needs onboarding when admin password is unset and not in desktop mode', () => {
  assert.equal(computeNeedsOnboarding({ ...COMPLETE, adminPasswordSet: false, desktopMode: false }), true);
});

test('does NOT need onboarding when admin password is unset but desktop mode is on', () => {
  assert.equal(computeNeedsOnboarding({ ...COMPLETE, adminPasswordSet: false, desktopMode: true }), false);
});

test('does not need onboarding once every required step is complete', () => {
  assert.equal(computeNeedsOnboarding(COMPLETE), false);
});

test('does not need onboarding in desktop mode with no admin password, even with other steps false checked independently', () => {
  // desktopMode only ever waives the admin-password requirement, not the others
  assert.equal(computeNeedsOnboarding({ installed: true, loggedIn: true, zoneSet: true, adminPasswordSet: false, desktopMode: true }), false);
  assert.equal(computeNeedsOnboarding({ installed: false, loggedIn: true, zoneSet: true, adminPasswordSet: false, desktopMode: true }), true);
});
