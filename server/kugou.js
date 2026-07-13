const http = require('http');
const path = require('path');
const fs = require('fs');

// 酷狗 API 服务地址（本地 kugou-api 子项目）
// 注意：酷狗默认端口 3000 常被占用，推荐用 3200：KUGOU_API_BASE=http://localhost:3200 npm start
const KUGOU_API_BASE = process.env.KUGOU_API_BASE || 'http://localhost:3201';

// 酷狗 cookie 文件
const KG_COOKIE_FILE = path.join(__dirname, '.kg-cookie.json');
const KUGOO_API_PORT = KUGOU_API_BASE.split(':').pop() || '3201';

// ★ DEBUG: VIP / 会员字段探测
//   方式: QR status=4 原始响应 + 登录后 60s 内被动扫描所有 CoolGoo 响应 + 主动探测用户接口
const DEBUG_KUGOO = process.env.DEBUG_KUGOO === '1';
let _debugRawQrStatus4 = null;      // status=4 原始响应
let _debugScannerEntries = [];      // 60s 被动扫描窗口内的所有响应
let _debugScannerUntil = 0;         // 扫描窗口截止时间戳
let _debugUserProbes = [];          // 主动探测接口结果

let _kugouCookies = {};

function setDebugRawQrStatus4(data) { if (DEBUG_KUGOO) _debugRawQrStatus4 = data; }
function addDebugUserProbe(entry) { if (DEBUG_KUGOO) _debugUserProbes.push(entry); }
function captureDebugCookies() { if (DEBUG_KUGOO) { globalThis.__kugooCookiesSnap = { ..._kugouCookies }; } }

/** ★ DEBUG: 启动 60 秒被动扫描窗口（登录成功后调用） */
function startDebugScanner() {
  if (!DEBUG_KUGOO) return;
  _debugScannerUntil = Date.now() + 60_000;
  _debugScannerEntries = [];
  console.log('[KUGOO_VIP_PROBE] scanner started (60s)');
}

// ★ DEBUG: VIP 关键词 — 出现这些词时触发完整保存
const VIP_KEYWORDS = /vip|svip|member|privilege|level|identity|rights|权益|身份/;

/** ★ DEBUG: 被动记录响应，VIP 关键词命中时保存完整结构否则只存 key summary */
function _debugMaybeCapture(path, response) {
  if (!DEBUG_KUGOO || Date.now() > _debugScannerUntil) return;
  if (!response || typeof response !== 'object') return;
  const hit = JSON.stringify(response);
  const vipHit = VIP_KEYWORDS.test(hit);
  _debugScannerEntries.push({
    ts: Date.now(),
    url: path,
    vipHit,
    // VIP 命中时保存完整响应，否则只存顶层 key（减小体积）
    keys: vipHit ? null : Object.keys(response).slice(0, 20),
    data: vipHit ? response : null,
  });
}

/**
 * ★ DEBUG: 全链路最终记录 — 在 electron/main.js status=4 直接注入
 *   这里记录的是最终组装好的 account / user 数据（包含所有合并来源）
 */
function addDebugFinalAccountSnapshot(snapshot) {
  if (!DEBUG_KUGOO) return;
  _debugFinalAccounts.push({ ts: Date.now(), ...snapshot });
}
let _debugFinalAccounts = [];

