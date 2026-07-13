const http = require('http');
const path = require('path');
const fs = require('fs');

// 酷狗 API 服务地址（本地 kugou-api 子项目）
// 注意：酷狗默认端口 3000 常被占用，推荐用 3200：KUGOU_API_BASE=http://localhost:3200 npm start
const KUGOU_API_BASE = process.env.KUGOU_API_BASE || 'http://localhost:3201';

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

/**
 * 酷狗登录态完整组装 — 会员登录时由 check 返回 token/userid/cookies，
 * 调用此函数组装成统一 session，供后续 API 请求使用。
 *
 * authContext: { token, userid, cookies: [{name,value}...] }
 */
function createKugouSession(authContext) {
  const { token, userid, cookies } = authContext;
  if (!token || !userid) return null;

  // 注入登录凭证到 _kugouCookies
  _kugouCookies.token = token;
  _kugouCookies.userid = String(userid);
  _kugouCookies.dfid = _kugouCookies.dfid || `kg_${Date.now()}`;

  // 刷新 cookie 列表
  if (Array.isArray(cookies)) {
    for (const c of cookies) {
      if (c?.name) _kugouCookies[c.name] = c.value;
    }
  }

  saveKugouCookies();
  console.log('[KUGOU_SESSION_CREATED]', JSON.stringify({ userid, token: token?.slice(0, 20), cookieCount: Object.keys(_kugouCookies).length }));

  // 同步写 session 文件（供 server 重启恢复）
  const sessionFile = path.join(__dirname, '.kg-session.json');
  fs.writeFileSync(sessionFile, JSON.stringify({
    token, userid, userId: userid,
    cookies: { token, userid, ...Object.fromEntries(Object.entries(_kugouCookies)) },
    time: Date.now(),
  }, null, 2));

  return { token, userId: userid, cookies: { ..._kugouCookies } };
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
    // 所有酷狗接口都需要 dfid 参与签名，自动注入当前 dfid
    const finalParams = { ...params };
    if (finalParams.dfid == null && _kugouCookies.dfid) {
      finalParams.dfid = _kugouCookies.dfid;
    }
    Object.entries(finalParams).forEach(([k, v]) => {
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

// ======================== 搜索 ========================

async function kugouSearch(keyword, limit = 30, page = 1) {
  const res = await kugouRequest('/search', {
    keywords: keyword,
    pagesize: limit,
    page,
    type: 'song',
  });
  if (!res?.data?.lists?.length) return { code: 0, data: [], total: res.data?.total || 0 };
  const songs = res.data.lists.map(s => ({
    id: String(s.Audioid || s.MixSongID || s.Scid),
    hash: s.FileHash,
    name: s.OriSongName || s.FileName,
    artists: s.SingerName || s.Singers?.map(a => a.name).join(', ') || '',
    album: s.AlbumName || '',
    duration: s.Duration ? s.Duration * 1000 : 0,
    platform: 'kugou',
    cover: s.Image ? s.Image.replace('{size}', '300') : '',
    badge: { vip: s.PayType > 0 || s.FailProcess > 0 },
    // 酷狗默认允许试听，完整播放需要VIP
    availability: { trial: true, full: s.PayType === 0 && s.FailProcess === 0 },
  }));
  return { code: 200, data: songs, total: res.data.total || songs.length };
}

// ======================== 播放 URL ========================

async function kugouSongUrl(hash, quality = '128') {
  // kugou-api 路由规则：文件 song_url.js 的路径会转成 /song/url
  const res = await kugouRequest('/song/url', {
    hash: (hash || '').toLowerCase(),
    quality,
    cmd: 26,
    pid: 2,
    behavior: 'play',
    version: 11430,
  });
  const urls = res?.data?.url || res?.url;
  const playUrl = Array.isArray(urls) ? urls[0] : (res?.data?.play_url || res?.play_url || '');
  if (!playUrl) {
    if (res?.fail_process?.length > 0) {
      return { code: 403, reason: 'vip_required', data: null, msg: '该歌曲需要VIP或不可播放' };
    }
    return { code: -1, data: null, msg: '获取播放链接失败' };
  }
  return { code: 200, data: { url: playUrl, playMode: 'full', trialDuration: null } };
}

// ======================== 会员解析 ========================

/**
 * 酷狗会员身份解析
 * 返回标准 membership 结构 { status, provider, level, name, icon }
 * 酷狗会员类型参考 API 返回字段：vip_type / svip_type 等
 * 暂时使用本地 SVG 资源作为 icon
 */
function parseKugouMembership(userInfo) {
  if (!userInfo) {
    return { status: 'unknown', provider: 'kugou', level: null, name: null, icon: null };
  }
  // 酷狗会员类型判断：vip_type=1 为 VIP，2 为 SVIP（根据 KuGouMusicApi 返回字段调整）
  const vipType = userInfo.vip_type || userInfo.viptype || 0;
  if (vipType >= 2) {
    return { status: 'vip', provider: 'kugou', level: 'svip', name: 'SVIP', icon: '/icons/vip-kugou.svg' };
  }
  if (vipType >= 1) {
    return { status: 'vip', provider: 'kugou', level: 'vip', name: 'VIP', icon: '/icons/vip-kugou.svg' };
  }
  return { status: 'normal', provider: 'kugou', level: null, name: null, icon: null };
}

// ======================== 用户信息 ========================

async function kugouUserInfo() {
  const cookie = getKugouCookieString();
  if (!cookie) return null;
  const res = await kugouRequest('/user/info', {});
  if (!res?.data) return null;
  const info = res.data;
  const membership = parseKugouMembership(info);
  return {
    platform: 'kugou',
    nickname: info.nickname || info.username || '',
    avatar: info.avatar || info.headpic || '',
    userId: String(info.userid || info.uid || ''),
    vip: membership.status === 'vip',
    vipName: membership.name || '',
    membership,
  };
}

// ======================== 二维码登录 ========================
// MakcRe/KugouMusicApi 仅提供 v1 路由 /login/qr/key，返回 {qrcode, qrcode_img}
// 注意：/v2/qrcode 是酷狗官方网页端接口，MakcRe 未实现

async function kugouQrLogin() {
  const res = await kugouRequest('/login/qr/key', {});
  const qrImg = res?.data?.qrcode_img || res?.qrcode_img || '';
  const qrToken = res?.data?.qrcode || res?.qrcode || '';
  console.log('[KUGOU_QR_KEY]', JSON.stringify({ hasImg: !!qrImg, tokenPrefix: qrToken.slice(0, 20) }));
  if (!qrImg && !qrToken) return { code: -1, msg: '获取二维码失败', debug: JSON.stringify(res).slice(0, 200) };
  return { code: 200, data: { qrimg: qrImg, sigx: qrToken } };
}

async function kugouQrCheck(sigx) {
  const res = await kugouRequest('/login/qr/check', { key: sigx });
  // MakcRe 返回格式：{errcode, msg, cookie, userid}
  const status = res?.errcode;
  const cookie = Array.isArray(res?.cookie) ? res.cookie : [];
  console.log('[KUGOU_QR_CHECK]', JSON.stringify({ status, hasCookie: cookie.length > 0 }));
  return {
    code: 0,
    status,
    msg: res?.msg || '',
    cookie,
    userid: res?.userid || 0,
    nickname: res?.nickname || '',
    avatar: res?.avatar || '',
  };
}

module.exports = {
  kugouSearch,
  kugouSongUrl,
  kugouUserInfo,
  kugouQrLogin,
  kugouQrCheck,
  saveKugouCookies,
  getKugouCookieString,
  createKugouSession,
  parseKugouMembership,
};
