const http = require('http');
const path = require('path');
const fs = require('fs');

// 酷狗 API 服务地址
const KUGOU_API_BASE = process.env.KUGOU_API_BASE || 'http://localhost:3002';

// 酷狗 cookie 文件
const KG_COOKIE_FILE = path.join(__dirname, '.kg-cookie.json');

let _kugouCookies = {};

function loadKugouCookies() {
  try {
    const data = JSON.parse(fs.readFileSync(KG_COOKIE_FILE, 'utf8'));
    _kugouCookies = data.cookies || {};
  } catch {
    _kugouCookies = {};
  }
}

function saveKugouCookies() {
  fs.writeFileSync(
    KG_COOKIE_FILE,
    JSON.stringify({ cookies: _kugouCookies, time: Date.now() }, null, 2),
  );
}

function getKugouCookieString() {
  return Object.entries(_kugouCookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

// 注册设备获取 dfid
async function ensureDfid() {
  if (_kugouCookies.dfid) return _kugouCookies.dfid;
  try {
    const res = await _rawRequest('/register/dev', {});
    if (res?.data?.dfid) {
      _kugouCookies.dfid = res.data.dfid;
      saveKugouCookies();
      console.log('[IvyM] KuGou dfid obtained:', res.data.dfid);
      return res.data.dfid;
    }
  } catch (e) {
    console.error('[IvyM] KuGou register_dev failed:', e.message);
  }
  return null;
}

// 原始请求函数（不带 cookie）
function _rawRequest(urlPath, params = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${KUGOU_API_BASE}${urlPath}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v != null) url.searchParams.set(k, String(v));
    });
    const req = http.get(url.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// 通用请求函数（带 cookie）
function kugouRequest(urlPath, params = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${KUGOU_API_BASE}${urlPath}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v != null) url.searchParams.set(k, String(v));
    });
    const req = http.get(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': getKugouCookieString(),
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// 初始化
loadKugouCookies();
ensureDfid();

// 搜索歌曲
async function kugouSearch(keyword, limit = 30, page = 1) {
  const res = await kugouRequest('/search', {
    keywords: keyword,
    pagesize: limit,
    page,
    type: 'song',
  });
  if (!res?.data?.lists?.length) return { code: 0, data: [], total: res.data?.total || 0 };
  const songs = res.data.lists.map(s => ({
    id: s.Audioid || s.MixSongID || s.Scid,
    hash: s.FileHash,
    name: s.OriSongName || s.FileName,
    artists: s.SingerName || s.Singers?.map(a => a.name).join(', ') || '',
    album: s.AlbumName || '',
    duration: s.Duration || 0,
    platform: 'kugou',
    cover: s.Image ? s.Image.replace('{size}', '300') : '',
    badge: { vip: s.PayType > 0 || s.FailProcess > 0 },
    // 酷狗：默认允许试听
    availability: { trial: true, full: s.PayType === 0 && s.FailProcess === 0 },
  }));
  return { code: 200, data: songs, total: res.data.total || songs.length };
}

// 获取歌曲播放 URL
async function kugouSongUrl(hash, quality = '128') {
  const res = await kugouRequest('/song_url', {
    hash: hash,
    quality: quality,
  });
  if (!res?.data?.url) {
    return { code: -1, data: null, msg: '获取播放链接失败' };
  }
  // 酷狗返回完整URL，非会员也能播放
  return { code: 200, data: { url: res.data.url, playMode: 'full', trialDuration: null } };
}

// 获取用户信息
async function kugouUserInfo() {
  const cookie = getKugouCookieString();
  if (!cookie) return null;
  const res = await kugouRequest('/user/detail', {});
  if (!res?.data) return null;
  const info = res.data;
  return {
    platform: 'kugou',
    nickname: info.nickname || info.username || '',
    avatar: info.avatar || info.headpic || '',
    userId: String(info.userid || info.uid || ''),
    vip: info.vip_type > 0,
    vipName: info.vip_type > 0 ? 'VIP会员' : '',
  };
}

// 二维码登录 - 获取二维码
async function kugouQrLogin() {
  const res = await kugouRequest('/login_qr_key', {});
  if (!res?.data?.qrcode) return { code: -1, msg: '获取二维码失败' };
  return { code: 200, data: { qrimg: res.data.qrcode, sigx: res.data.sigx || '' } };
}

// 二维码登录 - 检查状态
async function kugouQrCheck(sigx) {
  const res = await kugouRequest('/login_qr_check', { sigx });
  return { code: res?.errcode || res?.status, msg: res?.msg || '', cookie: res?.cookie || '', userid: res?.userid || 0 };
}

module.exports = {
  kugouSearch,
  kugouSongUrl,
  kugouUserInfo,
  kugouQrLogin,
  kugouQrCheck,
  saveKugouCookies,
  getKugouCookieString,
};
