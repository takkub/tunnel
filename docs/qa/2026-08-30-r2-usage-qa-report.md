# QA Report: Cloudflare R2 Usage Feature

**Date:** 2026-08-30  
**Tester:** QA Teammate (`qa`)  
**Target Commits:** `1ee02b7` (frontend: R2 Usage card) & `11c6c8e` (backend: GET /api/r2/usage endpoint) merged via `3342a65` & `d28c9b6`  
**Overall Status:** **FAIL (1 Bug Found: Timestamp Display `NaN ชม.ที่แล้ว`)**

---

## 1. Executive Summary

The **Cloudflare R2 Usage feature** was evaluated across all 4 required verification criteria:

| Check | Description | Status | Notes |
|---|---|---|---|
| **(1) QA Gate & Merge Integrity** | `takkub qa-gate` (typecheck + test suite) & check duplicate/conflicting definitions in `settings.ts` / `route.ts`. | **PASS** | 213/213 unit tests pass cleanly after `web/` dependency install; no duplicate or conflicting definitions in settings store. |
| **(2) Live API Verification** | Run web against real `%APPDATA%/tunnel-desktop` read-only (`ezstorage` bucket). | **PASS** | `GET /api/r2/usage` returned real metrics (`6,468,285` bytes, `2` objects), `ops: null` with reason, `totalUsd: 0`, and caching (`cached: false` on `?refresh=1`, `cached: true` on next call). |
| **(3) UI Card & Responsive Layout** | Settings page UI at 1440px & 375px: progress bar, dimmed ops, cost line, refresh button, responsive layout. | **FAIL** | Visual layout, bars, free-tier cost label, and refresh button PASS. **FAIL:** Updated timestamp renders as **`อัปเดต NaN ชม.ที่แล้ว`** due to ISO string vs number timestamp mismatch between backend and frontend. |
| **(4) Unconfigured State** | Temp empty `TUNNEL_DATA_DIR` -> compact state in UI and `{ configured: false }` API response. | **PASS** | API returned `{ "configured": false }` (HTTP 200); UI renders compact hint `"ตั้งค่า R2 ด้านบนก่อนเพื่อดูปริมาณการใช้งาน"`. |

---

## 2. Detailed Verification Results

### Check 1: QA Gate & Merge Integrity
- **Command:** `takkub qa-gate`
- **Result:** **PASS** (213 tests passed, 0 failed, duration ~23.7s; TypeScript validation clean).
- **Code Review (`web/lib/settings.ts`, `web/app/api/settings/route.ts`, `scripts/settings-store.js`):**
  - Verified `r2.analyticsToken` addition: Both branches merged cleanly.
  - `StoredR2` interface has `analyticsToken?: string`.
  - `R2SettingsView` provides `analyticsTokenSet: boolean` and `analyticsTokenMasked: string | null`.
  - `setR2Settings` handles `analyticsToken` in both TypeScript (`web/lib/settings.ts`) and CommonJS (`scripts/settings-store.js`).
  - No duplicate symbols or conflicting definitions survived the merge.

---

### Check 2: Live API Check (`ezstorage` bucket in `%APPDATA%/tunnel-desktop`)
- **Execution:** Started web server on isolated port `8899` with `TUNNEL_DATA_DIR=%APPDATA%/tunnel-desktop` (read-only; existing `settings.json` untouched).
- **Response from `GET /api/r2/usage`:**
  ```json
  {
    "configured": true,
    "bucket": "ezstorage",
    "storage": {
      "bytes": 6468285,
      "objectCount": 2,
      "truncated": false,
      "freeBytes": 10737418240,
      "usedPct": 0.06
    },
    "ops": null,
    "opsUnavailableReason": "no analytics token configured",
    "cost": {
      "storageUsd": 0,
      "classAUsd": 0,
      "classBUsd": 0,
      "totalUsd": 0,
      "pricing": {
        "storageUsdPerGbMonth": 0.015,
        "storageFreeGb": 10,
        "classAUsdPerMillion": 4.5,
        "classAFreePerMonth": 1000000,
        "classBUsdPerMillion": 0.36,
        "classBFreePerMonth": 10000000
      }
    },
    "fetchedAt": "2026-08-30T10:58:28.709Z",
    "cached": false
  }
  ```
