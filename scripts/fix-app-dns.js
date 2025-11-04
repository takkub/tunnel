const { execSync } = require('child_process');

console.log('\n🔧 แก้ไข DNS สำหรับ app.sabuytube.xyz\n');

const tunnelId = '0dc8bebd-867e-4527-b691-4b8eb1afcc4a';
const domain = 'app.sabuytube.xyz';

console.log('Tunnel ID ที่ใช้งานอยู่:', tunnelId);
console.log('Domain:', domain);
console.log('');

// ลบ DNS route เก่า (ถ้ามี)
console.log('[1/2] ลบ DNS route เก่า...');
try {
  // ลองลบจาก tunnel เก่า
  const oldTunnelId = '3dcbae42-8339-4c53-a7aa-b8b13519b15d';
  execSync(`cloudflared tunnel route dns delete ${oldTunnelId} ${domain}`, { stdio: 'pipe' });
  console.log('✓ ลบ DNS route เก่า');
} catch (e) {
  console.log('⊘ ไม่มี DNS route เก่า หรือลบไม่ได้');
}

// ลบจาก Cloudflare Dashboard ต้องทำด้วยตนเอง
console.log('\n💡 คุณต้องลบ CNAME record ด้วยตนเองก่อน:');
console.log('   1. เข้า https://dash.cloudflare.com/');
console.log('   2. เลือก domain: sabuytube.xyz');
console.log('   3. ไปที่: DNS → Records');
console.log('   4. หา record: app.sabuytube.xyz');
console.log('   5. คลิก Edit → Delete');
console.log('');
console.log('หลังจากลบแล้ว รันคำสั่งนี้:');
console.log(`   cloudflared tunnel route dns ${tunnelId} ${domain}`);
console.log('');

// สร้าง DNS route ใหม่
console.log('[2/2] สร้าง DNS route ใหม่...');
try {
  execSync(`cloudflared tunnel route dns ${tunnelId} ${domain}`, { stdio: 'inherit' });
  console.log('\n✓ สร้าง DNS route สำเร็จ!');
  console.log(`   ${domain} → Tunnel ID: ${tunnelId}`);
} catch (e) {
  console.log('\n⚠️  ไม่สามารถสร้าง DNS route อัตโนมัติ');
  console.log('กรุณาลบ CNAME เก่าก่อน แล้วรันคำสั่งนี้อีกครั้ง');
}

console.log('');

