# Setup Wizard QA Report

**Date:** 2026-08-29  
**Tester:** QA Teammate  
**Commits Tested:** `f4ed13b` (backend) + `efaeac1` (frontend) on `main` HEAD  
**Status:** **PASS**

---

## 1. Executive Summary

All QA verification criteria for the Setup Wizard and settings management have **PASSED**:
1. `GET /` cleanly redirects to `/setup` when onboarding is needed (`needsOnboarding: true`).
2. Cloudflare API Token verification against invalid/fake tokens returns immediate, clear error feedback without hanging.
3. Admin password validation enforces minimum 8 characters (returns 400 Bad Request on < 8 chars), properly generates/persists `ADMIN_PASSWORD` and `SESSION_SECRET` in `<TUNNEL_DATA_DIR>/.env`, and allows immediate login without requiring a server restart.
4. Wizard resumption works correctly upon page refresh, detecting completed steps and jumping to the next pending step or step 5 ("พร้อมใช้งาน").
5. `DESKTOP_MODE=1` instance correctly treats password as optional on loopback, while strictly rejecting external public tunnel traffic (`Host: x.example.com`) with `403 Forbidden` when no admin password is set.
6. `/settings` correctly displays domain `zoneName` and supports live password modification with immediate credential updates.
7. Targeted QA gate (`takkub qa-gate --targeted scripts/__tests__`) completed with **130/130 tests passing**.

---

## 2. Test Suite & Unit Verification

### 2.1 Targeted QA Gate
- **Command:** `takkub qa-gate --targeted scripts/__tests__`
- **Result:** **PASS**
- **Details:** 130 tests passed, 0 failed, 0 skipped, 0 cancelled (TypeScript typecheck clean).

---

## 3. Scenario Verification Results

### Check 1: Onboarding Redirect (`GET /` → `/setup`)
- **Setup:** Started Next.js test server (`port 8899`) with an isolated, empty temporary directory `TUNNEL_DATA_DIR`.
- **API Check:** `GET /api/setup-status` returned `{ needsOnboarding: true, steps: { ... } }`.
- **Browser Check:** Navigating to `http://127.0.0.1:8899/` redirected via `ClientLayout` to `http://127.0.0.1:8899/setup`.
- **Verdict:** **PASS**
- **Evidence:** `01-setup-redirect-step1.png`, `01-setup-step3-initial.png`

### Check 2: Invalid Cloudflare API Token Verification
- **API Check:** `POST /api/settings/cloudflare/verify` with `{ apiToken: "invalid_cloudflare_api_token_test_12345" }` returned:
  ```json
  { "valid": false, "error": "Invalid or inactive Cloudflare API token" }
  ```
  Response resolved in < 1s (no hanging/timeout).
- **UI Check:** In Step 3, entering invalid token and clicking "ตรวจสอบ" displayed the error text `Invalid or inactive Cloudflare API token` in red below the input.
- **Verdict:** **PASS**
- **Evidence:** `02-setup-token-verify-invalid.png`

### Check 3: Admin Password Validation & Live Authentication
- **Length Gate (< 8 chars):** `PUT /api/settings` with `{ admin: { password: "short" } }` returned HTTP `400 Bad Request` with `{ error: "admin.password must be a string of at least 8 characters" }`. UI form also triggered error toast `รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร`.
- **Mismatch Gate:** UI form validated password confirmation and displayed toast `รหัสผ่านไม่ตรงกัน`.
- **Success & Persistence:** Setting password (`>= 8` chars) returned HTTP `200 OK`. Verified that `<TUNNEL_DATA_DIR>/.env` was created and contains keys:
  - `ADMIN_PASSWORD`
  - `SESSION_SECRET`
  *(Keys verified; secret values kept confidential)*.
- **Immediate Login:** `POST /api/auth/login` with the newly configured password succeeded immediately (`HTTP 200 { ok: true }`) and returned `Set-Cookie: tunnel_session=...`.
- **Session Verification:** Accessing protected API route `/api/settings` and dashboard `/` with the returned session cookie succeeded immediately without requiring process restart.
- **Verdict:** **PASS**
- **Evidence:** `03-setup-step4-password.png`, `03b-setup-password-short-toast.png`, `03c-setup-password-mismatch-toast.png`, `04-setup-step5-ready.png`, `05a-login-page.png`, `05b-login-wrong-password.png`, `05c-dashboard-after-login.png`

