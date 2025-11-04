# Cloudflare Tunnel Manager

## 📋 ข้อกำหนดเบื้องต้น

ก่อนเริ่มใช้งาน ต้องติดตั้งโปรแกรมเหล่านี้ก่อน:
- ✅ **Cloudflared** - Cloudflare Tunnel client
- ✅ **Docker Desktop** - สำหรับรัน containers

### ตรวจสอบความพร้อม

```bash
npm run check
```

ถ้ายังไม่ได้ติดตั้ง ดูวิธีติดตั้งที่: **[INSTALL.md](INSTALL.md)** 📦

---

## 🚀 Quick Start (ติดตั้งครั้งแรก)

### ขั้นตอนที่ 1: Login เข้า Cloudflare
```bash
npm run login
```

### ขั้นตอนที่ 2: สร้าง Tunnel (Interactive Setup)
```bash
npm run setup
```

คุณจะถูกถามคำถามต่อไปนี้:
- **Tunnel name**: ชื่อ tunnel (เช่น `app-tunnel`, `office-tunnel`)
- **Domain**: โดเมนที่ต้องการ (เช่น `app.sabuytube.xyz`)
- **Local port**: พอร์ตของเซิร์ฟเวอร์ local (default: 3000)
- **Folder name**: ชื่อโฟลเดอร์สำหรับเก็บ config (เช่น `app`, `office`)

สคริปต์จะทำทุกอย่างให้อัตโนมัติ:
- ✅ สร้าง Cloudflare tunnel
- ✅ คัดลอก credentials และ cert.pem
- ✅ สร้าง config.yml
- ✅ ตั้งค่า DNS route
- ✅ สร้างไฟล์ docker-compose

### ขั้นตอนที่ 3: เริ่มใช้งาน
```bash
npm start
```

---

## 💡 วิธีใช้งานประจำวัน

### เริ่ม/หยุด Tunnels

```bash
# เริ่มทั้งหมด (แนะนำ ⭐)
npm start

# หยุดทั้งหมด
npm stop

# เริ่มแค่ App tunnel
npm run tunnel:app:up

# เริ่มแค่ Office tunnel
npm run tunnel:office:up

# หยุดแค่ App tunnel
npm run tunnel:app:down

# หยุดแค่ Office tunnel
npm run tunnel:office:down
```

### Restart Tunnels

```bash
# Restart ทั้งหมด
npm run tunnel:all:restart

# Restart แค่ App
npm run tunnel:app:restart

# Restart แค่ Office
npm run tunnel:office:restart
```

### ดู Logs

```bash
# ดู App logs (กด Ctrl+C เพื่อออก)
npm run tunnel:app:logs

# ดู Office logs (กด Ctrl+C เพื่อออก)
npm run tunnel:office:logs
```

### เช็คสถานะ

```bash
# ดูสถานะ tunnels ที่กำลังรัน + list ทุก tunnels
npm run status
```

### ลบ Tunnels (Interactive)

```bash
# ลบ tunnel แบบ interactive
npm run delete
```

คุณจะถูกถาม:
- เลือก tunnel ที่ต้องการลบ
- ยืนยันการลบด้วยคำว่า "DELETE"

---

## 📋 รายละเอียด NPM Scripts ทั้งหมด

### 🔧 Setup & Management Scripts
```bash
npm run login    # Login เข้า Cloudflare (ครั้งแรก)
npm run setup    # สร้าง tunnel ใหม่ (interactive)
npm run delete   # ลบ tunnel (interactive)
npm run status   # ดูสถานะทั้งหมด
```

### 🚀 Start/Stop Scripts (ใช้งานประจำ)
```bash
npm start                  # เริ่มทั้งหมด ⭐
npm stop                   # หยุดทั้งหมด
npm run tunnel:all:up      # เริ่มทั้งสอง tunnels
npm run tunnel:all:down    # หยุดทั้งสอง tunnels
npm run tunnel:all:restart # Restart ทั้งสอง tunnels
npm run tunnel:app:up      # เริ่ม App tunnel
npm run tunnel:app:down    # หยุด App tunnel
npm run tunnel:app:restart # Restart App tunnel
npm run tunnel:office:up   # เริ่ม Office tunnel
npm run tunnel:office:down # หยุด Office tunnel
npm run tunnel:office:restart # Restart Office tunnel
```

