# Docker → Native cloudflared migration — 2026-08-29

Migrated all running cloudflared tunnels from Docker mode to native mode, one at a time, per
Lead's approval. No code changes were made — only `runtime.config.json` (mode switch) and each
tunnel's `config.yml` (ingress host rewrite, see "Bug found" below).

## Result

- Runtime mode: `docker` → **`native`** (`runtime.config.json`)
- 9 tunnels migrated, all connected natively, all HTTP status unchanged before/after
- 0 `cloudflared-tunnel-*` Docker containers running (2 pre-existing *exited* ones —
  `tak888`, `line-free` — were already stopped before this migration and were left untouched,
  out of scope)
- `tunnel-tunnel-web-1` (web dashboard container) untouched, as instructed
- Autostart flag set to `true` on all 9 migrated tunnels so the desktop app restarts them on
  launch

## Bug found (not code — a required data fix, handled within migration scope)

`scripts/runtime.js`'s `nativeStart()` execs `cloudflared` directly against each tunnel's existing
`config.yml` — it does **not** rewrite the ingress `service:` target. Every one of these 9 tunnels
was originally created in Docker mode, so their ingress pointed at `http://host.docker.internal:<port>`.

`host.docker.internal` is **not** a loopback alias here — it's a static entry in
`C:\Windows\System32\drivers\etc\hosts` pinned to `192.168.1.173`, a stale LAN IP (the machine's
current IP is `192.168.1.113`). Confirmed unreachable (`ping` → "Destination host unreachable").
Starting a tunnel natively without fixing this would connect fine to Cloudflare's edge but 502 on
every request, because cloudflared can't reach the origin.

**Fix applied:** edited each tunnel's `tunnels/<name>/config.yml`, changing the ingress `service:`
line from `http://host.docker.internal:<port>` to `http://localhost:<port>` before starting it
natively. This matches exactly what `scripts/create-tunnel.js` / `scripts/setup-tunnel.js` already
write for a tunnel created directly in native mode (see their `mode === 'docker' ? host.docker.internal : localhost`
branch) — so this brings existing tunnels in line with what the app itself would have generated,
not a workaround.

This is worth fixing in code (`nativeStart` could rewrite/validate the ingress host the same way,
or warn) so a future docker→native switch doesn't require this manual step — flagging for Lead to
decide whether to route that to a dev pane. No such change was made here per the "no code changes
expected" instruction.

## Detachment check (decides whether the desktop app must stay open)

Confirmed **native cloudflared processes are fully detached** — spawned via
`spawn(bin, [...], { detached: true, stdio: [...] }); proc.unref()`, pid recorded to
`runtime/<name>/.pid`. Verified empirically: after starting `demo-game` from one shell/tool
call, a completely separate process (PowerShell, spawned later) could see the pid still alive
and unconnected to the original spawning shell.

**Implication:** tunnels keep running after the desktop app (or this migration session) closes,
for as long as the OS session stays up. They will **not** survive a reboot on their own — that
requires the app's launch-at-login + autostart wiring (added recently, see git log
`ded5435`/`b5d10ec`) to actually run and call `autostart.js` again on next launch. Autostart is
now flagged `true` on all 9 migrated tunnels so that wiring will pick them up.

## Per-tunnel before/after

Order followed: 7 non-cockpit tunnels first, cockpit (`oooo`) last (Lead notified beforehand).

| Tunnel | Hostname | Backend | Before | After | Notes |
|---|---|---|---|---|---|
| demo-game | demo-game.sabuytube.xyz | :6720 | 200 | 200 | first migration; also used to verify detachment |
| super | super.sabuytube.xyz | :6720 | 307 | 307 | transient 502 seen on curl fired ~1s after tunnel registered; retry matched baseline |
| whisper | whisper.sabuytube.xyz | :5501 | 502 | 502 | backend already down pre-migration; tunnel itself connected fine natively |
| st | st.sabuytube.xyz | :3100 | 502 | 502 | backend already down pre-migration |
| liff-wash-locker-dev | liff-wash-locker-dev.sabuytube.xyz | :14602 | 502 | 502 | backend already down pre-migration |
| api-wash-locker-dev | api-wash-locker-dev.sabuytube.xyz | :14601 | 502 | 502 | backend already down pre-migration |
| admin-wash-locker-dev | admin-wash-locker-dev.sabuytube.xyz | :14611 / :14603 | 502 | 502 | two ingress rules (one path-scoped to `/downloads/.*`), both rewritten |
| tunnels | tunnels.sabuytube.xyz | :8888 | 502 | 502 | fronts the web dashboard; `tunnel-tunnel-web-1` container was already exited before this migration, untouched |
| oooo (cockpit) | oooo.sabuytube.xyz | :9999 | n/a | 404 | see below |

No auth-gate was enabled on any of these 9 tunnels, so no login-page/cookie verification was
needed for this migration.

### Note on `oooo` (cockpit tunnel)

`oooo` was **not** one of the 8 running Docker containers found in the initial inventory —
`docker ps -a` shows no `oooo` container ever existed. It also wasn't running natively before
this task touched it (`tunnel-ctrl.js stop oooo` reported "already stopped"). So this session's
own connectivity to the user is not going through `oooo.sabuytube.xyz` — migrating it caused no
observed disruption. It is now running natively and registers 4 edge connections successfully;
both the tunnel and a direct `curl -H "Host: oooo.sabuytube.xyz" localhost:9999` return `404`,
consistently — that's the backend app's own behavior for `/`, not a tunnel problem.

## Rollback procedure (not needed — no tunnel failed)

For any tunnel, rollback is: `node scripts/tunnel-ctrl.js stop <name>` (kills the native process),
revert the `config.yml` service line back to `http://host.docker.internal:<port>`, then
`node scripts/runtime.js` mode back to `docker` (or per-tunnel via `dockerStart` if only one
tunnel needs to roll back while others stay native — `getEffectiveMode()` is global, so a mixed
fleet needs `docker-compose.yml`'s existing `dockerStart(name)` called directly rather than through
`tunnel-ctrl.js`, which follows the global mode).

## Final state

```
$ docker ps --format '{{.Names}}' | grep cloudflared-tunnel
(none)

$ node scripts/tunnel-status.js   # (see above) — all 9 previously-running tunnels: running=true, autostart=true
```
