# ✅ Cloudflare Tunnel Manager - สรุปการเปลี่ยนแปลง

## 🗑️ ลบไฟล์ที่ไม่ใช้แล้ว
- ✅ ลบไฟล์ `.bat` ทั้งหมดออกแล้ว
- ✅ ไม่ต้องใช้ batch files อีกต่อไป

## ✨ เพิ่ม Interactive Scripts

### 1. `npm run setup` - Setup Wizard
สร้าง tunnel แบบ step-by-step โดยตอบคำถาม:
- Tunnel name (เช่น `app-tunnel`)
- Domain (เช่น `app.sabuytube.xyz`)
- Local port (default: 3000)
- Folder name (เช่น `app`)

สคริปต์จะทำให้อัตโนมัติ:
- ✅ สร้าง Cloudflare tunnel
- ✅ คัดลอก credentials และ cert.pem
- ✅ สร้าง config.yml
- ✅ ตั้งค่า DNS route
- ✅ สร้างไฟล์ docker-compose

### 2. `npm run delete` - Delete Wizard
ลบ tunnel แบบ interactive:
- แสดงรายการ tunnels ทั้งหมด
- เลือก tunnel ที่ต้องการลบ
- ยืนยันการลบด้วยคำว่า "DELETE"

### 3. `npm run status` - Status Viewer
แสดง:
- Docker containers ที่กำลังรัน
- Cloudflare tunnels ทั้งหมดใน account

## 📦 NPM Scripts ที่มี

### Setup & Management
```bash
npm run login    # Login Cloudflare (ครั้งแรก)
npm run setup    # สร้าง tunnel ใหม่ ⭐ แบบ interactive
npm run delete   # ลบ tunnel ⭐ แบบ interactive
npm run status   # ดูสถานะทั้งหมด
```

### Start/Stop
```bash
npm start                  # เริ่มทั้งหมด
npm stop                   # หยุดทั้งหมด
npm run tunnel:all:up      # เริ่มทั้งสอง
npm run tunnel:all:down    # หยุดทั้งสอง
npm run tunnel:all:restart # Restart ทั้งสอง
npm run tunnel:app:up      # เริ่ม App
npm run tunnel:app:down    # หยุด App
npm run tunnel:app:restart # Restart App
npm run tunnel:office:up   # เริ่ม Office
npm run tunnel:office:down # หยุด Office
npm run tunnel:office:restart # Restart Office
```

### Monitor
```bash
npm run tunnel:app:logs    # ดู App logs
npm run tunnel:office:logs # ดู Office logs
```

## 🎯 วิธีใช้งาน

### สร้าง Tunnel ใหม่
```bash
npm run setup
```
จากนั้นตอบคำถาม:
```
Enter tunnel name: my-tunnel
Enter domain: my-app.example.com
Enter local port: 3000
Enter folder name: myapp
Continue? yes
```

### ใช้งานประจำ
```bash
npm start    # เริ่ม
npm status   # เช็ค
npm stop     # หยุด
```

### ลบ Tunnel
```bash
npm run delete
```
จากนั้นเลือก tunnel และพิมพ์ "DELETE"

## 📁 ไฟล์ที่สร้างให้

- ✅ `scripts/setup-tunnel.js` - Setup wizard
- ✅ `scripts/delete-tunnel.js` - Delete wizard
- ✅ `scripts/status.js` - Status viewer
- ✅ `README.md` - คู่มือใช้งานแบบละเอียด
- ✅ `QUICK-START.md` - คู่มือใช้งานแบบสั้น

## 🎉 ข้อดี

- ✅ **ไม่ต้องจำคำสั่งยาวๆ** - แค่รัน npm script
- ✅ **Interactive** - ตอบคำถามง่ายๆ ไม่ต้องจำพารามิเตอร์
- ✅ **Safe** - มี confirmation ก่อนลบ
- ✅ **Clean** - ไม่มีไฟล์ .bat กระจายอยู่
- ✅ **Cross-platform ready** - Node.js scripts ทำงานได้ทุก OS

---

**ตอนนี้พร้อมใช้งานแล้ว!** 🚀

