const { execSync } = require('child_process');

console.log('\n╔════════════════════════════════════════╗');
console.log('║   ตรวจสอบ DNS Configuration          ║');
console.log('╚════════════════════════════════════════╝\n');

const tunnelName = process.argv[2] || 'app';

try {
  // ดู tunnel info
  console.log(`🔍 ตรวจสอบ tunnel: ${tunnelName}-tunnel\n`);

  const list = execSync('cloudflared tunnel list', { encoding: 'utf8' });
  const lines = list.split('\n');

  console.log('📋 Tunnels ที่มีอยู่:\n');
  console.log(list);

  // หา tunnel ID
  let tunnelId = null;
  for (const line of lines) {
    if (line.includes(tunnelName)) {
      const match = line.match(/([a-f0-9-]{36})/);
      if (match) {
        tunnelId = match[1];
        break;
      }
    }
  }

  if (tunnelId) {
    console.log('\n' + '='.repeat(50));
    console.log('✅ พบ Tunnel:');
    console.log('='.repeat(50));
    console.log(`Name:      ${tunnelName}-tunnel`);
    console.log(`ID:        ${tunnelId}`);
    console.log(`CNAME:     ${tunnelId}.cfargotunnel.com`);
    console.log('='.repeat(50));

    console.log('\n💡 คำแนะนำ:');
    console.log('   1. เข้า https://dash.cloudflare.com/');
    console.log('   2. เลือก domain ของคุณ');
    console.log('   3. ไปที่ DNS → Records');
    console.log(`   4. หา record ชื่อ: ${tunnelName}`);
    console.log('   5. Target ควรเป็น:');
    console.log(`      ${tunnelId}.cfargotunnel.com`);
    console.log('');
  } else {
    console.log(`\n❌ ไม่พบ tunnel: ${tunnelName}-tunnel`);
    console.log('\nTunnels ที่มี:');
    lines.forEach(line => {
      const match = line.match(/\s+(\S+-tunnel)\s+/);
      if (match) {
        console.log(`  - ${match[1]}`);
      }
    });
  }

} catch (error) {
  console.error('\n❌ Error:', error.message);
  console.log('\n💡 ตรวจสอบว่า:');
  console.log('   - cloudflared ติดตั้งแล้ว');
  console.log('   - เคย login แล้ว (npm run login)');
}

console.log('');

