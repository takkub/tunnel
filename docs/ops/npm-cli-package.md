# npm CLI package — `tunnel-takkub`

The `tunnel` command is the same `scripts/*.js` automation this repo already uses,
packaged as a global npm install. It bundles a pre-built Next.js `standalone`
copy of `web/` so an end user never needs `web/node_modules` or a local
`next build`.

## Layout published to npm

Controlled by `package.json`'s `files` field:

| Path | Purpose |
|---|---|
| `bin/tunnel.js` | CLI entry point (`bin.tunnel`) |
| `scripts/*.js` | Tunnel/runtime automation (no `__tests__/`) |
| `web/.next/standalone/` | Pre-built Next server (self-contained `node_modules`) |
| `web/.next/static/` | Next's client assets, staged next to the standalone server on first run |
| `web/public/` | Static public assets, if any |
| `.env.example`, `LICENSE`, `README.md` | Reference/docs |

`desktop/`, `nginx/`, tests, and other docs are **not** published.

## Runtime env contract

`bin/tunnel.js` sets, if not already set by the caller:

- `TUNNEL_ROOT` → the installed package directory (`path.join(__dirname, '..')`)
- `TUNNEL_DATA_DIR` → `~/.tunnel` (override to point at any writable directory)

Every `scripts/*.js` module already reads these two vars (see `scripts/runtime.js`)
so no other wiring was needed — the CLI is a thin dispatcher: most subcommands
just `spawnSync` the matching existing script with `stdio: 'inherit'`.

## Building before publish

`prepack` runs `npm --prefix web install && npm --prefix web run build`
(`next.config.js` already sets `output: 'standalone'`), so `npm pack` /
`npm publish` always ships a fresh standalone build — never a stale one.

## Publishing (for the maintainer to run — not automated here)

```bash
npm login                      # once, if not already logged in
npm publish --access public    # from the repo root; prepack builds web/ automatically
```

To test a release candidate without touching the real registry:

```bash
npm pack                                    # writes tunnel-takkub-<version>.tgz, runs prepack
npm install -g --prefix /tmp/some-prefix ./tunnel-takkub-<version>.tgz
TUNNEL_DATA_DIR=/tmp/some-data /tmp/some-prefix/bin/tunnel web --port 8897 --no-open
```

## Verified end-to-end (this change)

`npm pack` → `npm install -g --prefix <temp dir with a space in its path>` →
`tunnel web --port 8897 --no-open` (own `TUNNEL_DATA_DIR`) → `curl localhost:8897`
returned the login page (307 → `/login`, static CSS/JS served) → `tunnel web stop`
→ confirmed the port closed → `npm uninstall -g`. Also exercised `tunnel list --json`,
`tunnel web status`, `tunnel create`/`start`/`autostart --json` argument dispatch
(no real Cloudflare token/tunnel involved). The real tunnel/web process already
running on :8888 in this environment was left untouched throughout.

This also confirms `web-serve.js`'s standalone server starts correctly when
`TUNNEL_ROOT` resolves to a global `node_modules` install path containing a space —
no path-quoting fix was needed; `spawnDetached()`'s existing quoting in
`scripts/runtime.js` already handles it.

## `tunnel autostart install` / `uninstall`

Registers the CLI to run at login so the web dashboard and any tunnel flagged
`autostart: true` (`scripts/tunnel-meta.js`) come back up automatically:

- **Windows**: `schtasks /create ... /sc onlogon` running `tunnel autostart`
  then `tunnel web --no-open` via a hidden PowerShell window.
- **macOS**: a `LaunchAgent` plist at `~/Library/LaunchAgents/com.takkub.tunnel.autostart.plist`
  with `RunAtLoad`.
- **Linux**: not automated — the CLI prints the equivalent `systemd --user` /
  `cron @reboot` command to add manually.

This is separate from `tunnel autostart` (no args), which is just
`scripts/autostart.js` — it starts already-created tunnels flagged
`autostart: true`, it does not touch OS login items.
