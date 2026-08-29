# QA Gate Report: 'Launch at Login' & 'Autostart Tunnels' Verification

**Date:** 2026-08-29  
**Target:** Commits `45b064d`, `29ef391`, `ded5435`, `b5d10ec` on `main`  
**Environment:** Windows 11 x64, Node.js v24.13.0, Electron v31.7.7, Next.js v14.2.5  
**Status:** **PASS** (5/5 Test Suites Passed)

---

## Summary Matrix

| # | Item / Test Requirement | Result | Evidence / Notes |
|---|---|---|---|
| 1 | **takkub qa-gate (full)** | **PASS** | 82/82 tests passed (0 fail, 0 skipped, duration 5.6s). Next.js typecheck clean (0 errors). |
| 2 | **Web UI Autostart & Desktop Settings** | **PASS** | TunnelCard `⚡ Autostart` toggle persists on/off to `tunnels/<name>/tunnel.json` and `GET/PUT /api/tunnels/[name]/autostart`. Settings → Desktop section visible with 2 toggles (`launchAtLogin`, `autostartTunnelsOnLaunch`) persisting to `settings.json` when `DESKTOP_MODE=1`; Desktop section cleanly hidden when `DESKTOP_MODE` is unset. Screenshots captured. |
| 3 | **`scripts/autostart.js --json` CLI** | **PASS** | Flagged (`autostart: true`) & stopped tunnel started; already-running tunnel skipped; unflagged (`autostart: false`) tunnel ignored. Test tunnel stopped cleanly. |
| 4 | **Electron Desktop App Lifecycle & Settings** | **PASS** | Packaged `Tunnel Manager.exe` built via `npm run desktop:dist`. (a) Normal launch shows window, runs autostart, displays tray; (b) `--hidden` suppresses window; (c) `launchAtLogin` toggle registers/unregisters Windows Run registry item (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`) with `--hidden` within ~3s; (d) Tray 'Autostart Tunnels Now' (`POST /api/tunnels/autostart`) starts unstarted flagged tunnels; (e) Clean quit with zero orphan processes. |
| 5 | **Production Regression (Docker / Web)** | **PASS** | Read-only check of all 17 production tunnels returned clean JSON status. No production containers, tunnels, or data directories were modified or stopped. |

---

## Detailed Findings & Evidence

### 1. Test Suite & Typecheck (`takkub qa-gate`)
- **Command:** `takkub qa-gate`
- **Output:**
  - `verify: PASS` (82 passed / 0 failed / 0 skipped / duration 5.6s)
  - `npm --prefix web run typecheck`: 0 errors
- **Coverage:** Unit tests for `scripts/autostart.js`, `scripts/tunnel-meta.js`, `scripts/settings-store.js`, `scripts/runtime.js`, `web/lib/tunnelMeta.ts`, `web/lib/settings.ts`, API routes.
- **Log:** `runtime/exports/qa-gate-20260829-071640/verify.log`

---

### 2. Web UI (`DESKTOP_MODE=1` vs Unset, Native Runtime)

Tested using isolated temporary `TUNNEL_DATA_DIR` with mock tunnel `qa-autostart-web`:

1. **Autostart Toggle on TunnelCard:**
   - Default state: `GET /api/tunnels/qa-autostart-web/autostart` -> `{ "autostart": false }`.
   - Click/PUT `autostart: true` -> returns `{ "autostart": true }`, writes `tunnel.json: { "autostart": true }`.
   - Card button renders amber `⚡` indicator.
   - Click/PUT `autostart: false` -> returns `{ "autostart": false }`, updates `tunnel.json: { "autostart": false }`.

2. **Settings Page Desktop Section (`DESKTOP_MODE=1`):**
   - Renders "Desktop" section with two switches:
     1. "เปิดแอปอัตโนมัติเมื่อเข้าเครื่อง" (`launchAtLogin`)
     2. "เริ่ม tunnels ที่ตั้ง autostart ไว้เมื่อเปิดแอป" (`autostartTunnelsOnLaunch`)
   - Toggling switches issues `PUT /api/settings` and updates `<TUNNEL_DATA_DIR>/settings.json`.

3. **Settings Page without Desktop Mode (`DESKTOP_MODE` unset):**
   - Desktop section is completely hidden from the UI.

- **Captured Screenshots:**
  - `screenshots/web-dashboard-autostart-disabled.png`
  - `screenshots/web-dashboard-autostart-enabled.png`
  - `screenshots/web-settings-desktop-mode.png`
  - `screenshots/web-settings-non-desktop-mode.png`

---

### 3. Autostart CLI (`scripts/autostart.js --json`)

Tested with two isolated test tunnels (`qa-autostart-flagged` with `autostart: true` and `qa-autostart-unflagged` with `autostart: false`):

- **Phase 1 (Stopped state):**
  - Run: `node scripts/autostart.js --json`
  - Output:
    ```json
    {
      "mode": "native",
      "started": [
        "qa-autostart-flagged"
      ],
      "skipped": [],
      "failed": []
    }
    ```
  - Flagged tunnel started (PID file created and process active); unflagged tunnel remained stopped.

- **Phase 2 (Already running):**
  - Run: `node scripts/autostart.js --json`
  - Output:
    ```json
    {
      "mode": "native",
      "started": [],
      "skipped": [
        "qa-autostart-flagged"
      ],
      "failed": []
    }
    ```
  - Running tunnel safely skipped without error.

- **Phase 3 (Cleanup):**
  - `nativeStop('qa-autostart-flagged')` terminated only the test process.

---

### 4. Electron Desktop App End-to-End

Built package `desktop/dist-artifacts/win-unpacked/Tunnel Manager.exe` with bundled Next.js standalone and staged automation scripts.

- **(a) Normal Launch:**
  - Executed: `Tunnel Manager.exe --user-data-dir=<temp_dir>`
  - Window spawned and displayed `Tunnel Manager`.
  - Next.js server spawned on port 8888.
  - Autostart background run initiated; test tunnel PID `2976` spawned immediately.

- **(b) Hidden Launch (`--hidden`):**
  - Executed: `Tunnel Manager.exe --hidden --user-data-dir=<temp_dir>`
  - Window created with `show: false`; no visible main window appeared on desktop.
  - Server and tray fully initialized.

- **(c) Windows Login Item Registry Integration:**
  - Initial registry: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` -> `""` (empty).
  - Toggled `desktop.launchAtLogin: true` via `/api/settings`.
  - Within ~2s, `watchDesktopSettings` polled `settings.json` and invoked `applyLoginItemSettings`.
  - Windows Registry verified:
    ```
    HKCU\Software\Microsoft\Windows\CurrentVersion\Run\electron.app.Tunnel Manager
    Value: C:\Users\monch\WebstormProjects\tunnel\desktop\dist-artifacts\win-unpacked\Tunnel Manager.exe --hidden
    ```
  - Toggled `desktop.launchAtLogin: false` via `/api/settings`.
  - Within ~2s, registry key was automatically removed.
  - Final state verified clean / OFF.

- **(d) Tray 'Autostart Tunnels Now':**
  - Triggered `POST /api/tunnels/autostart`.
  - Returned: `{ "started": ["qa-electron-tunnel"], "skipped": [], "failed": [] }`.

- **(e) Clean Quit & Process Lifecycle:**
  - Application shutdown terminated child server processes.
  - Process table checked: 0 orphan `Tunnel Manager.exe` or `cloudflared.exe` processes.

---

### 5. Production Regression Verification

- Read-only execution of `scripts/tunnel-status.js` against `./tunnels/` verified:
  - All 17 active tunnels (`admin-wash-locker-dev`, `demo-game`, `liff-wash-locker-dev`, `promptpay`, `super`, `whisper`, etc.) listed accurately with status, hostname, port, `authGate`, and default `autostart: false`.
  - All production Docker containers and cloudflared tunnels remain intact and untouched.

---

## Conclusion

All QA gate checks for the **'launch at login'** and **'autostart tunnels'** features have passed successfully with full evidence and zero regressions.
