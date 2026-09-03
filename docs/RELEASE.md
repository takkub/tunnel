# การ Release Desktop App

Release ทำด้วยคำสั่งเดียว: bump เวอร์ชัน → commit → tag → push → CI build ให้อัตโนมัติ

## วิธีใช้

```bash
npm run release -- patch   # 1.0.0 -> 1.0.1 (bug fix)
npm run release -- minor   # 1.0.0 -> 1.1.0 (feature ใหม่)
npm run release -- major   # 1.0.0 -> 2.0.0 (breaking change)
```

`scripts/release.js` จะ:
1. เช็คว่า working tree clean (ถ้ามีการแก้ไขค้างอยู่ จะ error ให้ commit/stash ก่อน)
2. bump `version` ใน `package.json` (root) และ `desktop/package.json` (ถ้ามี)
3. commit เป็น `chore(release): vX.Y.Z`
4. สร้าง tag `vX.Y.Z`
5. `git push` + push tag ขึ้น origin

จากนั้น GitHub Actions (`.github/workflows/release.yml`) จะ trigger จาก tag `v*`:
- build ทั้ง Windows (`.exe`, nsis) และ macOS (`.dmg`, arm64 + x64)
- upload ไฟล์ installer เป็น build artifacts ของ workflow run (เข้าไปดู/ดาวน์โหลดได้จากหน้า Actions แม้ไม่ publish)
- publish ขึ้น GitHub Release ของ tag นั้น พร้อม generate `latest.yml` / `latest-mac.yml` ให้ auto-update (electron-updater) ทำงานได้

## CI (ทุก push/PR เข้า main)

`.github/workflows/ci.yml` รัน `npm run verify` (typecheck ของ web + `node --test`) บน Node 20 — ไม่ build installer เพราะไม่ต้องรอ build เต็มทุก PR

## Windows installer / auto-update

