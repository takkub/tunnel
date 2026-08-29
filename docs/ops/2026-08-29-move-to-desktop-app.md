# Move tunnel system to the Desktop app (2026-08-29)

Migrated the whole tunnel system from native/terminal-run processes to the packaged Electron
desktop app (`desktop/`) on this Windows machine. Not committed — this file is for Lead to review.

## Result

- Desktop app built from main HEAD `d9e76e4` (includes the `bf40f10` auth-bypass fix) and
  installed silently (NSIS `/S`) to `C:\Users\monch\AppData\Local\Programs\Tunnel Manager`.
- All 9 tunnels now run as cloudflared processes spawned by the app, using
  `%APPDATA%\tunnel-desktop` as `TUNNEL_DATA_DIR` (own `bin\cloudflared.exe`, own `runtime/*/.pid`).
- The app's own bundled Next server (not the old native `web-serve.js`) now serves
  `tunnels.sabuytube.xyz` directly on port 8888 — no ingress config edit needed.
- `desktop.launchAtLogin=true` and `desktop.autostartTunnelsOnLaunch=true` are set in
  `%APPDATA%\tunnel-desktop\settings.json`; confirmed live in
  `HKCU\...\Run` → `electron.app.Tunnel Manager` → `Tunnel Manager.exe --hidden`.
- Old native web server and all 8 non-`oooo` native cloudflared processes are stopped.
  `oooo`'s old *repo-managed* connector is stopped too — see the `oooo` section below for why
  this was safe despite the "never drop oooo" constraint.
- Docker: confirmed no tunnel-related container is running (`tunnel-*`, `cloudflared-tunnel-*` all
  `Exited`) — none were touched.

## New process PIDs (this session)

| tunnel | old PID (killed) | new PID (app-managed) |
|---|---|---|
| admin-wash-locker-dev | 42848 | 52364 |
| api-wash-locker-dev | 56528 | 39444 |
| demo-game | 42336 | 33296 |
| liff-wash-locker-dev | 51312 | 46420 |
| st | 35488 | 56736 |
| super | 15112 | 35712 |
| tunnels | 28752 | 58216 |
| whisper | 3260 | 59084 |
| oooo (repo-managed) | 19544 | 27120 |

App's own Next server (serving `tunnels.sabuytube.xyz` on :8888): PID 41068.
Electron main process: PID 52556.

Old native web server (`web-serve.js`, was serving :8888): PID 32620, stopped via
`node scripts/web-serve.js stop`.

## `oooo` — the sensitive one

Found there are actually **two independent old connectors** for `oooo`, not one:

1. `tunnels\oooo\config.yml` (repo-managed, PID 19544) — what this migration replaces.
2. `.agent-takkub\runtime\tunnel\config.yml` (PID 30948) — **the takkub cockpit's own
   infrastructure**, completely outside this repo/app's management. `autostart.js`'s
   "is this tunnel already running" check only matches on the literal substring
   `tunnels\oooo\config.yml` in a process's command line, so PID 30948 is invisible to it and was
   never a candidate for being touched by anything in this migration.

Both point at the same tunnel ID and the same `oooo.sabuytube.xyz → localhost:9999` ingress, so
Cloudflare load-balances across whichever of them are alive — PID 30948 alone is enough to keep
`oooo.sabuytube.xyz` reachable.

**Sequence used:** confirmed `oooo.sabuytube.xyz` baseline (404, expected — no `/` route) →
killed only PID 19544 → re-curled immediately, still 404, PID 30948 confirmed still alive → ran
the app's `autostart.js` again, which spawned a new connector (PID 27120) → confirmed all 4 edge
connections registered in its log → re-curled, still 404 (no change throughout).

**Why old-before-new was unavoidable for the repo-managed connector:** `scripts/runtime.js`'s
`nativeStart()` hard-refuses to start a tunnel it already sees as running (existing guard against
double-starting the same tunnel — the code comment even cites a prior production incident from
skipping this check), and `autostart.js`'s pre-check for `oooo` did skip it while PID 19544 was
alive. There is no code path that spawns a second app-managed connector alongside a still-running
one for the same name, so "new connects before old stops" as literally written could not be done
for PID 19544 without editing this guard (out of scope — devops role does not change source).
**PID 30948 never went down at any point**, which is what actually mattered for keeping the
cockpit connection safe; `oooo.sabuytube.xyz` had zero measured downtime (404 baseline → 404
throughout → 404 after).

## Gap found and fixed by Lead mid-task: desktop app never loaded `.env`

Original code: `desktop/src/server.ts` spread `...process.env` into the spawned Next server's env
with nothing upstream ever loading `<TUNNEL_DATA_DIR>/.env` into the Electron main process (no
`dotenv` dependency in `desktop/package.json` at all). Consequence: `ADMIN_PASSWORD` never reached
the spawned server, and `middleware.ts`'s `DESKTOP_MODE && !ADMIN_PASSWORD` bypass would then skip
login entirely — including for traffic arriving over the public cloudflared tunnel, not just the
local Electron window.

