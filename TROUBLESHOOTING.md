# วิธีลบ Tunnel ที่ Cloudflare ด้วยตนเอง

## ปัญหาที่พบบ่อย

### ❌ Error: "tunnel has active connections"
**สาเหตุ:** Tunnel ยังมี container หรือ process ที่ทำงานอยู่

**วิธีแก้:**
```bash
# 1. หยุด Docker container ก่อน
docker-compose -f docker-compose-cloudflare-tak.yml down

# หรือหยุดทั้งหมด
docker ps | grep cloudflared
docker stop <container-id>

# 2. ตรวจสอบว่าหยุดแล้ว
docker ps | grep cloudflared

# 3. ลบ tunnel อีกครั้ง
npm run delete:tak
```

### ❌ Error: "could not delete tunnel"
**วิธีแก้แบบละเอียด:**

#### วิธีที่ 1: ใช้คำสั่งโดยตรง
```bash
# หา tunnel ID
cloudflared tunnel list

# ลบด้วย ID
cloudflared tunnel delete -f <tunnel-id>

# หรือลบด้วยชื่อ
cloudflared tunnel delete -f tak
```

#### วิธีที่ 2: ลบผ่าน Cloudflare Dashboard
1. เข้า https://dash.cloudflare.com/
2. เลือก Domain ของคุณ
3. ไปที่ **Traffic** → **Cloudflare Tunnel**
4. หา tunnel ที่ต้องการลบ
5. คลิก **...** (three dots) → **Delete**
6. ยืนยันการลบ

#### วิธีที่ 3: ลบ DNS Records ก่อน
```bash
# 1. ลบ DNS records ก่อน
cloudflared tunnel route dns list

# 2. ลบทีละตัว
cloudflared tunnel route dns delete <tunnel-id> <hostname>

# ตัวอย่าง:
cloudflared tunnel route dns delete b8b6a8f8-e2fa-4c9b-9282-398e82b0a214 tak.sabuytube.xyz

# 3. ลบ tunnel
cloudflared tunnel delete -f <tunnel-id>
```

#### วิธีที่ 4: Cleanup ทั้งหมด
```bash
# 1. หยุด Docker containers ทั้งหมด
docker stop $(docker ps -a | grep cloudflared | awk '{print $1}')

# 2. ลบ containers
docker rm $(docker ps -a | grep cloudflared | awk '{print $1}')

# 3. ดู tunnel list
cloudflared tunnel list

# 4. ลบทีละตัว
cloudflared tunnel delete -f <tunnel-name>
```

---

## สคริปต์ช่วยลบ (Quick Fix)

### ลบ tunnel แบบบังคับ
สร้างไฟล์ `scripts/force-delete-tunnel.js`:

```javascript
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  const tunnelName = process.argv[2];
  if (!tunnelName) {
    console.log('Usage: node scripts/force-delete-tunnel.js <tunnel-name>');
    console.log('Example: node scripts/force-delete-tunnel.js tak');
    process.exit(1);
  }

  console.log('Force deleting tunnel:', tunnelName);
  
  // 1. หยุด Docker
  console.log('\n[1/4] Stopping Docker containers...');
  try {
    execSync(`docker-compose -f docker-compose-cloudflare-${tunnelName}.yml down`, { stdio: 'inherit' });
  } catch (e) {
    console.log('No Docker container found or already stopped');
  }

  // 2. หา tunnel ID
  console.log('\n[2/4] Finding tunnel ID...');
  try {
    const list = execSync('cloudflared tunnel list', { encoding: 'utf8' });
    console.log(list);
    
    const lines = list.split('\n');
    let tunnelId = null;
    for (const line of lines) {
      if (line.includes(tunnelName)) {
        const match = line.match(/([a-f0-9-]{36})/);
        if (match) {
          tunnelId = match[1];
          console.log(`Found tunnel ID: ${tunnelId}`);
          break;
        }
      }
    }

    if (!tunnelId) {
      console.log('Could not find tunnel ID, will use name');
      tunnelId = tunnelName;
    }

    // 3. ลบ DNS routes
    console.log('\n[3/4] Deleting DNS routes...');
    try {
      execSync(`cloudflared tunnel route dns delete ${tunnelId}`, { stdio: 'inherit' });
    } catch (e) {
      console.log('No DNS routes or already deleted');
    }

    // 4. ลบ tunnel
    console.log('\n[4/4] Deleting tunnel...');
    try {
      execSync(`cloudflared tunnel delete -f ${tunnelId}`, { stdio: 'inherit' });
      console.log('\n✓ Tunnel deleted successfully!');
    } catch (e) {
      console.log('\n⚠ Could not delete tunnel automatically');
      console.log('\nPlease delete manually from dashboard:');
      console.log('https://dash.cloudflare.com/ → Traffic → Cloudflare Tunnel');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }

  rl.close();
}

main();
```

เพิ่มใน `package.json`:
```json
"force-delete": "node scripts/force-delete-tunnel.js",
"force-delete:tak": "node scripts/force-delete-tunnel.js tak"
```

### ใช้งาน:
```bash
npm run force-delete:tak
```

---

## ตรวจสอบสถานะ

### ดู tunnel ที่มีอยู่
```bash
cloudflared tunnel list
```

### ดู DNS routes
```bash
cloudflared tunnel route dns list
```

### ดู Docker containers
```bash
docker ps -a | grep cloudflared
```

### ดูข้อมูล tunnel
```bash
cloudflared tunnel info <tunnel-name>
```

---

## วิธีป้องกันปัญหา

### ✅ ก่อนลบ tunnel ให้:
1. **หยุด Docker containers ก่อนเสมอ**
   ```bash
   npm run tunnel:tak:down
   # หรือ
   npm stop
   ```

2. **ลบ DNS routes ก่อน**
   ```bash
   npm run delete:tak
   # เลือก: Delete DNS routes? → y
   # เลือก: Delete tunnel from Cloudflare? → y
   ```

3. **ตรวจสอบว่าไม่มี connections**
   ```bash
   cloudflared tunnel info tak
   # ดูที่ CONNECTIONS ควรเป็น 0
   ```

### ✅ ถ้าลบไม่ได้:
1. รอสัก 1-2 นาที (Cloudflare อาจยังไม่อัปเดต)
2. ลองใหม่อีกครั้ง
3. ใช้ Cloudflare Dashboard ลบด้วยตนเอง

---

## คำสั่งลัด (Quick Commands)

```bash
# ลบทุกอย่างของ tak tunnel
docker-compose -f docker-compose-cloudflare-tak.yml down
cloudflared tunnel delete -f tak
rm -rf tunnels/tak
rm docker-compose-cloudflare-tak.yml

# ดู tunnel ทั้งหมด
cloudflared tunnel list

# ลบ tunnel ทั้งหมด (ระวัง!)
cloudflared tunnel list | grep -v "ID" | awk '{print $1}' | xargs -I {} cloudflared tunnel delete -f {}
```

---

## สรุป

หากสคริปต์ `npm run delete:tak` ลบไม่ได้:

1. ✅ หยุด Docker: `npm run tunnel:tak:down`
2. ✅ ลองลบด้วยคำสั่งโดยตรง: `cloudflared tunnel delete -f tak`
3. ✅ ถ้ายังไม่ได้ → ลบผ่าน **Cloudflare Dashboard**
4. ✅ ลบไฟล์เอง: `rm -rf tunnels/tak` และ `rm docker-compose-cloudflare-tak.yml`

**Link Dashboard:** https://dash.cloudflare.com/ → Traffic → Cloudflare Tunnel

