# QA Gate Report: Per-Tunnel Password Gate Feature

**Date:** 2026-08-28  
**Tester:** QA Agent  
**Target Commits:** `623adea` (Frontend) + `0639462` (Backend) + `d89503c` (Fix)  
**Overall Result:** ✅ **PASS (All Tests & Re-Verification Passed)**

---

## 1. Executive Summary

| Test Area | Result | Notes |
|---|---|---|
| **1. Unit Tests (`scripts/__tests__`)** | **PASS** | 34/34 tests passed (`auth-gate-crypto`, `auth-gate-server`, `auth-gate`). |
| **2. Web TypeScript Typecheck** | **PASS** | `npx tsc --noEmit` in `web/` passed with 0 errors. |
| **3. Docker Web Path Mapping (`HOST_PROJECT_DIR`)** | **PASS** | API route inside `tunnel-tunnel-web-1` container executed `scripts/auth-gate.js` and successfully spawned sibling containers `tunnel-auth-gate` and `tunnel-auth-gate-server` using host path mapping. |
| **4. Web Admin UI & Modal** | **PASS** | Key/lock button opens `AuthGateModal`, toggle switch works, password inputs validate, lock badge `🔒 Password` appears on tunnel card. |
| **5. Config Ingress Rewrite** | **PASS** | `tunnels/promptpay/config.yml` ingress rewritten to `http://host.docker.internal:8890` on enable, restored to original `http://host.docker.internal:6201` on disable. |
| **6. Login Page UI & Standalone Template** | **PASS** | Standalone `login.html` rendered correctly with tunnel name and clean UI. |
| **7. Wrong Password Validation** | **PASS** | Submitting wrong password displays error message "Incorrect password." and rejects login. |
| **8. Password Change** | **PASS** | Updated password in UI immediately takes effect on next request. |
| **9. Disable Gate & Cleanup** | **PASS** | Disabling gate removes per-tunnel nginx conf, leaves default server, and restores ingress without breaking nginx listener. |
| **10. HTTPS / Cookie Session Loop (Bug)** | **FAIL** | **BLOCKER:** Nginx default `absolute_redirect on` downgrades 302 redirects to `http://`. Browser drops `Secure` cookie on insecure HTTP, causing an infinite login redirect loop. |

---

## 2. Detailed Bug Report

### Bug: Missing `absolute_redirect off;` in Nginx Gate Config causes Infinite Login Loop on HTTPS

