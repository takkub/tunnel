# Native web dashboard (no Docker) — 2026-08-29

## Problem

`tunnels.sabuytube.xyz` (tunnel `tunnels` → `http://localhost:8888`) was returning 502.
`tunnel-tunnel-web-1` (the Docker container that used to serve the dashboard) had been
`Exited (0)` for ~9h. Per user decision, the web UI now runs **natively**, no Docker.

## What was run

Build: `web/.next/standalone` was already fresh — its `server.js` (modified 2026-08-29
07:18) is newer than the last commit touching `web/` source (29ef391, committed 07:06).
No rebuild was needed.

**Actual runtime is `next start`, not the standalone `server.js`** — see "Bug found" below
for why. This matches what the old Docker image did anyway (`web/Dockerfile` `CMD
["npm","start"]` → `next start`), so it's not a behavior change from Docker.

Exact command (env merged from `.env` + overrides, run from `web/`):

```
node "<repo>\web\node_modules\next\dist\bin\next" start -p 8888 -H 127.0.0.1
```

Env: everything in `.env` (`ADMIN_PASSWORD`, `SESSION_SECRET`, `CLOUDFLARE_API_TOKEN`,
`ZONE_ID`) plus `PORT=8888 HOSTNAME=127.0.0.1 TUNNEL_ROOT=<repo> TUNNEL_DATA_DIR=<repo>`.
`DESKTOP_MODE` explicitly **not** set (public host must keep the login gate — see
`web/middleware.ts:15`).

pid/log: `runtime/web/.pid`, `runtime/web/.log` — same layout convention as
`scripts/runtime.js`'s `nativeStart()` uses for tunnels (`runtime/<name>/.pid` + `.log`).

**No file was added to the repo.** The launch command above was run through a scratch
one-shot launcher script (outside the repo, per instruction) that reads `.env` and spawns
`next start`. Lead can turn this into `scripts/web-serve.js` later; the exact command is
recorded above so that script can just wrap it.

### Why `next start`, not `node .next/standalone/server.js`

Tried the standalone server first — it works, but its redirects hardcode
`http://localhost:8888/...` regardless of the real Host header (see "Bug found" below,
same underlying cause). `next start` doesn't fix that either, but matches exactly what
the old Docker deployment ran, so behavior is at least consistent with pre-migration.

### Persistence — how this survives the pane closing

**Do not just `spawn(..., {detached:true}); proc.unref()` from inside a takkub pane and
call it done — that will NOT survive `takkub done`.** See item 4 below for the evidence.
This was launched instead via a one-shot Windows Scheduled Task, which puts it under the
Task Scheduler service instead of under this pane's process tree:

```
schtasks /create /tn "tunnel-web-native" /tr "\"<node.exe>\" \"<launcher.js>\"" /sc once /st 00:00 /sd 01/01/2020 /f
schtasks /run /tn "tunnel-web-native"
schtasks /delete /tn "tunnel-web-native" /f     # definition removed; process keeps running
```

Verified: after the launcher process itself exited (it's one-shot: spawn detached child,
write pid file, exit) and after the scheduled-task definition was deleted, the server
(pid recorded in `runtime/web/.pid`) was still running and still serving. Its `ParentProcessId`
resolved to a PID that no longer exists — i.e. it's an orphan under Task Scheduler's own
tree, not under this pane's.

## Verification

| Check | Result |
|---|---|
| `http://127.0.0.1:8888/` (local) | 307 → `/login` |
| `https://tunnels.sabuytube.xyz/` (public, through cloudflared) | 307 |
| `https://tunnels.sabuytube.xyz/login` (public) | 200 |
| `POST /api/auth/login` with real `ADMIN_PASSWORD` (public) | 200 `{"ok":true}` |
| `GET /` with the resulting session cookie (public) | 200 (dashboard, not redirected) |

Full login flow verified end-to-end via curl (password never printed to output). **Did
not** do a real-browser screenshot — my role is not allowed to install/run a browser
driver (Playwright/Puppeteer/etc.); that's QA's job per project rules. If a visual
screenshot is still wanted, route to QA — the app is confirmed reachable and functional
at `https://tunnels.sabuytube.xyz`.

## Bug found (not fixed — flagged for a dev pane)

Unauthenticated `GET /` 307-redirects to an **absolute** URL that hardcodes
`http://localhost:8888/login` instead of the real public host, because:

