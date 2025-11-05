# 🚇 Cloudflare Tunnel Manager

ระบบจัดการ Cloudflare Tunnels แบบ Interactive - ใช้งานง่าย ไม่ต้องจำคำสั่ง

---

## 🚀 Quick Start

### 1. ตรวจสอบความพร้อม
```bash
npm run check
```

ต้องมี: **Cloudflared** + **Docker Desktop**

ถ้ายังไม่มี → ดู [การติดตั้ง](#การติดตั้ง)

### 2. Login Cloudflare
```bash
npm run login
```
Browser จะเปิด → Login → Authorize

**หมายเหตุ:** ถ้าเจอ error `existing certificate` = login ไว้แล้ว (ข้ามได้)

### 3. สร้าง Tunnel
```bash
npm run setup
```

ตอบคำถาม:
- **Tunnel name:** `app-tunnel`
- **Domain:** `app.sabuytube.xyz`
- **Local port:** `3000`
- **Folder name:** `app`
- **Continue:** `yes`

Script จะทำให้อัตโนมัติ:
- ✅ สร้าง tunnel (รอให้เสร็จก่อน)
- ✅ ดึง Tunnel ID ที่ gen มาใหม่
- ✅ Copy credentials ที่ตรงกับ Tunnel ID
- ✅ สร้าง config.yml ด้วย Tunnel ID ที่ถูกต้อง
- ✅ สร้าง DNS route: `{domain}` → Tunnel
- ✅ สร้าง docker-compose file

📖 **อ่านเพิ่มเติม:** [SETUP-GUIDE.md](./SETUP-GUIDE.md) - อธิบายการทำงานแบบละเอียด

### 4. เริ่มใช้งาน
```bash
npm start
```

เสร็จแล้ว! เปิด browser ไปที่ `https://app.sabuytube.xyz` 🎉

---

## 💡 คำสั่งที่ใช้บ่อย

### ใช้งานทั่วไป
```bash
npm start                    # เริ่มทั้งหมด
npm stop                     # หยุดทั้งหมด
npm run status               # เช็คสถานะ
```

### จัดการ Tunnel
```bash
npm run setup                # สร้าง tunnel ใหม่
npm run delete               # ลบ tunnel (ถามก่อน)
npm run delete:app           # ลบ App tunnel โดยตรง
npm run delete:home          # ลบ Home tunnel โดยตรง
npm run delete:office        # ลบ Office tunnel โดยตรง
npm run tunnel:app:logs      # ดู logs (Ctrl+C ออก)
npm run tunnel:app:restart   # Restart tunnel
```

### แยกตาม Tunnel
```bash
npm run tunnel:app:up        # เริ่ม App tunnel
npm run tunnel:app:down      # หยุด App tunnel
npm run tunnel:office:up     # เริ่ม Office tunnel
npm run tunnel:office:down   # หยุด Office tunnel
```

---

## 🔧 การติดตั้ง

### Windows (PowerShell - Run as Admin)

**1. ติดตั้ง Cloudflared**
```bash
winget install Cloudflare.cloudflared
```

**2. ติดตั้ง Docker Desktop**
- ดาวน์โหลด: https://www.docker.com/products/docker-desktop/
- ติดตั้งและเปิดโปรแกรม

**3. ปิด Terminal แล้วเปิดใหม่** (สำคัญ!)

**4. ตรวจสอบ**
```bash
npm run check
```

ควรเห็น:
```
✅ Cloudflared is installed
✅ Docker is installed
✅ Docker Compose is installed
```

---

## 🎯 Setup Wizard (npm run setup)

Interactive wizard จะถาม 4 คำถาม:

| คำถาม | คำอธิบาย | ตัวอย่าง |
|-------|----------|----------|
| **Tunnel name** | ชื่อ tunnel ใน Cloudflare | `app-tunnel`, `office-tunnel` |
| **Domain** | โดเมนที่ต้องการใช้ | `app.sabuytube.xyz` |
| **Local port** | พอร์ตของ web server | `3000`, `8080`, `5000` |
| **Folder name** | ชื่อโฟลเดอร์เก็บ config | `app`, `office` |

หลังจากนั้นจะทำให้อัตโนมัติทั้งหมด!

---

## 📁 โครงสร้างโปรเจค

```
tunnel/
├── package.json                          # NPM scripts
├── README.md                             # คู่มือนี้
├── scripts/
│   ├── setup-tunnel.js                   # Setup wizard
│   ├── delete-tunnel.js                  # Delete wizard
│   ├── status.js                         # Status viewer
│   └── check-requirements.js             # Requirements checker
├── tunnels/
│   ├── app/
│   │   ├── config.yml                    # ✅ Config (in git)
│   │   ├── cert.pem                      # ❌ Credentials (gitignored)
│   │   └── *.json                        # ❌ Credentials (gitignored)
│   └── office/
│       └── ...
└── docker-compose-cloudflare-*.yml       # Docker Compose files
```

**สำคัญ:** ไฟล์ `.pem` และ `.json` ไม่ขึ้น git (ปลอดภัย)

---

## 🔍 แก้ไขปัญหา

### `cloudflared is not recognized`
```bash
# ติดตั้ง
winget install Cloudflare.cloudflared

# ปิด terminal แล้วเปิดใหม่
# ตรวจสอบ
npm run check
```

### `Docker is not running`
```bash
# เปิด Docker Desktop
# รอให้ status เป็น "Running"
docker ps
```

### Tunnel ไม่ทำงาน
```bash
# ดู logs
npm run tunnel:app:logs

# Restart
npm run tunnel:app:restart

# ถ้ายังไม่ได้ → ลบแล้วสร้างใหม่
npm run delete        # เลือกว่าจะลบอะไรบ้าง
npm run setup
npm start
```

**หมายเหตุ:** คำสั่ง `delete` จะถามก่อนว่าจะลบอะไรบ้าง (DNS, Tunnel, Config, Docker Compose)

### `existing certificate` เมื่อ login
- **ไม่ใช่ error!** คุณ login ไว้แล้ว
- ข้ามไปขั้นตอน `npm run setup` เลย

### Error 1033 / CRYPTO_ERROR
```bash
# ดู logs
npm run tunnel:app:logs

# ถ้าเห็น "CRYPTO_ERROR 0x178" - ไม่ต้องกังวล!
# ระบบใช้ protocol: auto จะ:
# 1. ลอง QUIC ก่อน (เร็วกว่า)
# 2. ถ้าไม่ได้จะใช้ HTTP/2 อัตโนมัติ (เสถียรกว่า)

# เช็คว่า tunnel เชื่อมต่อแล้วหรือยัง
docker logs cloudflared-tunnel-app | findstr "Registered"

# ถ้าเห็น "Registered tunnel connection" = ทำงานได้แล้ว! ✅
# protocol อาจเป็น quic หรือ http2 ก็ได้ - ทั้งคู่ดี
```

**หมายเหตุ:** CRYPTO_ERROR เป็นเรื่องปกติในการหา edge server ที่รองรับ QUIC  
ระบบจะลองต่อจนกว่าจะเจอ หรือใช้ HTTP/2 แทน (เร็วพอๆ กัน)

📖 **อ่านเพิ่มเติม:** 
- [SETUP_SUMMARY.md](./SETUP_SUMMARY.md) - การตั้งค่าและ protocol ทั้งหมด
- [ERROR_1033_FIX.md](./ERROR_1033_FIX.md) - วิธีแก้ Error 1033 แบบละเอียด

---

## 📚 คำสั่งทั้งหมด

### Setup
| คำสั่ง | คำอธิบาย |
|--------|----------|
| `npm run check` | ตรวจสอบความพร้อม |
| `npm run login` | Login Cloudflare |
| `npm run setup` | สร้าง tunnel ใหม่ (interactive) |
| `npm run cleanup <name>` | 🗑️ ลบทุกอย่างในคำสั่งเดียว (แนะนำ) |
| `npm run delete:tak` | ลบ tak tunnel (เลือกได้ว่าจะลบอะไร) |
| `npm run quick-delete:tak` | ⚡ ลบ tunnel จาก Cloudflare เท่านั้น |
| `npm run status` | ดูสถานะทั้งหมด |

🗑️ **Cleanup (แนะนำ):** `npm run cleanup tak` - ลบทุกอย่างอัตโนมัติในคำสั่งเดียว  
📖 **คู่มือ Delete:** [DELETE-GUIDE.md](./DELETE-GUIDE.md) - วิธีลบแบบเลือกได้  
⚠️ **แก้ปัญหา:** [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - ถ้าลบ tunnel ไม่ได้

### Start/Stop
| คำสั่ง | คำอธิบาย |
|--------|----------|
| `npm start` | เริ่มทั้งหมด |
| `npm stop` | หยุดทั้งหมด |
| `npm run tunnel:all:restart` | Restart ทั้งหมด |
| `npm run tunnel:app:up` | เริ่ม App tunnel |
| `npm run tunnel:app:down` | หยุด App tunnel |
| `npm run tunnel:app:restart` | Restart App tunnel |
| `npm run tunnel:app:logs` | ดู App logs |

---

## 🔒 Security

### ✅ ปลอดภัย
- Credentials (`.pem`, `.json`) ถูก gitignore แล้ว
- แค่ `config.yml` ขึ้น git (ไม่มี secrets)

### ✅ ตรวจสอบก่อน commit
```bash
git status              # ดูไฟล์ที่จะ commit
git status --ignored    # ดูไฟล์ที่ถูก ignore
```

---

## 💡 ตัวอย่าง

### สร้าง Tunnel แรก
```bash
npm run check           # ตรวจสอบ
npm run login           # Login (ถ้ายังไม่เคย)
npm run setup           # สร้าง tunnel
npm start               # เริ่มใช้งาน
npm run status          # เช็คสถานะ
```

### เพิ่ม Tunnel ใหม่
```bash
npm run setup           # สร้างอีกตัว
npm start               # เริ่มทั้งหมด
```

### Troubleshooting
```bash
npm run status                  # เช็คสถานะ
npm run tunnel:app:logs         # ดู error
npm run tunnel:app:restart      # ลอง restart
```

---

## 📖 เอกสารเพิ่มเติม

- **QUICK-START.md** - คู่มือสั้นๆ
- **INSTALL.md** - คู่มือติดตั้งละเอียด
- **START-HERE.md** - จุดเริ่มต้น

---

## 🎉 เท่านี้ก็พร้อมใช้งาน!

```bash
npm run check    # 1. ตรวจสอบ
npm run login    # 2. Login
npm run setup    # 3. สร้าง
npm start        # 4. เริ่ม!
```

**Happy Tunneling! 🚀**
