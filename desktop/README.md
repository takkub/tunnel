# Tunnel Manager (desktop)

Electron wrapper around `web/` — a tray-resident app that runs the Next.js
admin UI against a local port instead of a browser tab.

## Scripts

- `npm run dev` — compile + launch Electron against `next dev` (HMR) in `../web`
- `npm run build` — builds `web/` (standalone output) and stages `resources/`
- `npm run dist` — `build` + `electron-builder` (produces installers in `dist-artifacts/`)

`dist` is self-contained: it installs and builds `../web` itself, so CI only
needs `npm install --prefix desktop` before `npm --prefix desktop run dist`.

## Env contract (passed to the spawned Next.js server)

| Var | Packaged | Dev |
|---|---|---|
| `TUNNEL_ROOT` | `process.resourcesPath/app` (contains `scripts/`) | repo root |
| `TUNNEL_DATA_DIR` | `app.getPath('userData')` | repo root |
| `SESSION_SECRET` | auto-generated once, persisted at `TUNNEL_DATA_DIR/.session-secret` | same |
| `DESKTOP_MODE` | `1` | `1` |
| `PORT` | see "Fixed port" below | same |
| `ADMIN_PASSWORD`, `CLOUDFLARE_API_TOKEN`, `ZONE_ID`, ... | read from `TUNNEL_DATA_DIR/.env` if present | same |

### Fixed port

By default the spawned server binds to the first free port from
`[8888, 8889, 8890, 8891, 8892]` (`get-port`). Set **`TUNNEL_WEB_PORT`** (env,
read by the Electron main process itself — not `.env`) or **`desktop.webPort`**
in `<TUNNEL_DATA_DIR>/settings.json` (env wins if both are set) to pin it to a
specific port instead — needed when a Cloudflare tunnel's ingress rule points
at a fixed `localhost:<port>`, since landing on a different port after a
restart 502s the tunnel. If the configured port is still occupied by the
previous process's listener, `src/server.ts` retries 5 times, 2s apart,
logging each attempt, before falling back to `get-port`. See
`src/port-resolver.js` (plain, electron-free — `npm test` in `desktop/`) for
the resolution logic.

`web/lib/paths.ts` reads `TUNNEL_ROOT`/`TUNNEL_DATA_DIR` with a dev fallback
of `path.resolve(process.cwd(), '..')`, so the browser dev flow (`npm run
web:dev` from the repo root) is unaffected.

The Electron main process never reads `TUNNEL_DATA_DIR/.env` into its own
`process.env` — `src/dotenv-env.js`'s `buildSpawnEnv()` parses it with
`dotenv.parse()` (not `dotenv.config()`, so no side effect on the main
process) and threads the result explicitly into every child it spawns: the
Next server (`src/server.ts`), and the tray/autostart scripts
(`src/autostart.ts`, `src/tunnels.ts`). A key already present on the real
`process.env` always wins over the same key in `.env`, matching
`scripts/web-serve.js`'s native-mode convention.

With `DESKTOP_MODE=1` and no `ADMIN_PASSWORD` set, the web login is skipped
for loopback requests only (see `web/middleware.ts` +
`web/lib/redirect-origin.js`'s `isLoopbackHost`) — the OS login already gates
the machine for someone sitting at it. A request whose Host (or
`X-Forwarded-Host`) is not `localhost`/`127.0.0.1`/`::1` — i.e. anything
arriving over a public cloudflared tunnel — gets a `403` instead of a free
pass, even with no `ADMIN_PASSWORD` configured; set `ADMIN_PASSWORD` before
exposing the app via a tunnel. Setting `ADMIN_PASSWORD` always enforces the
password gate regardless of how the request arrived.

## Launch at login / autostart tunnels

The web UI's Settings page writes `desktop.launchAtLogin` and
`desktop.autostartTunnelsOnLaunch` to `<TUNNEL_DATA_DIR>/settings.json` (via
`PUT /api/settings`) — there is no IPC channel for this. `src/settings.ts`
polls that file's mtime every ~2s and, on every boot and every change:

- applies `launchAtLogin` via `app.setLoginItemSettings({ openAtLogin,
  openAsHidden: true, args: ['--hidden'] })`
- reads the OS state back with `app.getLoginItemSettings()` and logs (no UI)
  if it didn't take — e.g. the user removed the login item by hand in the OS
  settings.

A login-item launch is detected via the `--hidden` arg (Windows/Linux) or
`app.getLoginItemSettings().wasOpenedAsHidden` (macOS); when detected, the
main window is created with `show: false` — only the tray appears. Clicking
the tray still shows the window.

If `desktop.autostartTunnelsOnLaunch !== false`, `scripts/autostart.js
--json` runs right after the window/tray are created (never blocking their
creation) the same way the tray's Start/Stop All Tunnels actions shell out to
`start-all.js`/`stop-all.js`. Results show as a Windows tray balloon or an OS
notification elsewhere. The tray menu also has an **Autostart Tunnels Now**
item to re-run it on demand.

**macOS caveat:** `openAsHidden` and `wasOpenedAsHidden` are deprecated as of
macOS 13 (Ventura) — Apple's replacement Login Items API doesn't expose a
"launched hidden" signal the same way, so on macOS 13+ a login-item launch
may briefly show the window before the app can react. `openAtLogin` itself
still works as a per-user login item on an unsigned build.

## Signing

Windows and macOS builds are unsigned for now. **TODO:** notarize the macOS
build and sign the Windows build before a public release — unsigned installers
will trigger SmartScreen / Gatekeeper warnings.

`electron-builder` is pinned to `24.6.3` (not `^24.13.x`): newer versions bundle
a `7zip-bin` whose 7-Zip tries to preserve symlinks when extracting the
`winCodeSign` toolset, which fails on Windows without admin rights or Developer
Mode (`Cannot create symbolic link : A required privilege is not held by the
client`). Unpin once upstream fixes electron-userland/electron-builder#8149,
or if building as admin / with Developer Mode on.
