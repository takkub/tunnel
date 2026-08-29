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

`web/lib/paths.ts` reads `TUNNEL_ROOT`/`TUNNEL_DATA_DIR` with a dev fallback
of `path.resolve(process.cwd(), '..')`, so the browser dev flow (`npm run
web:dev` from the repo root) is unaffected.

With `DESKTOP_MODE=1` and no `ADMIN_PASSWORD` set, the web login is skipped
(see `web/middleware.ts`) — the OS login already gates the machine. Setting
`ADMIN_PASSWORD` still enforces the password gate even inside the app.

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
