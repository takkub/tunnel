require('dotenv').config();
const https = require('https');

/**
 * ลบ DNS Record ผ่าน Cloudflare API
 * @param {string} zoneId - Zone ID ของ domain
 * @param {string} recordId - Record ID ที่ต้องการลบ
 * @param {string} apiToken - Cloudflare API Token
 * @returns {Promise<boolean>}
 */
async function deleteDnsRecord(zoneId, recordId, apiToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/zones/${zoneId}/dns_records/${recordId}`,
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.success) {
            resolve(true);
          } else {
            console.error('API Error:', response.errors);
            resolve(false);
          }
        } catch (e) {
          console.error('Parse Error:', e.message);
          resolve(false);
        }
      });
    });

    req.on('error', (e) => {
      console.error('Request Error:', e.message);
      resolve(false);
    });

    req.end();
  });
}

/**
 * ดึงรายการ DNS Records ทั้งหมด
 * @param {string} zoneId - Zone ID ของ domain
 * @param {string} apiToken - Cloudflare API Token
 * @returns {Promise<Array>}
 */
async function listDnsRecords(zoneId, apiToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/zones/${zoneId}/dns_records?per_page=100`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.success) {
            resolve(response.result || []);
          } else {
            console.error('API Error:', response.errors);
            resolve([]);
          }
        } catch (e) {
          console.error('Parse Error:', e.message);
          resolve([]);
        }
      });
    });

    req.on('error', (e) => {
      console.error('Request Error:', e.message);
      resolve([]);
    });

    req.end();
  });
}

/**
 * หา CNAME records ที่เกี่ยวข้องกับ tunnel
 * @param {string} zoneId - Zone ID
 * @param {string} apiToken - API Token
 * @param {string} tunnelId - Tunnel ID (optional)
 * @param {string} domain - Domain name (optional)
 * @returns {Promise<Array>}
 */
async function findTunnelCnameRecords(zoneId, apiToken, tunnelId = null, domain = null) {
  const records = await listDnsRecords(zoneId, apiToken);

  return records.filter(record => {
    // CNAME records ที่ชี้ไปที่ cfargotunnel.com
    if (record.type !== 'CNAME') return false;
    if (!record.content.includes('cfargotunnel.com')) return false;

    // ถ้าระบุ tunnelId ให้เช็คว่าตรงกันหรือไม่
    if (tunnelId && !record.content.includes(tunnelId)) return false;

    // ถ้าระบุ domain ให้เช็คว่าตรงกันหรือไม่
    if (domain && record.name !== domain) return false;

    return true;
  });
}

/**
 * ลบ CNAME records ที่เกี่ยวข้องกับ tunnel
 * @param {string} tunnelId - Tunnel ID (optional)
 * @param {string} domain - Domain name (optional)
 * @returns {Promise<{success: boolean, deleted: number, records: Array}>}
 */
async function deleteTunnelCnames(tunnelId = null, domain = null) {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.ZONE_ID;

  if (!apiToken || !zoneId) {
    console.error('❌ ไม่พบ CLOUDFLARE_API_TOKEN หรือ ZONE_ID ใน .env file');
    return { success: false, deleted: 0, records: [] };
  }

  // หา CNAME records
  const records = await findTunnelCnameRecords(zoneId, apiToken, tunnelId, domain);

  if (records.length === 0) {
    return { success: true, deleted: 0, records: [] };
  }

  // ลบ records
  const deletedRecords = [];
  for (const record of records) {
    const deleted = await deleteDnsRecord(zoneId, record.id, apiToken);
    if (deleted) {
      deletedRecords.push(record);
    }
  }

  return {
    success: deletedRecords.length > 0,
    deleted: deletedRecords.length,
    records: deletedRecords
  };
}

module.exports = {
  deleteDnsRecord,
  listDnsRecords,
  findTunnelCnameRecords,
  deleteTunnelCnames
};