### Check 4: Resume Capability on Reload
- **Action:** Refreshed `http://127.0.0.1:8899/setup` after completing cloudflared, Cloudflare domain, and admin password steps.
- **Result:** Wizard re-queried `/api/setup-status` and immediately rendered Step 5 ("พร้อมใช้งาน") with all 5 checklist items ticked green.
- **Verdict:** **PASS**
- **Evidence:** `06-setup-resumed-step5.png`

### Check 5: `DESKTOP_MODE=1` & Host Header Gate (Instance on Port 8898)
- **Setup:** Spanned 2nd Next.js server instance on `port 8898` with `DESKTOP_MODE=1` and a fresh empty `TUNNEL_DATA_DIR` (no `ADMIN_PASSWORD`).
- **Optional Password UI:** Step 4 showed button `ข้ามไปก่อน` (Skip for now) and subtitle indicating password is optional for local desktop usage.
- **Loopback Access (`Host: 127.0.0.1:8898`):** HTTP `200 OK` (loopback bypasses login).
- **Public Tunnel Access (`Host: x.example.com`):** HTTP `403 Forbidden` with response body:
  `Forbidden: set ADMIN_PASSWORD before exposing this app via a tunnel`.
- **Verdict:** **PASS**
- **Evidence:** `07-desktop-setup-initial.png`

### Check 6: Settings Page (`/settings`) - Zone Display & Password Update
- **Zone Display:** Settings page rendered `Cloudflare` section with masked API Token, `Zone ID: zone_abc123`, and domain label `โดเมน: qa.example.com`.
- **Admin Section:** Displayed `ตั้งรหัสผ่านแล้ว` with green indicator and button `เปลี่ยนรหัสแอดมิน`.
- **Password Modification:** Clicked `เปลี่ยนรหัสแอดมิน`, filled new password `NewUpdatedPassword789!`, and submitted.
- **Result:** Settings updated (`HTTP 200`), toast `เปลี่ยนรหัสผ่านแอดมินแล้ว` displayed. Login with new password succeeded (`HTTP 200`) and old password was rejected (`HTTP 401`).
- **Verdict:** **PASS**
- **Evidence:** `09a-settings-overview.png`, `09b-settings-change-password-form.png`, `09c-settings-password-saved.png`

---

## 4. Screenshot Evidence Artifacts

All screenshots have been generated and saved to `$TAKKUB_ARTIFACTS_DIR/screenshots`:

| Filename | Description |
|---|---|
| `01-setup-redirect-step1.png` | Dashboard `GET /` redirects to `/setup` when onboarding is needed |
| `01-setup-step3-initial.png` | Initial view on Step 3 (Domain connection) for machine with cloudflared installed |
| `02-setup-token-verify-invalid.png` | Step 3 invalid Cloudflare API Token error message |
| `03-setup-step4-password.png` | Step 4 Admin Password creation form |
| `03b-setup-password-short-toast.png` | UI validation toast for passwords < 8 characters |
| `03c-setup-password-mismatch-toast.png` | UI validation toast for mismatched passwords |
| `04-setup-step5-ready.png` | Step 5 "พร้อมใช้งาน" with all 5 checklist items green |
| `05a-login-page.png` | Clean login screen at `/login` |
| `05b-login-wrong-password.png` | Login screen showing error on wrong password |
| `05c-dashboard-after-login.png` | Authenticated dashboard access after login |
| `06-setup-resumed-step5.png` | `/setup` resumed to Step 5 on refresh |
| `07-desktop-setup-initial.png` | Desktop Mode setup wizard with optional password skip |
| `09a-settings-overview.png` | `/settings` overview with Cloudflare Zone Name & Admin status |
| `09b-settings-change-password-form.png` | `/settings` password change form expanded |
| `09c-settings-password-saved.png` | `/settings` password change saved confirmation toast |

---

## 5. Cleanup Verification
- Test servers on ports `8899` and `8898` terminated cleanly.
- Temporary test directories removed.
- Production app / port 8888 untouched.