- **Severity:** High / Blocker
- **Affected File:** [`scripts/auth-gate.js`](file:///C:/Users/monch/WebstormProjects/tunnel/scripts/auth-gate.js#L148-L187) (`writeGateConfig`)
- **Description:**
  When a user accesses `https://<hostname>`, Cloudflare proxies traffic over HTTP to the `cloudflared` container, which forwards to `tunnel-auth-gate` (nginx) on port 80.
  When unauthenticated, nginx executes:
  ```nginx
  location @login {
      return 302 /__gate/login?next=$request_uri;
  }
  ```
  Because nginx listens on port 80 and `absolute_redirect` defaults to `on`, nginx converts the relative redirect into an absolute URL with `http://` scheme:
  ```http
  HTTP/1.1 302 Found
  Location: http://<hostname>/__gate/login?next=/
  ```
  The browser follows the redirect to `http://<hostname>/...` (downgrading from HTTPS to HTTP).
  When the user submits the correct password, `auth-gate-server.js` issues a session cookie with the `Secure` flag:
  ```http
  Set-Cookie: tunnel_gate_<name>=<token>; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=604800
  ```
  According to RFC 6265bis, browsers **ignore or refuse to store/send `Secure` cookies over plain HTTP (`http://`)**. Consequently, when redirected back to `http://<hostname>/`, the browser does not send the session cookie. Nginx `auth_request /__gate/verify` fails (401), redirecting the browser back to `/__gate/login` in an endless loop.

- **Proof of Concept / Verification:**
  1. `curl -I https://promptpay.sabuytube.xyz` returned `location: http://promptpay.sabuytube.xyz/__gate/login?next=/`.
  2. Submitting correct password in Playwright browser redirected to `http://...` and reloaded the login page instead of the app because the cookie was dropped.
  3. Direct verification via curl with `-b "tunnel_gate_promptpay=..."` against `http://localhost:8890/` returned `200 OK` and correctly served the backend app.

- **Suggested Fix:**
  In `scripts/auth-gate.js` inside `writeGateConfig()`, add `absolute_redirect off;` (and `port_in_redirect off;`) to the `server` block:
  ```nginx
  server {
      listen 80;
      server_name ${hostname};
      absolute_redirect off;
      port_in_redirect off;

      location / {
          ...
  ```
  This ensures nginx issues relative redirects (`Location: /__gate/login?next=/`), preserving the browser's original `https://` protocol.

---

## 3. Note on `takkub qa-gate` Root Command

Running `takkub qa-gate` at repository root fails because the root `tsconfig.json` has:
```json
"include": [
  "src"
]
```
while there is no `src/` folder at root (the TypeScript project is located under `web/`).
Running `tsc --noEmit` inside `web/` passes with 0 errors.

---

## 4. Evidence & Screenshots

All screenshots have been captured and saved to `web/screenshots/` and copied to `$TAKKUB_ARTIFACTS_DIR/screenshots/`:
- `01-dashboard.png` — Web Admin Dashboard
- `auth-gate-modal-initial.png` — Auth Gate Modal initial state
- `auth-gate-modal-enable.png` — Enabling password gate with password
- `dashboard-with-lock-badge.png` — Dashboard showing `🔒 Password` badge on `promptpay` card
- `auth-gate-login-page.png` — Rendered standalone login page
- `auth-gate-login-error.png` — Error message on wrong password submission
- `auth-gate-modal-change-pass.png` — Changing password modal
- `auth-gate-modal-disable.png` — Disabling auth gate confirmation modal
- `dashboard-after-disable.png` — Dashboard after auth gate disabled
- `auth-gate-direct-app.png` — Direct access to backend app after disabling gate
- `reverify-app-authenticated.png` — Authenticated session rendering target app directly on HTTPS

---

## 5. Re-Verification Report (Post-Fix: Commit `d89503c`)

### Overview
Following the fix in commit `d89503c` (`absolute_redirect off;` & `port_in_redirect off;` in `scripts/auth-gate.js`), full end-to-end re-verification was conducted.

| Re-Verify Step | Expected Behavior | Actual Result | Status |
|---|---|---|---|
| **1. `takkub qa-gate`** | Verification suite passes typecheck & 34 unit tests | Node verify passed in 4.7s (`ℹ pass 34 / ℹ fail 0`). | **PASS** |
| **2. Enable Gate via Admin Web UI** | Enable password protection on `promptpay` with password `secret1234` | Modal submitted successfully, `🔒 Password` badge appeared, ingress updated to `:8890`. | **PASS** |
| **3. HTTPS Relative Redirect Check** | `curl -I https://promptpay.sabuytube.xyz` returns relative `Location: /__gate/login?next=/` without `http://` scheme | `location: /__gate/login?next=/` returned with HTTP 302. | **PASS** |
| **4. Browser Login & Session Persistence** | Navigate to `https://promptpay.sabuytube.xyz`, submit correct password, enter app without infinite redirect loop | Form submitted, `Secure` cookie accepted by browser on HTTPS, authenticated app rendered (`PromptPay App Success`). Page reload & new tab access retained session seamlessly. | **PASS** |
| **5. Disable Gate via Web UI & Cleanup** | Disable password gate on `promptpay`, verify tunnel and config restore to original target | Gate disabled via UI, `promptpay/config.yml` reverted to `:6201`, `promptpay.conf` deleted, direct access restored (`HTTP 200 OK`). System left in **disabled** state. | **PASS** |

### Conclusion
The HTTPS / Cookie session redirect bug is **fully resolved**. All test cases have passed.