- **Caching Behavior:**
  - `GET /api/r2/usage` -> `cached: true`
  - `GET /api/r2/usage?refresh=1` -> `cached: false`
  - `GET /api/r2/usage` -> `cached: true`
- **Verdict:** **PASS**

---

### Check 3: UI Card & Visual Verification (`/settings`)
- **Viewport Testing:** Tested at 1440px (desktop) and 375px (mobile).
- **Observations:**
  - **Storage Progress Bar:** Displays `6.2 MB / 10 GB (0.1%)` with active green bar.
  - **Class A / Class B Ops Bars:** Dimmed with `—` value.
  - **Ops Unavailable Reason:** Displays `no analytics token configured` with `+ เพิ่ม Analytics token` action link.
  - **Cost Indicator:** Displays `อยู่ใน free tier 🎉` in emerald text.
  - **Refresh Button:** Present and triggers `/api/r2/usage?refresh=1`.
  - **Mobile Layout (375px):** No horizontal overflow (`scrollWidth <= innerWidth`); all elements fit within viewport.
  - **BUG FOUND:** Header subtitle displays **`อัปเดต NaN ชม.ที่แล้ว`** (or `อัปเดตล่าสุด NaN ชม.ที่แล้ว`).
- **Verdict:** **FAIL**

#### Bug Repro & Root Cause:
1. **Backend (`web/lib/r2-usage.ts:84`):**
   ```ts
   fetchedAt: new Date().toISOString() // string, e.g. "2026-08-30T10:58:28.709Z"
   ```
2. **Frontend (`web/components/R2UsageCard.tsx:41-47`):**
   ```tsx
   function formatAgo(ts: number): string {
     const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000))
     if (mins < 1) return 'เมื่อสักครู่'
     if (mins < 60) return `${mins} นาทีที่แล้ว`
     const hrs = Math.floor(mins / 60)
     return `${hrs} ชม.ที่แล้ว`
   }
   ```
3. In JavaScript, `Date.now() - "2026-08-30T10:58:28.709Z"` evaluates to `NaN`. As a result, `formatAgo` always returns `"NaN ชม.ที่แล้ว"`.
4. **Recommended Fix:** In `web/components/R2UsageCard.tsx`, parse `ts` to epoch ms:
   ```tsx
   function formatAgo(ts: number | string): string {
     const ms = typeof ts === 'number' ? ts : new Date(ts).getTime()
     if (isNaN(ms)) return 'เมื่อสักครู่'
     const mins = Math.max(0, Math.floor((Date.now() - ms) / 60000))
     if (mins < 1) return 'เมื่อสักครู่'
     if (mins < 60) return `${mins} นาทีที่แล้ว`
     const hrs = Math.floor(mins / 60)
     return `${hrs} ชม.ที่แล้ว`
   }
   ```
   And update `R2UsageResponse` interface in `R2UsageCard.tsx`:
   ```ts
   fetchedAt: string | number
   ```

---

### Check 4: Not-Configured State
- **Setup:** Temporary isolated `TUNNEL_DATA_DIR` with R2 credentials unset.
- **API Response:** `GET /api/r2/usage` returned HTTP `200 OK` with:
  ```json
  {
    "configured": false
  }
  ```
- **UI State:** R2 Card displays compact hint:
  ```
  ตั้งค่า R2 ด้านบนก่อนเพื่อดูปริมาณการใช้งาน
  ```
- **Verdict:** **PASS**

---

## 3. Evidence Artifacts

Screenshots captured and stored in `$TAKKUB_ARTIFACTS_DIR/screenshots/`:
- `01-settings-1440px.png` — Desktop viewport (1440px) showing R2 Usage card with storage progress bar, dimmed ops bars, and visible `NaN ชม.ที่แล้ว` timestamp issue.
- `02-settings-375px.png` — Mobile viewport (375px) verifying responsive layout with no overflow.
- `03-settings-unconfigured-1440px.png` — Desktop viewport (1440px) showing compact unconfigured state.
- `04-settings-unconfigured-375px.png` — Mobile viewport (375px) showing compact unconfigured state.

---

## 4. Conclusion & Recommendation

The backend API and core R2 storage integration operate accurately according to specification with valid metrics and caching. However, due to the timestamp format mismatch causing **`อัปเดต NaN ชม.ที่แล้ว`** in the UI, this QA gate is reported as **FAIL** so Lead can dispatch the one-line fix to frontend.
