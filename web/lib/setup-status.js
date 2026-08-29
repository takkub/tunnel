// Pure onboarding-gate logic for GET /api/setup-status, split out of the
// route module so node:test can exercise it directly (route.ts pulls in
// next/server, which node:test can't import).
'use strict';

function computeNeedsOnboarding({ installed, loggedIn, zoneSet, adminPasswordSet, desktopMode }) {
  if (!installed || !loggedIn || !zoneSet) return true;
  if (!desktopMode && !adminPasswordSet) return true;
  return false;
}

module.exports = { computeNeedsOnboarding };
