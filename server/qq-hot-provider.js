/**
 * ★ QQ 音乐热搜 Provider
 *
 * 架构（不影响外部 /api/qq/search/hot 契约）：
 *   1. 5 分钟内存缓存 —— hits 直接返回,避免频繁请求
 *   2. 优先尝试“新版 QQ 音乐接口”（musicu.fcg hotkey H5）
 *       - 当前 Node.js 侧因 g_tk2 签名限制大概率失败,但一旦 cookie/签名刷新后生效可自动升级
 *   3. 失败自动 fallback 到官方 gethotkey.fcg（已验证可用）
 *   4. 输出统一为 string[]（排行榜热搜词条, 最多 9 条）
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

// QQ cookie 文件（登录后保存的真实 cookie, 让 musicu 接口尽可能命中）
const QQ_COOKIE_FILE = path.join(__dirname, '.qq-cookie.json');

let _cache = { items: [], ts: 0 };

function getQQCookieString() {
  try {
    const raw = JSON.parse(fs.readFileSync(QQ_COOKIE_FILE, 'utf8'));
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw.cookie === 'string') return raw.cookie;
    if (raw && typeof raw.cookie === 'object') {
      return Object.entries(raw.cookie).map(([k, v]) => `${k}=${v}`).join('; ');
    }
  } catch { /* ignore */ }
  return '';
}

function httpsPostJson(hostname, reqPath, payload, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    const req = https.request(
      { hostname, path: reqPath, method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body.length,
          'Referer': 'https://y.qq.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...extraHeaders,
        },
      },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
      }
    );
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('hot-provider timeout')));
    req.write(body);
    req.end();
  });
}

function httpsGet(urlStr, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
        headers: {
          'Referer': 'https://y.qq.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ...extraHeaders,
        },
      },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
      }
    );
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('hot-provider timeout')));
    req.end();
  });
}

/** 策略1：新版 QQ musicu.fcg hotkey H5 接口（需浏览器动态签名） */
async function tryMusicuHot() {
  const cookieStr = getQQCookieString();
  const headers = cookieStr ? { 'Cookie': cookieStr } : {};
  const resp = await httpsPostJson(
    'u.y.qq.com',
    '/cgi-bin/musicu.fcg',
    { comm: { ct: 24, cv: 0, uin: 0 },
      hotkey: { module: 'music.musicasset.HotkeyService', method: 'get_hotkey_H5',
                param: { uin: 0, sortId: 5, Sin: 0, Ein: 9 } } },
    headers
  );
  const hk = resp && resp.hotkey;
  if (!hk || hk.code !== 0 || !Array.isArray(hk.data)) return null;
  return hk.data.map(it => (typeof it === 'string' ? it : (it.k || it.keyword || ''))).filter(Boolean);
}

/**
 * ★ 新增策略1.5：jsososo/QQMusicApi 本地服务 /search/hot
 *    这个包底层走的是 QQ 客户端实际接口（经逆向），比 gethotkey.fcg 更接近客户端热搜
 *    成功 -> 直接返回字符串数组；失败 -> 继续 fallback
 */
async function tryQQMusicApiHot() {
  const url = 'http://localhost:3200/search/hot';
  if (typeof globalThis.fetch !== 'function') return null; // Node <18 不支持
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  let resp;
  try {
    resp = await globalThis.fetch(url, { signal: ac.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) return null;
  const json = await resp.json().catch(() => null);
  // QQMusicApi 返回格式：{ result: 100, data: [{k, n}, ...] }
  const list = resp && resp.data;
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const it of list) {
    if (out.length >= 9) break;
    const k = (it && (it.k || it.keyword || it.name) || '').trim();
    if (k) { out.push(k); }
  }
  return out;
}

/** 策略2 (fallback)：官方 gethotkey.fcg（稳定可用, 但为搜索热词而非完整榜单结构） */
async function tryGetHotKey() {
  const url = 'https://c.y.qq.com/splcloud/fcgi-bin/gethotkey.fcg?format=json&inCharset=utf-8&outCharset=utf-8&platform=yqq&new_format=1';
  const resp = await httpsGet(url);
  const list = resp && resp.data && resp.data.hotkey;
  if (!Array.isArray(list)) return [];
  return list.map(it => (it.k || '').trim()).filter(Boolean).slice(0, 9);
}

async function fetchQQHotNoCache() {
  // 优先本地 QQMusicApi 服务
  try {
    const v = await tryQQMusicApiHot();
    if (v && v.length > 0) return v;
  } catch { /* fall through */ }

  // 备选: musicu 接口（多数环境会失败）
  try {
    const v1 = await tryMusicuHot();
    if (v1 && v1.length > 0) return v1.slice(0, 9);
  } catch { /* fall through */ }

  // 最终 fallback: gethotkey
  try {
    const v2 = await tryGetHotKey();
    if (v2 && v2.length > 0) return v2;
  } catch { /* fall through */ }

  return [];
}

/** 公开入口：5 分钟缓存 + 双层 fallback, 返回 string[] */
async function getQQHotSearch() {
  const now = Date.now();
  if (_cache.items.length > 0 && (now - _cache.ts) < CACHE_TTL_MS) {
    return _cache.items;
  }
  const fresh = await fetchQQHotNoCache();
  if (fresh.length > 0) {
    _cache = { items: fresh, ts: now };
    return fresh;
  }
  // 连 fallback 都没过时：保留上一次缓存（即便过期）, 避免 UI 突变成空白
  return _cache.items;
}

/** 强制刷新缓存（调试用） */
function invalidateHotCache() { _cache = { items: [], ts: 0 }; }

module.exports = { getQQHotSearch, invalidateHotCache, _internal: { tryQQMusicApiHot, tryMusicuHot, tryGetHotKey, fetchQQHotNoCache } };