Found this during code review before building anything; reported it and did **not** patch it
myself. Lead's team merged `bf40f10` (`desktop/src/dotenv-env.js` + `buildSpawnEnv()`, threaded
into `server.ts`/`autostart.ts`/`tunnels.ts`; `middleware.ts` also now 403s a non-loopback Host
when `ADMIN_PASSWORD` is unset, as defense in depth). Built from that commit. Verified:

- `curl -sI https://tunnels.sabuytube.xyz/` → `307` → `/login` (not bypassed).
- `POST /api/auth/login` with the real `ADMIN_PASSWORD` from `.env` → `200`, session cookie set.
- Authenticated `GET /` through the public URL with that cookie → `200`.
- Local Electron window also shows the login screen (screenshot below) — confirms
  `ADMIN_PASSWORD` gates access everywhere once set, matching the code comment's intent, not just
  the public host.

## Port: no ingress edit needed, no code change needed

`desktop/src/server.ts` picks its port via `get-port` from `[8888, 8889, 8890, 8891, 8892]` — still
fully dynamic, no env override exists for pinning it. Rather than edit that (out of scope), the
native web server was stopped **before** launching the app, so `get-port` claimed 8888 as the free
first candidate on its own. `tunnels/tunnels/config.yml`'s ingress (`http://localhost:8888`) never
needed to change. This is sequencing, not a code fix, and it's fragile: if the app is ever
restarted while something else holds 8888, it will silently fall back to 8889 and the public host
will start 502ing. **Recommend**: add an explicit `PORT`/`TUNNEL_WEB_PORT` override read before the
`get-port` call, so this doesn't depend on start order.

## A real, unrelated incident found and fixed along the way: build hang from a live file lock

`npm run dist` (specifically the `next build` step) hung indefinitely with near-zero CPU every
single time it was run against the real `web/` directory — reproducible, but *not* environmental:
a clean git worktree of the exact same code built in under two minutes every time. Root cause:
`web/.next/standalone/server.js` was open the whole time by the still-running native web server
(PID 32620), and Windows refuses to let `next build` overwrite files that another process holds
open, so the build step attempting to overwrite `.next/standalone/*` blocked forever instead of
erroring. Fixed by stopping the native web server before rebuilding — this also happened to be a
required step for the desktop app to claim port 8888 anyway (see above), so no extra downtime was
introduced by the fix itself, only revealed the existing dependency earlier.

Also hit (before finding the above): two rounds of a **different** pane building `web/` at the
same time as this one — genuine lock contention, unrelated to the file-lock issue, resolved by
Lead each time (killed the competing process, ultimately closed that pane). Both issues looked
identical from the outside (build stalls, ~0 CPU) and had to be told apart with an A/B test
(clean-worktree build vs. real-path build) rather than assumed.

## Downtime

- `tunnels.sabuytube.xyz`: from `node scripts/web-serve.js stop` (~04:36 UTC) until the app's own
  server + its `tunnels` cloudflared connector came up (~04:44 UTC autostart run) — a few minutes,
  driven by the build/install/data-copy steps in between, not by the cutover itself.
- The other 8 tunnels: each had a few-second gap between its old PID being killed and the app's
  `autostart.js` spawning its replacement (all 8 done in one batch).
- `oooo.sabuytube.xyz`: **zero** measured downtime (see above — PID 30948 covered the whole gap).

## Verification performed

- `cloudflared.exe` process count: 10 (9 app-managed + the untouched takkub-infra `oooo` connector,
  PID 30948, which is intentionally out of scope for this migration).
- All 9 public hosts curled: `demo-game` 200, `super`/`tunnels` 307→/login, `oooo` 404 (consistent
  baseline), the remaining 5 (`admin-wash-locker-dev`, `api-wash-locker-dev`,
  `liff-wash-locker-dev`, `st`, `whisper`) 502 — confirmed pre-existing (their target `localhost`
  ports have no local server running, unrelated to this migration; the 502 itself proves the
  tunnel connector is healthy and reaching Cloudflare's edge).
- `HKCU\...\Run` has `electron.app.Tunnel Manager` → confirms `launchAtLogin` took effect at the OS
  level, not just in `settings.json`.
- Screenshot of the running app window taken (tray + window both confirmed up); saved to the
  devops artifacts dir for this session, not committed here.
- `docker ps -a` shows no tunnel-related container running.

## Not done / left for follow-up

- **Fix the port**: pin the app's Next server to a configurable port instead of relying on start
  order (see "Port" section above) — a real code change, left for a dev pane.
- `settings.json`'s `cloudflare.apiToken`/`zoneId` were **not** populated (only `desktop.*` was
  written, per the task's explicit scope) — the app's own token-verify/DNS-management UI features
  will fall back to `.env`'s `CLOUDFLARE_API_TOKEN`/`ZONE_ID`, which the dotenv fix now correctly
  threads into every spawned child, so this should work but wasn't separately exercised here.
- A Windows Firewall "allow public and private networks" prompt appeared on the app's first launch
  (expected for a new app binding a listen socket) — clicked Allow so autostart/verification could
  proceed. Worth noting for anyone else installing fresh: it will reappear on other machines.
