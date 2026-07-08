const https = require('https');

const BASE = 'https://music.163.com';

function neteaseRequest(api, params = {}) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams(params).toString();
    const url = `${BASE}${api}?${qs}`;
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': BASE,
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { resolve(body); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function neteaseSearch(keyword, limit = 30) {
  const res = await neteaseRequest('/api/search/get', {
    s: keyword,
    type: 1,
    limit,
    offset: 0,
  });
  if (!res.result?.songs) return { code: 0, data: [] };
  const songs = res.result.songs.map(s => ({
    id: s.id,
    name: s.name,
    artists: s.artists?.map(a => a.name).join(', ') || '',
    album: s.album?.name || '',
    duration: s.duration,
    source: 'netease',
    fee: s.fee || 0, // 1=VIP, 0=免费
  }));
  return { code: 200, data: songs, total: res.result.songCount || songs.length };
}

async function neteaseSongUrl(id) {
  const res = await neteaseRequest('/api/song/enhance/player/url', {
    ids: `[${id}]`,
    br: 320000,
  });
  if (!res.data?.[0]?.url) return { code: -1, data: null };
  return { code: 200, data: { url: res.data[0].url, br: res.data[0].br } };
}

async function neteaseLyric(id) {
  const res = await neteaseRequest('/api/song/lyric', {
    id,
    lv: -1,
    tv: -1,
  });
  return { code: 200, data: res.lrc?.lyric || '' };
}

async function neteaseQrLogin() {
  const keyRes = await neteaseRequest('/api/login/qrcode/unikey', { timer: Date.now() });
  if (!keyRes.unikey) return { code: -1, msg: '获取 key 失败' };
  const qrRes = await neteaseRequest('/api/login/qrcode/create', { key: keyRes.unikey, qrimg: 1, timer: Date.now() });
  if (!qrRes.qrimg) return { code: -1, msg: '获取二维码失败' };
  return { code: 200, data: { qrimg: qrRes.qrimg, unikey: keyRes.unikey } };
}

async function neteaseQrCheck(unikey) {
  const res = await neteaseRequest('/api/login/qrcode/client/login', { key: unikey, timer: Date.now() });
  return { code: res.code, msg: res.message || '', cookie: res.cookie || '' };
}

async function neteaseUserInfo(cookie) {
  return new Promise((resolve, reject) => {
    const req = https.get('https://music.163.com/api/nuser/account/get', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://music.163.com',
        'Cookie': cookie,
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { resolve({}); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

module.exports = { neteaseSearch, neteaseSongUrl, neteaseLyric, neteaseQrLogin, neteaseQrCheck, neteaseUserInfo };