### 📊 Monitor Scripts
```bash
npm run tunnel:app:logs    # ดู App tunnel logs
npm run tunnel:office:logs # ดู Office tunnel logs
```

---

## 🎯 ตัวอย่างการใช้งาน

### ครั้งแรก (Setup App Tunnel)
```bash
# 1. Login
npm run login

# 2. สร้าง App tunnel
npm run setup
# Enter tunnel name: app-tunnel
# Enter domain: app.sabuytube.xyz
# Enter local port: 3000
# Enter folder name: app
# Continue? yes

# 3. เริ่มใช้งาน
npm start
```

### สร้าง Tunnel ตัวที่สอง (Office)
```bash
npm run setup
# Enter tunnel name: office-tunnel
# Enter domain: office.sabuytube.xyz
# Enter local port: 3000
# Enter folder name: office
# Continue? yes

# Restart เพื่อรัน tunnel ใหม่ด้วย
npm run tunnel:office:up
```

### การใช้งานปกติ
```bash
# เริ่ม tunnels
npm start

# เช็คสถานะ
npm run status

# ดู logs ถ้ามีปัญหา
npm run tunnel:app:logs

# หยุด tunnels
npm stop
```

### แก้ไขปัญหา
```bash
# Restart ถ้ามีปัญหา
npm run tunnel:all:restart

# หรือ restart ทีละตัว
npm run tunnel:app:restart
npm run tunnel:office:restart
```

### ลบ Tunnel ที่ไม่ใช้
```bash
npm run delete
# เลือก tunnel ที่ต้องการลบ
# พิมพ์ DELETE เพื่อยืนยัน
```

---

## ⚙️ Configuration

### Tunnels Configuration

- **App Tunnel**: app.sabuytube.xyz → http://host.docker.internal:3000
- **Office Tunnel**: office.sabuytube.xyz → http://host.docker.internal:3000

### Config Files

- `cloudflared/app/config.yml` - App tunnel configuration
- `cloudflared/office/config.yml` - Office tunnel configuration
- `docker-compose-cloudflare-app.yml` - App Docker Compose
- `docker-compose-cloudflare-office.yml` - Office Docker Compose

### Scripts

- `scripts/setup-tunnel.js` - Interactive setup wizard
- `scripts/delete-tunnel.js` - Interactive delete wizard
- `scripts/status.js` - Status viewer

---

## 📝 Notes

- ✅ **Interactive Setup**: ใช้ `npm run setup` แล้วตอบคำถาม - ง่ายมาก!
- ✅ **No Batch Files**: ไม่มีไฟล์ .bat อีกต่อไป ใช้แค่ npm scripts
- ✅ **Step by Step**: ทุก command จะแสดงขั้นตอนชัดเจน
- ✅ **Safe Delete**: การลบต้องยืนยันด้วยคำว่า "DELETE"
- ใช้ `npm start` และ `npm stop` สำหรับการใช้งานปกติ
- Tunnels จะรันใน Docker containers
- ใช้ `Ctrl+C` เพื่อออกจากการดู logs
- ถ้ามีปัญหา ให้ลอง restart ด้วย `npm run tunnel:all:restart`

---

## 🎬 Demo Flow

```bash
# ครั้งแรก
npm run login        # Login Cloudflare
npm run setup        # ตั้งค่า tunnel แรก (ตอบคำถาม)
npm run setup        # ตั้งค่า tunnel ที่สอง (ตอบคำถาม)
npm start           # เริ่มใช้งาน!

# ใช้งานประจำ
npm start           # เริ่ม
npm run status      # เช็ค
npm stop            # หยุด

# จัดการ
npm run delete      # ลบ tunnel ที่ไม่ใช้
```

เท่านี้ก็พร้อมใช้งาน! 🎉

