# 📦 Installation Guide

## ขั้นตอนที่ 1: ตรวจสอบความพร้อม

```bash
npm run check
```

คำสั่งนี้จะตรวจสอบว่าคุณติดตั้ง:
- ✅ Cloudflared
- ✅ Docker
- ✅ Docker Compose

---

## ขั้นตอนที่ 2: ติดตั้ง Cloudflared

### Windows

**วิธีที่ 1: ใช้ winget (แนะนำ)** ⭐
```bash
winget install Cloudflare.cloudflared
```

**วิธีที่ 2: ดาวน์โหลดโดยตรง**
1. ไปที่ https://github.com/cloudflare/cloudflared/releases
2. ดาวน์โหลดไฟล์ `cloudflared-windows-amd64.exe`
3. เปลี่ยนชื่อเป็น `cloudflared.exe`
4. ย้ายไปที่ `C:\Windows\System32\` หรือเพิ่มเข้า PATH

**วิธีที่ 3: ใช้ Chocolatey**
```bash
choco install cloudflared
```

### ตรวจสอบการติดตั้ง
```bash
cloudflared --version
```

**⚠️ หมายเหตุ:** หลังติดตั้งเสร็จ ให้ **ปิดแล้วเปิด terminal ใหม่**

---

## ขั้นตอนที่ 3: ติดตั้ง Docker Desktop

### Windows

1. ดาวน์โหลด Docker Desktop จาก:
   https://www.docker.com/products/docker-desktop/

2. ติดตั้งและเปิด Docker Desktop

3. ตรวจสอบการติดตั้ง:
   ```bash
   docker --version
   docker-compose --version
   ```

---

## ขั้นตอนที่ 4: ตรวจสอบอีกครั้ง

```bash
npm run check
```

ถ้าทุกอย่างพร้อม คุณจะเห็น:
```
✅ Cloudflared is installed
✅ Docker is installed
✅ Docker Compose is installed

✅ All requirements are met! You can now run:
  npm run login    # Login to Cloudflare
  npm run setup    # Create a new tunnel
  npm start        # Start tunnels
```

---

## ขั้นตอนที่ 5: เริ่มใช้งาน

```bash
npm run login    # Login Cloudflare
npm run setup    # สร้าง tunnel แรก
npm start        # เริ่มใช้งาน!
```

---

## 🔧 Troubleshooting

### ปัญหา: 'cloudflared' is not recognized

**วิธีแก้:**
1. ปิด terminal ปัจจุบัน
2. เปิด terminal ใหม่
3. ลองรันอีกครั้ง

ถ้ายังไม่ได้:
1. ตรวจสอบว่าติดตั้ง cloudflared แล้ว
2. ตรวจสอบ PATH environment variable
3. รัน `npm run check` เพื่อดูคำแนะนำ

### ปัญหา: Docker is not running

**วิธีแก้:**
1. เปิด Docker Desktop
2. รอให้ Docker เริ่มทำงาน (ดูที่ system tray)
3. ลองรันอีกครั้ง

---

## 📚 คู่มือเพิ่มเติม

- [Cloudflared Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/)
- [Docker Desktop Documentation](https://docs.docker.com/desktop/install/windows-install/)
- [QUICK-START.md](QUICK-START.md) - คู่มือเริ่มต้นอย่างรวดเร็ว
- [README.md](README.md) - คู่มือใช้งานแบบเต็ม

