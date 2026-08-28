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

## หมายเหตุ: ยังไม่มี `package-lock.json`

repo นี้ยังไม่ commit lockfile ไว้ (root/`web`/`desktop`) — CI/release เลยใช้ `npm install` แทน `npm ci` ไปก่อน เมื่อ commit lockfile แล้วควรเปลี่ยนทั้งสอง workflow กลับไปใช้ `npm ci` เพื่อ install ที่ reproducible และเร็วขึ้น (cache ได้ด้วย `actions/setup-node`'s `cache: npm`)
