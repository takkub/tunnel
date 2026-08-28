# QA Gate Report: Electron Desktop App End-to-End Verification

**Date:** 2026-08-28  
**Target:** Electron Desktop App on `main` (`be656c2`)  
**Environment:** Windows 11 x64, Node.js v24.13.0, Electron v31.7.7  
**Status:** **PASS** (8/8 Items Passed)

---

## Summary Matrix

| # | Item / Test Requirement | Result | Evidence / Notes |
|---|---|---|---|
| 1 | **Test Suite & Typecheck** (`takkub qa-gate full`) | **PASS** | 74/74 tests passed, 0 failures, 0 skipped. Next.js typecheck passed with 0 errors. |
| 2 | **Desktop App Build & Packaging** (`npm run dist`) | **PASS** | `dist-artifacts/win-unpacked/Tunnel Manager.exe` built cleanly with Next.js standalone and staged resources. |
| 3 | **Fresh Data Dir Onboarding Wizard** (`/setup`) | **PASS** | Initialized fresh `%APPDATA%\tunnel-desktop`. 3-step setup completed: real download of `cloudflared.exe` (54.8 MB), argotunnel login URL opened, optional token step, redirected to dashboard. |
| 4 | **Settings Page Verification** (`/settings`) | **PASS** | Effective runtime mode `native` / `auto` verified. Data dir shown as `C:\Users\monch\AppData\Roaming\tunnel-desktop`. Binary path and version `2026.8.2` verified. |
| 5 | **Native Tunnel Lifecycle** (`promptpay`) | **PASS** | Native mode spawned detached `cloudflared.exe` (PID tracked in `.pid`). Status `Running`. HTTPS endpoint `https://promptpay.sabuytube.xyz` reachable (HTTP 200). Stop cleanly terminated process with zero orphan `cloudflared.exe`. |
| 6 | **Native Password Gate** (`scripts/auth-gate-proxy.js`) | **PASS** | Auth gate enabled -> ingress rewritten to `:8890`. HTTPS URL loaded custom login page -> wrong password returned "Incorrect password." -> correct password granted access to backend service. Reload preserved session cookie. Disable restored `:6201` and proxy process exited when idle. |
| 7 | **Tray Quit & Clean Shutdown** | **PASS** | Quitting the app triggers `stopServer()` and terminates the spawned Next.js server child process, releasing port 8888. |
| 8 | **UI Review & Docker Mode Regression** | **PASS** | Dashboard, Setup wizard, Settings, and Auth Gate modal screenshots captured under `runtime/exports`. Docker tunnel start/stop regression verified. Promptpay config restored. |

---

## Detailed Step-by-Step Findings

### 1. Test Suite & Typecheck
- **Command:** `takkub qa-gate`
- **Output:**
  - `verify: PASS` (74 passed / 0 failed / 0 skipped, duration 5.5s)
  - `npm --prefix web run typecheck`: 0 errors.
- **Log:** `runtime/exports/qa-gate-20260828-222042/verify.log`

### 2. Desktop App Packaging
- **Command:** `npm --prefix desktop run dist`
- Next.js standalone server built and staged into `desktop/resources/web-standalone`.
- Packaged executable created: `desktop/dist-artifacts/win-unpacked/Tunnel Manager.exe` (180.8 MB).

### 3. Fresh Data Dir & Onboarding Wizard
- Tested with clean `%APPDATA%\tunnel-desktop`.
- Navigated to `http://127.0.0.1:8888/` -> automatically routed to `/setup`.
- **Step 1 (Install Cloudflared):** Clicked install -> downloaded official Cloudflare Windows x64 binary to `%APPDATA%\tunnel-desktop\bin\cloudflared.exe` (54,893,480 bytes).
- **Step 2 (Login Step):** Clicked login -> launched `cloudflared tunnel login` in background, opened Cloudflare Argo Tunnel login tab (`https://dash.cloudflare.com/argotunnel?...`). Restored `cert.pem` -> polling detected completion and advanced to Step 3.
- **Step 3 (Optional Token Step):** Rendered token/zone ID inputs and "ข้าม ไปที่ dashboard" option. Navigated to `/`.
- **Screenshots:**
  - `runtime/exports/setup-step-1.png`
  - `runtime/exports/setup-step-2.png`
  - `runtime/exports/setup-step-3.png`
  - `runtime/exports/dashboard-fresh.png`

