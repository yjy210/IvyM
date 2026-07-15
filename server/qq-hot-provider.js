/**
 * ★ QQ 音乐热搜 Provider — 单策略直连官方热搜接口
 *
 * 接口: https://c.y.qq.com/musichall/fcgi-bin/musichall.fcg
 * 参数: module=Search&method=get_hotkey&format=json
 * Headers: Referer + User-Agent（QQ 会校验）
 *
 * 失败 → 返回 [] 或保留旧缓存, 绝不崩溃
 */

const https = require('https');

const CACHE_TTL_MS = 5 * 60 * 1000;

// 主接口：QQ 音乐热搜词（官网首页搜索框旁展示）
const HOT_URL =
  'https://c.y.qq.com/splcloud/fcgi-bin/gethotkey.fcg' +
  '?format=json&inCharset=utf-8&outCharset=utf-8&platform=yqq&new_format=1';

// 备选接口（主接口失败时尝试）
const BACKUP_URL =
  'https://c.y.qq.com/musichall/fcgi-bin/musichall.fcg' +
  '?module=Search&method=get_hotkey&format=json';

let _cache = { items: [], ts: 0 };

function httpsGet(urlStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: {
          'Referer': 'https://y.qq.com/',
          'Origin': 'https://y.qq.com',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('hot-provider timeout')));
    req.end();
  });
}

function parseResponse(resp) {
  if (!resp || resp.code !== 0) return [];
  const list = resp.data && resp.data.hotkey;
  if (!Array.isArray(list)) return [];
  return list.map(it => (it.k || '').trim()).filter(Boolean).slice(0, 9);
}

async function fetchFromApi() {
  // 主接口
  try {
    const resp = await httpsGet(HOT_URL);
    const items = parseResponse(resp);
    if (items.length > 0) return items;
  } catch { /* fall through */ }

  // 备选 gethotkey.fcg
  try {
    const resp = await httpsGet(BACKUP_URL);
    const items = parseResponse(resp);
    if (items.length > 0) return items;
  } catch { /* fall through */ }

  return [];
}

async function getQQHotSearch() {
  const now = Date.now();
  if (_cache.items.length > 0 && (now - _cache.ts) < CACHE_TTL_MS) {
    return _cache.items;
  }
  try {
    const fresh = await fetchFromApi();
    if (fresh.length > 0) {
      _cache = { items: fresh, ts: now };
      return fresh;
    }
  } catch { /* ignore */ }
  // 所有接口都失败：返回旧缓存（即便过期），绝不返回 undefined 或崩溃
  return _cache.items;
}

module.exports = { getQQHotSearch };