- `web/middleware.ts` builds the redirect via `req.nextUrl.clone()` (always absolute).
- Next 14.2.5's `next-server.js` (`initUrl` construction) builds that base URL from the
  server's own bound `hostname:port` whenever `next start` is given an explicit
  `-H`/`-p`, ignoring the incoming `Host` header entirely — regardless of the client Host.
- The documented escape hatch, `experimental.trustHostHeader` in `next.config.js`, is
  **not a recognized key in Next 14.2.5** — setting it produces "Invalid next.config.js
  options detected" and has no effect (tested; reverted the change).

**This is not a regression from the native migration** — the old Docker image ran the
exact same `next start` against the exact same `next.config.js`, so the same bug almost
certainly existed there too (docker-compose mapped `8888:3000`, so it would have
redirected to `localhost:3000` instead). Impact is limited: `/login` and the whole
authenticated flow work fine when hit directly (verified above) — only the automatic
`/` → `/login` redirect for a first-time unauthenticated visitor points at a dead link.
Recommend `web/middleware.ts` build the redirect from the request's actual
`Host`/`X-Forwarded-Host` header instead of `req.nextUrl.clone()`.

## cloudflared — untouched, not restarted/stopped

Confirmed 10 processes running (9 tunnels; `oooo` has 2, as expected):

| Tunnel | PID | Config |
|---|---|---|
| admin-wash-locker-dev | 42848 | tunnels/admin-wash-locker-dev/config.yml |
| api-wash-locker-dev | 56528 | tunnels/api-wash-locker-dev/config.yml |
| demo-game | 42336 | tunnels/demo-game/config.yml |
| liff-wash-locker-dev | 51312 | tunnels/liff-wash-locker-dev/config.yml |
| oooo | 19544 | tunnels/oooo/config.yml |
| oooo (2nd, cockpit's own) | 30948 | `C:\Users\monch\.agent-takkub\runtime\tunnel\config.yml` (same tunnel ID `41836b4c-...`) |
| st | 35488 | tunnels/st/config.yml |
| super | 15112 | tunnels/super/config.yml |
| tunnels | 28752 | tunnels/tunnels/config.yml |
| whisper | 3260 | tunnels/whisper/config.yml |

None of these were started, stopped, or restarted this session.

## Item 4 — why the 8 native tunnels died when the previous pane closed

**Detached/unref pattern used (`scripts/runtime.js` `nativeStart()`):**
- `detached: true` — yes
- `windowsHide` — **not set** (absent from the spawn options)
- `proc.unref()` — yes

**Do takkub panes kill the process tree on `takkub done`? Yes — confirmed.**

Evidence: a prior confirmed root-cause finding in a different project's devops
role-memory (`C:\Users\monch\.agent-takkub\v2\state\registry\role-memory\unirecon\devops.md`,
2026-08-18 recovery #10):

> launching `Docker Desktop.exe` directly from the pane's bash (even via
> `Start-Process`/backgrounded) makes it a descendant of this pane's process tree; when
> the pane later calls `takkub done` and closes, cockpit's "kill subprocess(es) about to
> be killed" cleanup kills the whole tree including `Docker Desktop.exe`.

That confirms cockpit's pane-close cleanup walks and kills the pane's **entire descendant
process tree** on `takkub done`. Node's `detached:true` + `unref()` on Windows only
detaches from the parent's stdio and console signal group (Ctrl-C handling) — it does
**not** remove the child from the OS-level parent/child ancestry that a tree-based kill
walks. So a tunnel (or this web server) started directly from inside a pane is still
reachable by that cleanup and dies with the pane, `windowsHide` or not — `windowsHide`
only suppresses the console window, it's unrelated to this.

This is exactly consistent with "8 native tunnels died when the previous pane closed" —
whichever pane started them, it later called `takkub done`, and cleanup took them down
with it. (They're all running again now, listed above — presumably restarted since.)

**Fix used here:** launch via a one-shot Windows Scheduled Task (see "Persistence"
above) instead of a direct pane spawn. That puts the process under the Task Scheduler
service's tree, not the pane's, so it's outside what cockpit's cleanup walks. Verified
empirically (process survived both its own launcher exiting and the task definition
being deleted).

**Recommendation for Lead:** the same risk applies to any of the 9 native cloudflared
tunnels if they're ever (re)started from inside a takkub pane rather than by the desktop
app's own launch-at-login/autostart flow — they'll die the next time that pane calls
`takkub done`. Either (a) route pane-initiated long-running process starts through a
scheduled-task/service wrapper like the one used here, or (b) fix cockpit's cleanup to
not tree-kill intentionally-detached descendants — (b) is the more correct general fix
but is outside this project (cockpit-level change).
