const http = require('http');
const path = require('path');
const fs = require('fs');

// 酷狗 API 服务地址（本地 kugou-api 子项目）
// 注意：酷狗默认端口 3000 常被占用，推荐用 3200：KUGOU_API_BASE=http://localhost:3200 npm start
const KUGOU_API_BASE = process.env.KUGOU_API_BASE || 'http://localhost:3201';

// 酷狗 cookie 文件
const KG_COOKIE_FILE = path.join(__dirname, '.kg-cookie.json');
const KUGOO_API_PORT = KUGOO_API_BASE.split(':').pop() || '3201';

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
 * 调用 MakcRe kugo-api（port 3201）封装的 Cool狗接口
 * path: /login/qr/key  或  /login/qr/check
 * params: 要传给 kugo-api 的 query/body
 *
 * 为什么不用直接发 HTTPS 给 Cool 官方：
 * MakcRe kugo-api 已经封装好了加密参数 / 接口签名 / 响应解析，
 * 直接调它等于复用 MakcRe 官方维护的这套登录协议。
 */
async function kugoApiCall(path, params = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`http://localhost:${KUGOO_API_PORT}${path}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v != null) url.searchParams.set(k, String(v));
    });
    console.log('[KUGOO_API_CALL] URL:', url.toString());
    const req = http.get(url.toString(), res => {
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
  return _kugouCookies.dfid || null;
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

/**
 * 调用 MakcRe kugo-api（port 3201）生成二维码。
 * MakcRe 返回结构：{data:{qrcode, qrcode_img}, status:1, error_code:0}
 * 映射到旧的 canonical 输出：{code, qrimg, sigx, dfid}
 */
async function kugouQrLogin() {
  console.log('[KUGOU_QR_KEY_REQ] port=' + KUGOO_API_PORT);
  const res = await kugoApiCall('/login/qr/key', {});
  // [DEBUG] 完整原始返回
  console.log('[KUGOU_QR_KEY_RAW]', JSON.stringify(res));
  const qrToken = res?.data?.qrcode || '';
  const qrImg = res?.data?.qrcode_img || '';
  if (res?.data?.dfid) {
    _kugouCookies.dfid = res.data.dfid;
    saveKugouCookies();
  }
  console.log('[KUGOU_QR_KEY]', JSON.stringify({ hasImg: !!qrImg, qrToken, dfid: _kugouCookies.dfid }));
  if (!qrImg && !qrToken) return { code: -1, msg: '获取二维码失败', debug: JSON.stringify(res).slice(0, 200) };
  // canonical 输出（与旧格式兼容）
  return { code: 200, qrimg: qrImg, sigx: qrToken, dfid: _kugouCookies.dfid };
}

/**
 * 调用 MakcRe kugo-api 检测扫码状态。
 * MakcRe 返回结构：{data:{status, userid, cookie, ...}, status, error_code}
 * status: 0=过期 / 1=等待 / 2=已扫待确认 / 4=授权成功
 * 映射到旧的 canonical 输出：{code, status, cookie[], userid, nickname, avatar}
 */
async function kugouQrCheck(sigx) {
  const dfid = _kugouCookies.dfid;
  console.log('[KUGOU_QR_CHECK_REQ]', JSON.stringify({ sigx, dfid }));
  const res = await kugoApiCall('/login/qr/check', { qrcode: sigx, dfid });
  // [DEBUG] 完整原始返回
  console.log('[KUGOU_QR_CHECK_RAW]', JSON.stringify(res));
  if (res?.data?.dfid) {
    _kugouCookies.dfid = res.data.dfid;
    saveKugouCookies();
  }
  const status = res?.data?.status;
  const cookie = res?.data?.cookie || [];
  const userid = res?.data?.userid || 0;
  const nickname = res?.data?.nickname || '';
  const avatar = res?.data?.avatar || '';
  const token = res?.data?.token || '';
  console.log('[KUGOU_QR_CHECK]', JSON.stringify({ status, hasCookie: cookie.length > 0, userid, token: token?.slice(0, 20) }));
  return {
    code: 0,
    status,
    msg: res?.msg || '',
    cookie,
    userid,
    nickname,
    avatar,
    token,
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
