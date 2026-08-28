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