`desktop/package.json`'s `build.nsis` ใช้ `oneClick: true` + `perMachine:
false` — installer ที่ build ออกมาลงที่ `%LOCALAPPDATA%\Programs\Tunnel
Manager` (per-user) แบบ one-click ไม่มี wizard ("Choose Installation
Options") ให้กดเลย ทั้งตอนติดตั้งครั้งแรกและตอน auto-update
(`autoUpdater.quitAndInstall(true, true)` ใน `desktop/src/updater.ts` สั่ง
installer รันแบบ `/S` เงียบ ๆ แล้ว relaunch แอปเองหลังติดตั้งเสร็จ) — user
ไม่ต้องเห็น/กดอะไรเพิ่มหลังกด "Restart now" macOS ยังใช้ `.dmg` เดิม ไม่มี
auto-run ฝั่งนั้น (ผู้ใช้ลากแอปลง Applications เอง) จึง Gatekeeper workaround
ด้านล่างยังใช้เหมือนเดิม

## ⚠️ TODO: Code signing / Notarization

Workflow ปัจจุบัน build ได้แต่**ไม่ได้ sign** — จะได้ installer ที่ไม่มี code signature (Windows SmartScreen เตือน, macOS Gatekeeper บล็อก ต้อง right-click → Open)

ตอนพร้อม sign ของจริง ให้เพิ่ม GitHub Actions secrets เหล่านี้ (workflow อ่านมาเป็น env var ให้ electron-builder อัตโนมัติ ไม่ต้องแก้ workflow เพิ่ม):

| Secret | ใช้ทำอะไร |
|---|---|
| `CSC_LINK` | path/URL ไปยังไฟล์ certificate (.p12/.pfx) แบบ base64 หรือ URL — ใช้ทั้ง Windows และ macOS signing |
| `CSC_KEY_PASSWORD` | password ของ certificate |
| `APPLE_ID` | Apple ID สำหรับ notarization (macOS) |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password ของ Apple ID นั้น |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

ไม่มี secret พวกนี้ → electron-builder จะ build แบบ unsigned พร้อม warning (ไม่ fail build)

นอกจาก secrets ข้างบน ตอนพร้อม sign จริงต้องแก้ `desktop/package.json`'s `build.mac`
ด้วย:
- เพิ่ม `"hardenedRuntime": true` — required สำหรับ notarization
- เพิ่ม entitlements file (`build/entitlements.mac.plist`) ถ้า runtime ต้องการ permission พิเศษ (network, etc.)
- electron-builder จะ notarize อัตโนมัติเมื่อเห็น `APPLE_ID` +
  `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` ครบ (ใช้ `notarytool` ภายใน
  ไม่ต้องเพิ่ม step เอง) — Windows ฝั่ง `CSC_LINK`/`CSC_KEY_PASSWORD` ก็ sign
  พอมี cert โดยไม่ต้องแก้ `build.win` เพิ่ม

สรุป long-term fix: Apple Developer ID cert (`CSC_LINK`+`CSC_KEY_PASSWORD`) +
Apple ID สำหรับ notarytool (`APPLE_ID`+`APPLE_APP_SPECIFIC_PASSWORD`+`APPLE_TEAM_ID`)
+ เปิด `hardenedRuntime` ใน `build.mac` — ยังไม่ implement ตอนนี้ แค่ document ไว้

### อาการที่ผู้ใช้เจอ + workaround

Unsigned/unnotarized build → macOS Gatekeeper บล็อก 2 แบบ ขึ้นกับ macOS
version และสถานะ signature ของ build นั้น (ไม่ใช่ไฟล์เสียหรือมี malware จริง
ทั้งคู่ — เป็นเพราะไม่มี Developer ID signature/notarization จริง +
quarantine attribute จาก browser) Windows เจอ SmartScreen เตือนคล้ายกัน
วิธีแก้ทั้งสอง OS อยู่ที่
[`README.md` § ติดตั้งบน macOS](../README.md#ติดตั้งบน-macos)

**macOS Sequoia (15+), ทุก release ตราบใดที่ยังไม่ notarize จริง:** dialog
ขึ้นว่า `Apple could not verify "Tunnel Manager" is free of malware that may
harm your Mac or compromise your privacy.` พร้อมปุ่ม `Move to Trash` /
`Done` — คำว่า "malware" ในข้อความนี้แปลว่า **"Apple ยังไม่ได้ตรวจสอบ"**
ไม่ใช่ "ตรวจสอบแล้วเจอปัญหา" เป็น standard wording ของ Sequoia สำหรับแอปที่
signed แต่ยังไม่ notarize (คนละเคสกับ "damaged" ด้านล่าง) มี user report จริง
จาก v1.1.15 ว่าเห็นคำว่า malware แล้วตกใจคิดว่าติดไวรัส — วิธีแก้: กด **Done**
(ห้าม Move to Trash) → **System Settings → Privacy & Security** เลื่อนลง
ล่างสุดหาข้อความ `was blocked to protect your Mac` → **Open Anyway** → ยืนยัน
+ ใส่รหัสเครื่อง → เปิดได้ถาวรตั้งแต่ครั้งนั้นไป ทำครั้งเดียวจบ ไม่ต้อง
`codesign` เอง

**Apple Silicon เฉพาะ (v1.1.15+ แก้แล้ว):** ก่อน v1.1.15 การ `xattr -cr`
อย่างเดียวไม่พอบน arm64 — macOS ปฏิเสธรัน binary ที่ไม่มี signature เลย
แม้จะล้าง quarantine attribute แล้วก็ตาม (ต่างจาก Intel ที่ `xattr -cr` พอ)
release **≤ v1.1.14** ต้อง ad-hoc sign เพิ่มเองด้วย
`codesign --force --deep --sign - "/Applications/Tunnel Manager.app"`
(ดู README) ตั้งแต่ v1.1.15 `desktop/scripts/afterPack-adhoc-sign.js`
(wired ผ่าน `build.afterPack` ใน `desktop/package.json`) รัน ad-hoc sign
ให้อัตโนมัติทุก mac build แล้ว เหลือแค่ `xattr -cr` เท่านั้น — ad-hoc sign
ไม่ใช่ signing จริง (ไม่มี Developer ID, ไม่ notarize) แค่พอผ่านเงื่อนไข
"ต้องมี signature" ของ arm64 macOS

**CI verify (v1.1.16+):** `.github/workflows/release.yml` มี step "Verify mac
signature" รันหลัง build ทุก mac target — เช็คด้วย
`codesign --verify --deep --strict` ทุก `.app` ที่ build ออกมา ถ้า ad-hoc
sign หลุด/พังใน build ไหน workflow จะ fail ให้เห็นทันทีแทนที่จะไปโผล่เป็น
"damaged" ที่เครื่องผู้ใช้

**Checklist:** release notes ของทุกเวอร์ชัน (GitHub Release ของ tag นั้น) ต้อง
แปะลิงก์คำแนะนำนี้ไว้ จนกว่าจะมี code signing/notarization จริง (ดู checklist
ด้านบน) — ไม่งั้นผู้ใช้ที่ไม่รู้จะคิดว่าไฟล์เสียแล้วเลิกใช้

## หมายเหตุ: ยังไม่มี `package-lock.json`

repo นี้ยังไม่ commit lockfile ไว้ (root/`web`/`desktop`) — CI/release เลยใช้ `npm install` แทน `npm ci` ไปก่อน เมื่อ commit lockfile แล้วควรเปลี่ยนทั้งสอง workflow กลับไปใช้ `npm ci` เพื่อ install ที่ reproducible และเร็วขึ้น (cache ได้ด้วย `actions/setup-node`'s `cache: npm`)