/** ★ DEBUG: 保存所有抓包数据（文件名绑定 userid 避免混） */
function dumpKugouVipProbe(label = 'run') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const uid = (globalThis.__kugooCookiesSnap && globalThis.__kugooCookiesSnap.userid) || _kugouCookies.userid || 'unknown';
  // 文件名含 userid
  const file = path.join(__dirname, `.kugoo-vip-probe-${uid}-${stamp}.json`);
  // 命中 VIP 关键词的响应数量
  const vipHits = _debugScannerEntries.filter(e => e.vipHit).length;
  const data = {
    label,
    time: Date.now(),
    userId: uid,
    cookies: globalThis.__kugooCookiesSnap || { ..._kugouCookies },
    qrStatus4Raw: _debugRawQrStatus4,
    scannerCaptures: _debugScannerEntries,
    scannerVipHits: vipHits,
    userProbes: _debugUserProbes,
    finalAccountSnapshots: _debugFinalAccounts,
  };
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`[KUGOU_VIP_PROBE] dump → ${file} (qr1 + ${_debugScannerEntries.length} passive[${vipHits} vip] + ${_debugUserProbes.length} probes + ${_debugFinalAccounts.length} final)`);
  return file;
}

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
    const urlStr = url.toString();
    const cookieStr = getKugouCookieString();
    const headers = cookieStr ? { 'Cookie': cookieStr } : {};

    const req = http.get(urlStr, { headers }, res => {
      let body = '';
      // ★ 抓 Set-Cookie：酷狗某些接口（如手机登录）把 vip_type/vip_token 放 Set-Cookie 而不是 body
      const setCookieHeader = res.headers['set-cookie'] || [];
      const setCookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
      const vipCookieNames = ['vip_type', 'vip_token', 'userid', 'token', 't1', 'id_type'];
      for (const sc of setCookies) {
        if (!sc) continue;
        const first = sc.split(';')[0]; // name=value
        const eq = first.indexOf('=');
        if (eq < 0) continue;
        const name = first.slice(0, eq).trim();
        const value = first.slice(eq + 1).trim();
        if (!name) continue;
        if (vipCookieNames.includes(name)) {
          _kugouCookies[name] = value;
          console.log(`[KUGOO_SETCOOKIE] ${name}=${value.slice(0, 24)}`);
        }
      }

      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(body); } catch { /* ignore */ }
        _debugMaybeCapture(path, parsed);
        resolve(parsed);
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

/**
 * ★ DEBUG: 登录成功后主动探测用户信息接口，寻找 VIP 字段
 * 只在 DEBUG_KUGOO=1 时调用，不影响正常流程
 */
async function kugouVipProbe() {
  if (!DEBUG_KUGOO) return;
  const cookie = getKugouCookieString();
  if (!cookie) return;

  // 可能返回用户身份信息的接口列表（含 CoolGoo 新版疑似端点）
  const probes = [
    { path: '/user/vip/detail', params: { busi_type: 'concept' } },
    { path: '/user/detail', params: {} },
    { path: '/user/info', params: {} },
    { path: '/user/member', params: {} },
    { path: '/user/level', params: {} },
    { path: '/user/identity', params: {} },
    { path: '/user/privilege', params: {} },
    { path: '/personal/fm', params: { userid: _kugouCookies.userid || 0 } },
    { path: '/search/default', params: {} },
  ];

  for (const p of probes) {
    try {
      const res = await kugoApiCall(p.path, p.params);
      addDebugUserProbe({ path: p.path, params: p.params, response: res });
    } catch (e) {
      addDebugUserProbe({ path: p.path, error: e.message });
    }
  }
  console.log(`[KUGOU_VIP_PROBE] ${probes.length} probes done`);
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
  // ★ CoolGoo 字段兼容：vip_type / viptype / is_vip / svip_type / is_svip / member_type
  const vipFlags = [
    userInfo.vip_type, userInfo.viptype, userInfo.svip_type, userInfo.member_type,
    userInfo.is_vip, userInfo.is_svip,
  ].map(v => (typeof v === 'string' ? parseInt(v, 10) : v));
  const vipType = Math.max(0, ...vipFlags.filter(v => Number.isFinite(v)));
  const isSvp = [userInfo.is_svip, userInfo.svip_type].some(v => /1|true/i.test(String(v))) || vipType >= 2;

  if (isSvp || vipType >= 2) {
    return { status: 'vip', provider: 'kugou', level: 'svip', name: 'SVIP', icon: '/icons/vip-kugou.svg' };
  }
  if (vipType >= 1) {
    return { status: 'vip', provider: 'kugou', level: 'vip', name: 'VIP', icon: '/icons/vip-kugou.svg' };
  }
  // ★ 拿不到任何 VIP 字段 → unknown（绝不静默判 normal）
  return { status: 'unknown', provider: 'kugou', level: null, name: null, icon: null };
}

// ======================== 用户信息 ========================

async function kugouUserInfo() {
  const cookie = getKugouCookieString();
  if (!cookie) return null;
  // ★ 上游真实模块是 module/user_detail.js → 路由 /user/detail（不是 /user/info）
  //    且响应结构是 { body: { data: { data: { ... } } } }
  const res = await kugoApiCall('/user/detail', {});
  const info = res?.data?.data || res?.data || null;
  if (!info) return null;
  const membership = parseKugouMembership(info);
  return {
    platform: 'kugou',
    nickname: info.nickname || info.username || info.nick_name || '',
    avatar: info.avatar || info.headpic || info.pic || '',
    userId: String(info.userid || info.uid || info.user_id || ''),
    vip: membership.status === 'vip',
    vipName: membership.name || '',
    membership,
  };
}

// ======================== VIP / 会员信息 ========================
// ======================== VIP / 会员信息 ========================
// ★ 参考 QQ Music 检测模式：从响应字段中提取 VIP 图标 / 等级信息
//    - userInfoUI.iconlist[].srcUrl → 包含 vip/svip 表示有 VIP
//    - lvinfo[].iconurl → 包含 svip/vip 表示等级
//
// ★ 但 CoolGou 架构不同：
//    - vip_type + vip_token 仅在非 QR 登录响应的 secu_params AES 解密后出现
//    - QR status=4 返回结构不含 VIP 字段
//    - CoolGoo 私有 API（user/vip/detail, /v3/get_my_info, v5/login_by_token）均失效
//    → result = null 表示"API 无法判断"，非"用户非 VIP"
// ★ CoolGoo 新/旧两代接口兼容；返回 {vip_type,...} 或 null
async function kugouVipInfo() {
  const cookie = getKugouCookieString();
  if (!cookie || !_kugouCookies.token) return null;

  const tries = [
    { path: '/user/vip/detail', params: { busi_type: 'concept' } },
    { path: '/user/detail',     params: {} },
  ];

  for (const t of tries) {
    try {
      const res = await kugoApiCall(t.path, t.params);
      if (res?.status == null || res.status === 1) {
        const info = res?.data?.data || res?.data || res;
        if (info && (info.vip_type || info.is_vip || info.svip_type || info.is_svip || info.member_type)) {
          console.log('[KUGOU_VIP_RAW]', t.path, JSON.stringify(info).slice(0, 400));
          return info;
        }
      }
    } catch (e) {
      console.log('[KUGOU_VIP_REQ] error path=' + t.path + ':', e.message);
    }
  }
  return null;
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
  // 参数名用 key（MakcRe 上游 login_qr_check.js 读取 params.key），并加 timestamp 防缓存
  const res = await kugoApiCall('/login/qr/check', { key: sigx, timestamp: Date.now() });
  // [DEBUG] 完整原始返回
  console.log('[KUGOU_QR_CHECK_RAW]', JSON.stringify(res));
  // ★ status=4 时打印完整响应字段（排查是否有 VIP 等隐藏字段）
  if (res?.data?.status === 4) {
    console.log('[KUGOU_QR_CHECK_FULL_DATA]', JSON.stringify(res?.data));
  }
  if (res?.data?.dfid) {
    _kugouCookies.dfid = res.data.dfid;
    saveKugouCookies();
  }
  const status = res?.data?.status;
  const cookie = res?.data?.cookie || [];
  const userid = res?.data?.userid || 0;
  const nickname = res?.data?.nickname || '';
  const avatar = res?.data?.avatar || res?.data?.pic || '';
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

/**
 * ★ 解绑 / 重新扫码时调用：强制生成新 dfid，避免 CoolGou 复用旧 session
 */
function resetKugouSession() {
  _kugouCookies = {};
  saveKugouCookies();
  // 触发重新注册设备（新 dfid）
  ensureDfid();
  console.log('[IvyM] kugou session reset, new dfid will be generated');
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
  resetKugouSession,
  kugouVipInfo,
  // ★ DEBUG: VIP 探测 (聚焦 status=4 原始响应 + 用户信息接口探测)
  setDebugRawQrStatus4,
  addDebugUserProbe,
  dumpKugouVipProbe,
  kugouVipProbe,
  startDebugScanner,
  addDebugFinalAccountSnapshot,
  dumpKugouDebugLog: dumpKugouVipProbe, // alias for preload
};
