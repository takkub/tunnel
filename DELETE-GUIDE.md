# คู่มือการลบ Tunnel

## วิธีใช้งาน

### ลบ Tunnel แบบระบุชื่อ

```bash
npm run delete:tak      # ลบ tak tunnel
npm run delete:app      # ลบ app tunnel
npm run delete:office   # ลบ office tunnel
npm run delete:home     # ลบ home tunnel
```

### ลบ Tunnel แบบเลือกเอง

```bash
npm run delete
```
จากนั้นพิมพ์ชื่อ tunnel ที่ต้องการลบ

## คุณสมบัติใหม่ ⭐

สคริปต์จะ**ถามก่อน**ว่าคุณต้องการลบอะไรบ้าง:

1. **Delete DNS routes?** - ลบ DNS records บน Cloudflare (y/n)
2. **Delete tunnel from Cloudflare?** - ลบ tunnel บน Cloudflare (y/n)
3. **Delete configuration folder?** - ลบโฟลเดอร์ config (รวม cert.pem) (y/n)
4. **Delete docker-compose file?** - ลบ docker-compose.yml (y/n)

## ตัวอย่างการใช้งาน

### กรณีที่ 1: ต้องการลบเฉพาะ DNS routes แต่เก็บ tunnel ไว้

```
Delete DNS routes? (y/n): y
Delete tunnel from Cloudflare? (y/n): n
Delete configuration folder? (y/n): n
Delete docker-compose file? (y/n): n
```

**ผลลัพธ์:** ลบเฉพาะ DNS records, เก็บ tunnel และ config ไว้ใช้ต่อ

### กรณีที่ 2: ต้องการลบ tunnel แต่เก็บ cert.pem และ config ไว้

```
Delete DNS routes? (y/n): y
Delete tunnel from Cloudflare? (y/n): y
Delete configuration folder? (y/n): n
Delete docker-compose file? (y/n): n
```

**ผลลัพธ์:** ลบ tunnel และ DNS records, แต่เก็บ cert.pem และ config.yml ไว้สร้าง tunnel ใหม่ได้

### กรณีที่ 3: ต้องการลบทั้งหมด

```
Delete DNS routes? (y/n): y
Delete tunnel from Cloudflare? (y/n): y
Delete configuration folder? (y/n): y
Delete docker-compose file? (y/n): y
```

**ผลลัพธ์:** ลบทุกอย่างสะอาด

### กรณีที่ 4: ต้องการหยุด Docker แต่เก็บทุกอย่างไว้

```
Delete DNS routes? (y/n): n
Delete tunnel from Cloudflare? (y/n): n
Delete configuration folder? (y/n): n
Delete docker-compose file? (y/n): n
```

**ผลลัพธ์:** หยุด Docker container เท่านั้น, เก็บทุกอย่างไว้

## ข้อควรระวัง ⚠️

- **cert.pem** อยู่ใน configuration folder - ถ้าลบ folder จะลบ cert ด้วย
- หากต้องการใช้ tunnel ชื่อเดิมอีกครั้ง ควรเก็บ **cert.pem** ไว้
- DNS routes สามารถสร้างใหม่ได้ง่าย แต่ **tunnel ID** จะเปลี่ยนถ้าลบ tunnel
- ก่อนลบควรหยุด Docker container ก่อน (สคริปต์จะทำให้อัตโนมัติ)

## ทำไม CNAME ซ้ำกัน?

หากสร้าง DNS record ใหม่แล้วได้ค่าเดียวกับของเก่า อาจเป็นเพราะ:

1. **ชื่อซ้ำ** - สร้างชื่อ (name) เหมือนกับระเบียนเดิม → Cloudflare อัปเดตแทนการสร้างใหม่
2. **Proxied (Orange Cloud)** - Cloudflare ซ่อนค่า content จริงและแสดง IP ของ Cloudflare
3. **DNS Cache** - เครื่องหรือ ISP cache DNS ยังไม่หมดอายุ
4. **CNAME Flattening** - ที่ apex domain (root) Cloudflare แปลง CNAME เป็น A record

### วิธีแก้:

```bash
# ล้าง DNS cache บน Windows
ipconfig /flushdns
```

- ตรวจสอบใน Cloudflare Dashboard → DNS Records ว่าชื่อต่างหรือไม่
- ถ้าต้องการสร้างระเบียนแยก ใช้ชื่อย่อย (subdomain) ใหม่
- ปิด Proxy (เปลี่ยนจาก Orange Cloud → Gray Cloud) เพื่อเห็นค่า target จริง

## เกี่ยวกับ Cloudflared

หากพบข้อความ:
```
'cloudflared' is not recognized as an internal or external command
```

สคริปต์จะใช้ Docker แทนโดยอัตโนมัติ ไม่ต้องกังวล

แต่หากต้องการติดตั้ง cloudflared:
```bash
winget install Cloudflare.cloudflared
```

จากนั้นปิด-เปิด Terminal ใหม่