### 4. Settings Page Verification
- Navigated to `http://127.0.0.1:8888/settings`.
- Displayed:
  - Runtime Mode: `Auto`, `Docker`, `Native` with radio options.
  - Data Directory: `C:\Users\monch\AppData\Roaming\tunnel-desktop` (Desktop App Mode).
  - cloudflared: `ติดตั้งแล้ว (cloudflared version 2026.8.2 (built 2026-08-14T04:22 UTC))` at `C:\Users\monch\AppData\Roaming\tunnel-desktop\bin\cloudflared.exe`.
- Switched mode to `Native` and saved -> `/api/settings` confirmed `mode: "native"`, `effectiveMode: "native"`.
- **Screenshots:**
  - `runtime/exports/settings-page-auto.png`
  - `runtime/exports/settings-page-native.png`

### 5. Native Tunnel Lifecycle
- Copied `promptpay` tunnel to `%APPDATA%\tunnel-desktop\tunnels\promptpay`.
- Started mock origin service on `127.0.0.1:6201`.
- Clicked "เริ่ม" on dashboard -> Status became `Running`, PID logged to `runtime/promptpay/.pid`.
- Verified HTTPS hostname `https://promptpay.sabuytube.xyz` via network request:
  - Returned `STATUS: 200`, `BODY: Hello from PromptPay local service 6201!`.
- Clicked "หยุด" on dashboard -> Status became `Stopped`.
- Verified process table: `cloudflared.exe` process for promptpay cleanly exited, no orphan processes.
- **Screenshots:**
  - `runtime/exports/dashboard-tunnel-stopped.png`
  - `runtime/exports/dashboard-tunnel-running.png`

### 6. Native Password Gate Verification
- Clicked "Password protection" modal on promptpay card.
- Toggled switch on, set password `secret12345`, saved.
- Ingress rewritten to `:8890` and `scripts/auth-gate-proxy.js` spawned natively on port 8890.
- Dashboard updated card to `:8890 🔒 Password Running`.
- **Custom Login Page:** Visited `https://promptpay.sabuytube.xyz` -> redirected to `https://promptpay.sabuytube.xyz/__gate/login?next=%2F`.
- **Wrong Password:** Entered `wrongpass` -> received inline error `Incorrect password.`.
- **Correct Password:** Entered `secret12345` -> authenticated, redirected to origin service (`Hello from PromptPay local service 6201!`).
- **Session Persistence:** Page reload maintained authentication without re-prompting for password.
- **Disable Gate:** Toggled switch off, confirmed in modal -> original service `:6201` restored, native `auth-gate-proxy.js` process automatically exited when 0 gates remained.
- **Screenshots:**
  - `runtime/exports/modal-auth-gate-disabled.png`
  - `runtime/exports/dashboard-auth-gate-enabled.png`
  - `runtime/exports/gate-login-page.png`
  - `runtime/exports/gate-wrong-password.png`
  - `runtime/exports/gate-authenticated.png`

### 7. Clean Shutdown
- Quitting the application calls `stopServer()` which issues `taskkill /pid <serverPid> /T /F`.
- Confirmed port 8888 was released and child Next.js process terminated.

### 8. UI Review & Docker Mode Regressions
- **UI Quality:** Dark theme is consistent, badge states (`Running` in emerald, `Stopped` in zinc, `🔒 Password` badge) are clear. Thai localization is natural and formatted well.
- **Docker Mode Regression:** Switched runtime mode to `auto` / `docker` -> verified `dockerStart('promptpay')` and `dockerStop('promptpay')` work with Docker containers as expected.
- Repo state clean; `tunnels/promptpay` intact without uncommitted changes.
