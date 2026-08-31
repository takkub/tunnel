try { require('dotenv').config(); } catch {}
const https = require('https');
const { getZoneIdForHostname, loadDomains } = require('./domains');
const settingsStore = require('./settings-store');

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
async function listDnsRecords(zoneId, apiToken, params = {}) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({ per_page: '100', ...params }).toString();
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/zones/${zoneId}/dns_records?${qs}`,
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
async function deleteTunnelCnames(tunnelId = null, domain = null, zoneIdOverride = null) {
  const apiToken = settingsStore.getCloudflareToken();
  // resolve zoneId: explicit override > domain lookup > settings.json/.env fallback
  const zoneId = zoneIdOverride || (domain ? getZoneIdForHostname(domain) : null) || settingsStore.getZoneId();

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

/**
 * Low-level Cloudflare API call returning the parsed JSON body (or rejecting
 * on a transport/parse error) — POST/PATCH need a body, unlike
 * deleteDnsRecord/listDnsRecords above.
 */
function cfApiRequest(method, urlPath, apiToken, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const options = {
      hostname: 'api.cloudflare.com',
      path: urlPath,
      method,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error(`Cloudflare API returned invalid JSON: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function formatCfErrors(res) {
  const errs = (res && res.errors) || [];
  if (errs.some(e => e.code === 9109 || /permission/i.test(e.message || ''))) {
    return 'Cloudflare API token is missing the "Zone > DNS > Edit" permission for this zone — check Zone Resources on the token (needs to cover this zone or be set to All zones).';
  }
  if (errs.length) return errs.map(e => e.message).join('; ');
  return 'Unknown Cloudflare API error';
}

/**
 * Create or update a CNAME record so hostname -> <tunnelId>.cfargotunnel.com
 * in the given zone. This is what route-dns.js/setup-tunnel.js use instead of
 * `cloudflared tunnel route dns`, which always targets the zone tied to
 * cert.pem from the last `cloudflared tunnel login` — wrong for any domain
 * added after that login.
 * @param {string} zoneId
 * @param {string} hostname
 * @param {string} tunnelId
 * @param {string} apiToken
 * @param {{overwrite?: boolean}} [options] - overwrite (default true): replace
 *   an existing tunnel CNAME's target; when false, an existing tunnel CNAME
 *   with a different target is reported as a conflict instead.
 * @returns {Promise<{ok: boolean, action?: 'created'|'updated'|'unchanged', error?: string}>}
 */
async function upsertTunnelCname(zoneId, hostname, tunnelId, apiToken, options = {}) {
  const overwrite = options.overwrite !== false;
  const target = `${tunnelId}.cfargotunnel.com`;

  let existing;
  try {
    existing = await listDnsRecords(zoneId, apiToken, { name: hostname });
  } catch (e) {
    return { ok: false, error: `Failed to look up existing DNS records: ${e.message}` };
  }
  const match = existing.find(r => r.name === hostname);

  if (match) {
    if (match.type !== 'CNAME' || !match.content.endsWith('.cfargotunnel.com')) {
      return { ok: false, error: `A ${match.type} record for ${hostname} already exists (content: ${match.content}) — remove it manually first.` };
    }
    if (match.content === target) {
      return { ok: true, action: 'unchanged' };
    }
    if (!overwrite) {
      return { ok: false, error: `CNAME for ${hostname} already points elsewhere (content: ${match.content})` };
    }
    let res;
    try {
      res = await cfApiRequest('PATCH', `/client/v4/zones/${zoneId}/dns_records/${match.id}`, apiToken, { type: 'CNAME', name: hostname, content: target, proxied: true });
    } catch (e) {
      return { ok: false, error: e.message };
    }
    if (!res || !res.success) return { ok: false, error: formatCfErrors(res) };
    return { ok: true, action: 'updated' };
  }

  let res;
  try {
    res = await cfApiRequest('POST', `/client/v4/zones/${zoneId}/dns_records`, apiToken, { type: 'CNAME', name: hostname, content: target, proxied: true });
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (!res || !res.success) return { ok: false, error: formatCfErrors(res) };
  return { ok: true, action: 'created' };
}

module.exports = {
  deleteDnsRecord,
  listDnsRecords,
  findTunnelCnameRecords,
  deleteTunnelCnames,
  upsertTunnelCname,
  cfApiRequest,
  formatCfErrors
};

