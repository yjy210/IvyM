const { app, BrowserWindow, ipcMain, session } = require('electron');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { registerIpcHandlers } = require('./ipc');
const { startApiServer } = require('../server/index');

// 平台登录页 URL
const PLATFORM_LOGIN_URLS = {
  netease: 'https://music.163.com/#/login',
  qq: 'https://y.qq.com/n/ryqq/profile',
  kugou: process.env.KUGOU_LOGIN_URL || 'https://www.kugou.com/login/',
};

// 各平台 partition（隔离 session，避免污染主窗口）
const PLATFORM_PARTITIONS = {
  netease: 'persist:ivym-netease-login',
  qq: 'persist:ivym-qq-login',
  kugou: 'persist:ivym-kugou-login',
};

// QQ 音乐关键 cookie：需要 uin AND music key 同时存在
function qqHasValidLogin(cookies) {
  const names = cookies.map(c => c.name);
  const hasUin = names.includes('uin') || names.includes('wxuin') || names.includes('p_uin');
  // 只认播放授权 key，skey/p_skey 太宽松（QQ 全站都有）
  const hasMusicKey = names.includes('qm_keyst') || names.includes('qqmusic_key');
  return hasUin && hasMusicKey;
}

// 各平台 cookie 域名
const COOKIE_URLS = {
  netease: ['https://music.163.com', 'https://.music.163.com'],
  qq: ['https://y.qq.com', 'https://.y.qq.com', 'https://qq.com', 'https://.qq.com'],
  kugou: ['https://www.kugou.com', 'https://.kugou.com', 'https://kugou.com', 'https://m.kugou.com'],
};

let mainWin = null;

// 账号持久化（只存账号信息，不存 cookie）
const AccountManager = require('./account-manager');

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1200,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../build/logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWin.loadURL('http://localhost:5174');
  } else {
    mainWin.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWin.once('ready-to-show', () => mainWin.show());
  registerIpcHandlers(mainWin);
}

async function initServer() {
  try {
    await startApiServer(3001);
    console.log('[IvyM] API server started on http://localhost:3001');
  } catch (err) {
    console.error('[IvyM] API server failed:', err.message);
  }
}

// 平台用户信息 API
const USER_API = {
  netease: 'https://music.163.com/api/nuser/account/get',
  qq: 'https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg',
};

// QQ 头像合成 URL
function qqAvatarUrl(uin) {
  return uin ? `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(uin)}&s=100` : '';
}

// 剥掉 QQ JSONP 回调壳
function stripJsonp(text) {
  if (!text) return text;
  const m = text.match(/^\s*[^(]*\((.*)\)\s*;?\s*$/s);
  return m ? m[1] : text;
}

// 抓取指定 partition 下的 cookie
async function getPlatformCookies(platform) {
  const ses = session.fromPartition(PLATFORM_PARTITIONS[platform]);
  const urls = COOKIE_URLS[platform] || [];
  let allCookies = [];
  for (const url of urls) {
    const cookies = await ses.cookies.get({ url });
    allCookies = allCookies.concat(cookies);
  }
  const seen = new Set();
  return allCookies.filter(c => {
    const key = `${c.name}=${c.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 判断是否已有关键 cookie
// 注意：qqHasValidLogin 必须在此函数之前定义（已经在上方定义，可以安全调用）
function hasLoginCookies(platform, cookies) {
  const names = cookies.map(c => c.name);
  if (platform === 'netease') return names.includes('MUSIC_U');
  if (platform === 'qq') return qqHasValidLogin(cookies);
  // 酷狗：真正登录后会产生 KugooID / UserName / a_id 三个 cookie
  // kg_mid 是设备指纹（打开网页自动生成），不能作为登录依据
  // 要求 KugooID 有非空值（防止误判空 cookie）
  if (platform === 'kugou') {
    const kg = cookies.find(c => c.name === 'KugooID');
    return !!(kg && kg.value && names.includes('UserName'));
  }
  return false;
}

// 通用 https 请求（支持 GET/POST + params），返回 parsed JSON
function httpsRequest(url, { method = 'GET', headers = {}, body, params } = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v != null) urlObj.searchParams.set(k, String(v));
      });
    }
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://y.qq.com',
        ...headers,
      },
    };
    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

// 安全解析 JSON（兼容 JSONP）
function safeJsonParse(text) {
  if (!text) return null;
  const cleaned = stripJsonp(text.trim());
  try { return JSON.parse(cleaned); }
  catch { return null; }
}

// 从 cookie 中提取 userId
function getUserIdFromCookies(platform, cookies) {
  const map = {};
  cookies.forEach(c => { map[c.name] = c.value; });
  if (platform === 'netease') {
    return map['__csrf']?.slice(0, 10) || map['MUSIC_U']?.slice(0, 10) || '';
  }
  if (platform === 'qq') {
    return (map['uin'] || map['wxuin'] || map['p_uin'] || '').replace(/^o0*/, '');
  }
  return '';
}

// 从 cookie 对象中获取 QQ 昵称
function qqNicknameFromCookie(cookieObj, uin) {
  const padded = uin ? '0' + uin : '';
  const keys = [
    uin && ('ptnick_' + uin),
    padded && ('ptnick_' + padded),
    'ptnick',
    'nick',
    'nickname',
    'qq_nickname',
  ].filter(Boolean);
  for (const key of keys) {
    if (cookieObj[key]) {
      try { return decodeURIComponent(cookieObj[key].replace(/\+/g, '%20')).trim(); }
      catch { return cookieObj[key].trim(); }
    }
  }
  for (const k of Object.keys(cookieObj)) {
    if (/^ptnick_/i.test(k) && cookieObj[k]) {
      try { return decodeURIComponent(cookieObj[k].replace(/\+/g, '%20')).trim(); }
      catch { return cookieObj[k].trim(); }
    }
  }
  return '';
}

// 从 cookie 对象中获取 QQ 头像
function qqAvatarFromCookie(cookieObj) {
  const direct = cookieObj['qqmusic_avatar'] || cookieObj['avatar'] || cookieObj['avatarUrl'] || cookieObj['headpic'];
  if (direct) {
    try { return decodeURIComponent(direct); }
    catch { return direct; }
  }
  return '';
}

// QQ 会员身份解析 —— userInfoUI.iconlist[0].srcUrl 主判断（3 样本已验证）
//   svip1.png → 超级VIP    vip1.png → 豪华绿钻    其他 → 普通用户
// 只取 [0] 严格文件名匹配：iconlist[1+] 含 d- 推广入口不参与判断
function parseQQMembership(user) {
  const icon = user?.userInfoUI?.iconlist?.[0]?.srcUrl ?? '';
  const filename = icon.split('/').pop();
  switch (filename) {
    case 'svip1.png':
      return { status: 'vip', provider: 'qq', level: 'super_vip', name: '超级会员', icon: icon || null };
    case 'vip1.png':
      return { status: 'vip', provider: 'qq', level: 'green_diamond', name: '豪华绿钻', icon: icon || null };
    default:
      return { status: 'normal', provider: 'qq', level: null, name: null, icon: null };
  }
}

// 网易云会员身份解析 —— vipType 字段判断（已验证）
//   11=黑胶VIP  110=黑胶SVIP  其他=普通
// 网易云 API 不返回官方 icon URL（vip.iconUrl 始终 null）
// 由前端按 level 加载本地 SVG：vip-netease.svg
function parseNeteaseMembership(profile, account) {
  const pv = profile?.vipType || 0;
  const av = account?.vipType || 0;
  const maxVip = Math.max(
    [11, 110].includes(av) ? av : 0,
    [11, 110].includes(pv) ? pv : 0,
  );
  if (maxVip === 110) {
    return { status: 'vip', provider: 'netease', level: 'black_svip', name: '黑胶SVIP', icon: null };
  }
  if (maxVip === 11) {
    return { status: 'vip', provider: 'netease', level: 'black_vip', name: '黑胶VIP', icon: null };
  }
  return { status: 'normal', provider: 'netease', level: null, name: null, icon: null };
}

// 获取用户信息
async function getUserInfo(platform, cookieStr) {
  const cookies = await getPlatformCookies(platform);
  const userId = getUserIdFromCookies(platform, cookies);

  if (platform === 'kugou') {
    // ★ kugou fallback = 昵称用 KugooID 占位（真正的用户资料由 CDP 在 login_by_token_get 里捕获）
    const kugooId = cookies.find(c => c.name === 'KugooID')?.value || '';
    return {
      platform: 'kugou',
      nickname: kugooId ? `酷狗${kugooId.slice(-6)}` : '酷狗用户',
      avatar: '',
      userId: kugooId || userId || '',
      vip: false,
      vipName: '',
      membership: { status: 'normal', provider: 'kugou', level: null, name: null, icon: null },
    };
  }

  // ===== 网易云 =====
  if (platform === 'netease') {
    try {
      const text = await httpsRequest(USER_API.netease, {
        headers: { 'Referer': 'https://music.163.com', 'Cookie': cookieStr },
      });
      const raw = safeJsonParse(text);
      if (raw?.profile) {
        const membership = parseNeteaseMembership(raw.profile, raw.account);
        return {
          platform,
          nickname: raw.profile.nickname || '',
          avatar: raw.profile.avatarUrl || '',
          userId: String(raw.profile.userId || ''),
          vip: membership?.status === 'vip',
          vipName: membership?.name || '',
          membership,
        };
      }
    } catch (e) {
      console.warn('[IvyM] Netease API failed:', e.message);
    }
    return { platform, nickname: '', avatar: '', userId, vip: false, vipName: '' };
  }

  // ===== QQ音乐 =====
  if (platform === 'qq') {
    const cookieObj = {};
    cookies.forEach(c => { cookieObj[c.name] = c.value; });
    const cookieNick = qqNicknameFromCookie(cookieObj, userId);
    const cookieAvatar = qqAvatarFromCookie(cookieObj);

    try {
      const apiUrl = new URL(USER_API.qq);
      apiUrl.searchParams.set('cid', '205360838');
      apiUrl.searchParams.set('userid', userId);
      apiUrl.searchParams.set('reqfrom', '1');
      apiUrl.searchParams.set('reqtype', '1');

      const text = await httpsRequest(apiUrl.toString(), {
        headers: { 'Cookie': cookieStr, 'Referer': 'https://y.qq.com' },
      });
      const raw = safeJsonParse(text);
      const data = raw?.data || {};
      const creator = data.creator || {};
      const nickname = creator.nick || cookieNick || (userId ? 'QQ ' + userId : 'QQ 音乐');
      const avatar = creator.headpic || cookieAvatar || qqAvatarUrl(userId);

      // QQ 会员（与 server/qq.js 同源：creator.userInfoUI.iconlist[0].srcUrl 主判断，3 样本已验证）
      const membership = parseQQMembership(creator);
      return {
        platform, nickname, avatar, userId,
        membership,
        vip: membership.status === 'vip',
        vipName: membership.name || '',
      };
    } catch (e) {
      console.warn('[IvyM] QQ profile API failed:', e.message);
    }

    return {
      platform,
      nickname: cookieNick || (userId ? 'QQ ' + userId : 'QQ 音乐'),
      avatar: cookieAvatar || qqAvatarUrl(userId),
      userId,
      membership: { status: 'normal', provider: 'qq', level: null, name: null, icon: null },
      vip: false,
      vipName: '',
    };
  }

  return null;
}

// ==================== 酷狗 QR 独立登录流程 ====================

/**
 * 酷狗 QR 登录完整流程（独立 handler，前端 LoginDropdown 主动调用）。
 * 不走 BrowserWindow，直接：
 *   1. getQRKey → 前端展示二维码
 *   2. 轮询 checkQR → status=4 时有 {token,userid,cookie[]}
 *   3. createKugouSession → 组装 session 落盘
 *   4. fetch /api/kugou/user → 拉取 nickname/avatar
 *   5. AccountManager.upsertAccount → 账号落库
 *   6. 发送 login:result
 */
// ★ kugou QR 流程状态机（模块级，唯一实例）
let _kugouQrState = null; // { sigx, dfid, settled, timeoutId, resultPromise, finish }

async function executeKugouQrLogin() {
  console.log('[IvyM] executeKugouQrLogin called');

  // 如果已有活跃流程，返回同一个 Promise（避免重复注册 handler）
  if (_kugouQrState && !_kugouQrState.settled) {
    return _kugouQrState.resultPromise;
  }

  // 清理上一次的流程（如果超时未解决）
  if (_kugouQrState?.timeoutId) {
    clearTimeout(_kugouQrState.timeoutId);
    _kugouQrState = null;
  }

  // 获取二维码
  let qrResult;
  try {
    const { kugouQrLogin } = require('../server/kugou');
    qrResult = await kugouQrLogin();
  } catch (e) {
    return { platform: 'kugou', success: false, msg: '无法连接本地 API 服务: ' + e.message };
  }
  if (qrResult.code !== 200) {
    return { platform: 'kugou', success: false, msg: qrResult.msg || '获取二维码失败' };
  }
  const qrimg = qrResult.qrimg || qrResult.data?.qrimg;
  const sigx  = qrResult.sigx  || qrResult.data?.sigx;
  const dfid  = qrResult.dfid  || qrResult.data?.dfid  || _kugouQrState?.dfid;
  mainWin?.webContents.send('login:kugou-qr-img', { platform: 'kugou', qrimg, sigx, dfid });

  // 构造新的 Promise 返回给所有并发调用者
  let resolvePromise;
  const resultPromise = new Promise((resolve) => { resolvePromise = resolve; });

  const finish = (result) => {
    if (_kugouQrState) {
      _kugouQrState.settled = true;
      clearTimeout(_kugouQrState.timeoutId);
      mainWin?.webContents.send('login:result', result);
      // 清理（保留短时间以便 last-gasp resolve）
      setTimeout(() => { _kugouQrState = null; }, 2000);
    }
    resolvePromise(result);
  };

  _kugouQrState = {
    sigx,
    dfid,
    settled: false,
    timeoutId: setTimeout(() => {
      finish({ platform: 'kugou', success: false, msg: '二维码已过期' });
    }, 120000),
    finish,
    resultPromise,
  };

  return resultPromise;
}

// kugou QR check handler（注册一次，由 polling 调用）
async function handleKugouQrCheck(sigx, dfid) {
  const state = _kugouQrState;
  // [DEBUG] 打印入参 vs state 对比
  console.log('[KUGOU_QR_CHECK_CALL]', JSON.stringify({ incomingSigx: sigx, incomingDfid: dfid, stateSigx: state?.sigx, stateDfid: state?.dfid, sigxMatch: sigx === state?.sigx }));
  if (!state || state.settled) return { status: state ? -1 : 0, msg: '无活跃登录流程' };

  try {
    const { kugouQrCheck, createKugouSession } = require('../server/kugou');
    const check = await kugouQrCheck(sigx, dfid);
    const status = check.status;

    if (status === 0) {
      state.finish({ platform: 'kugou', success: false, msg: '二维码已过期' });
      return check;
    }
    if (status === 2) {
      mainWin?.webContents.send('login:kugou-qr-status', { platform: 'kugou', status: 'scanned' });
    }
    if (status === 4) {
      try {
        const fullCheck = await kugouQrCheck(sigx);
        const cookies = Array.isArray(fullCheck.cookie) ? fullCheck.cookie : [];
        const token = cookies.find((c) => c.name === 'token')?.value || '';
        const userid = fullCheck.userid || token || '';
        createKugouSession({ token, userid, cookies });
        const { kugouUserInfo } = require('../server/kugou');
        const info = await kugouUserInfo();
        const account = {
          platform: 'kugou',
          nickname: info?.nickname || `酷狗${String(userid).slice(-6)}`,
          avatar: info?.avatar || '',
          userId: String(userid),
          vip: info?.vip || false,
          vipName: info?.vipName || '',
          membership: info?.membership || { status: 'unknown', provider: 'kugou' },
        };
        AccountManager.upsertAccount(account);
        state.finish({ platform: 'kugou', success: true, user: account, cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') });
      } catch (e) {
        console.error('[IvyM] final kugou check error:', e.message);
        state.finish({ platform: 'kugou', success: false, msg: '登录完成但获取用户信息失败: ' + e.message });
      }
    }
    return check;
  } catch (e) {
    console.error('[IvyM] kugou check error:', e.message);
    return { status: 1, msg: e.message };
  }
}

// ★ handlers 注册一次
ipcMain.handle('login:kugou-qr-start', () => executeKugouQrLogin());
ipcMain.handle('login:kugou-qr-check', async (_e, { sigx, dfid } = {}) => {
  // 前端 polling 调用：传 { sigx, dfid } 或仅 sigx
  const effectiveSigx = sigx || (_kugouQrState && _kugouQrState.sigx);
  const effectiveDfid = dfid || (_kugouQrState && _kugouQrState.dfid);
  return handleKugouQrCheck(effectiveSigx, effectiveDfid);
});

// ★ 酷狗会员信息查询（VIP 账号 fallback）
ipcMain.handle('login:kugou-qr-vip', async () => {
  try {
    const { kugoUserInfo } = require('../server/kugo');
    const info = await kugoUserInfo();
    if (!info) return { code: 401, msg: '未登录' };
    return { code: 200, data: info };
  } catch (e) {
    return { code: -1, msg: e.message };
  }
});

// ==================== 登录入口 ====================
ipcMain.handle('login:open', async (event, platform) => {
  console.log(`[IvyM] login:open called for platform: ${platform}`);

  // ★ 酷狗走独立 QR 路径
  if (platform === 'kugou') {
    return executeKugouQrLogin();
  }

  const url = PLATFORM_LOGIN_URLS[platform];
  const partition = PLATFORM_PARTITIONS[platform];
  console.log(`[IvyM] loading URL: ${url}, partition: ${partition}`);

  return new Promise((resolve) => {
    let settled = false;
    let pollTimer = null;

    const loginWin = new BrowserWindow({
      width: 900,
      height: 680,
      minWidth: 700,
      minHeight: 500,
      title: `绑定${platform === 'netease' ? '网易云音乐' : platform === 'kugou' ? '酷狗音乐' : 'QQ音乐'}账号`,
      autoHideMenuBar: true,
      icon: path.join(__dirname, '../build/logo.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        partition,
      },
    });

    // ★ 酷狗：模拟 Chrome UA（防 Electron 检测拦截）
    if (platform === 'kugou') {
      loginWin.webContents.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );
    }

    const finish = async (result) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      // ★ kugou: CDP 捕获 login_by_token_get 的响应体
      // 注意：必须等 loadingFinished 再 getResponseBody，否则 buffer 会被释放
      if (platform === 'kugou' && result?.success && loginWin && !loginWin.isDestroyed()) {
        try {
          // 确保 debugger 已 attach + Network.enable
          try { loginWin.webContents.debugger.attach('1.3'); } catch {}
          try { loginWin.webContents.debugger.sendCommand('Network.enable'); } catch {}

          let pendingRequestId = null;

          // 设置监听器：responseReceived 只存 ID；loadingFinished 才读 body
          loginWin.webContents.debugger.on('message', async (_evt, method, params) => {
            if (method === 'Network.responseReceived') {
              const url = params?.response?.url || '';
              if (url.includes('login_by_token_get') || url.includes('get_userinfo_qrcode')) {
                pendingRequestId = params.requestId;
                console.log('[KUGOU_REQ]', url.slice(0, 150));
              }
            } else if (method === 'Network.loadingFinished' && params.requestId === pendingRequestId) {
              try {
                const body = await loginWin.webContents.debugger.sendCommand('Network.getResponseBody', { requestId: pendingRequestId });
                const raw = body?.body || '';
                console.log('[KUGOU_USER_RESPONSE]', raw.slice(0, 600));
                const j = JSON.parse(raw);
                const d = typeof j.data === 'object' ? j.data : null;
                if (d && (d.nickname || d.username || d.userid)) {
                  const vipT = Number(d.vip_type || d.viptype || d.vip || 0);
                  const isVip = vipT > 0;
                  const svipLevel = Number(d.svip_level || 0);
                  const level = svipLevel >= 1 ? 'svip' : 'vip';
                  const name = !isVip ? null : (level === 'svip' ? 'SVIP' : 'VIP');
                  result.user = {
                    platform: 'kugou',
                    nickname: d.nickname || d.username || '',
                    avatar: d.avatar || d.pic || d.headpic || d.headurl || '',
                    userId: String(d.userid || d.uid || ''),
                    vip: isVip,
                    vipName: name || '',
                    membership: {
                      status: isVip ? 'vip' : 'normal',
                      provider: 'kugou',
                      level: isVip ? level : null,
                      name,
                      icon: isVip ? '/icons/vip-kugou.svg' : null,
                    },
                  };
                  console.log('[KUGOU_USER_OK]', JSON.stringify(result.user));
                }
              } catch (e) {
                console.warn('[KUGOU_USER_RESPONSE_err]', e.message);
              }
            }
          });

          // 等最多 6s
          await new Promise((resolve) => {
            const timeout = setTimeout(resolve, 6000);
            const check = setInterval(() => {
              if (result.user?.nickname) { clearInterval(check); clearTimeout(timeout); resolve(undefined); }
            }, 300);
          });

          // 清理
          try { loginWin.webContents.debugger.sendCommand('Network.disable'); } catch {}
          try { loginWin.webContents.debugger.detach(); } catch {}
        } catch (e) {
          console.warn('[KUGOU_CDP_err]', e.message);
        }
      }
      // 登录成功 → 持久化
      if (result?.success && result.cookie) {
        try {
          if (platform === 'netease') {
            const { saveCookie } = require('../server/netease');
            saveCookie(result.cookie);
          } else if (platform === 'qq') {
            const { saveQQCookie } = require('../server/qq');
            saveQQCookie(result.cookie);
          } else if (platform === 'kugou') {
            const { saveKugouCookies } = require('../server/kugou');
            saveKugouCookies(result.cookie);
          }
        } catch { /* ignore */ }
        if (result.user?.userId) {
          AccountManager.upsertAccount({
            platform: result.user.platform || platform,
            nickname: result.user.nickname || '',
            avatar: result.user.avatar || '',
            userId: result.user.userId,
            vip: result.user.vip || false,
            vipName: result.user.vipName || '',
            membership: result.user.membership || null,
            bindTime: Date.now(),
          });
        }
      }
      if (!loginWin.isDestroyed()) loginWin.close();
      mainWin?.webContents.send('login:result', result);
      resolve(result);
    };

    if (platform === 'kugou') {
      // ★ 监听 login_by_token_get 接口返回 = 真正用户信息
      const kgSes = loginWin.webContents.session;
      const kgUserUrl = 'https://loginservice.kugou.com/v1/login_by_token_get';
      const kgFilter = { urls: ['*://loginservice.kugou.com/*'] };
      // 用 devtools 的 debugger 读 responseBody
      // ★ CDP 已废弃 —— 改为 session cookie 直调 API（无竞态 / 无 body-release 问题）
      // 详见 debug history: CDP getResponseBody 因 buffer 释放导致 "No data found"
      loginWin.webContents.on('did-start-loading', () => console.log('[KUGOU_LOADING] start'));
      loginWin.webContents.on('did-finish-load', () => console.log('[KUGOU_LOADING] finish'));
      loginWin.webContents.on('did-fail-load', (_, code, desc, url) => console.error('[KUGOU_LOADING] FAIL', code, desc, url));
      loginWin.webContents.session.cookies.on('changed', (_e, cookie, cause, removed) => {
        console.log(`[KUGOU_COOKIE_CHANGED] ${cause} | ${cookie.name}=${cookie.value.slice(0,30)} | removed=${removed}`);
      });
      // CDP 抓包：找出登录后 kogou 网页自身调用的用户信息接口
      try {
        loginWin.webContents.debugger.attach('1.3');
        loginWin.webContents.debugger.on('message', (_event, method, params) => {
          if (method !== 'Network.requestWillBeSent') return;
          const url = params?.request?.url || '';
          // 只抓 kugou.com 域名的非静态请求
          if (!/kugou\.com|kugimg\.com|kgou\.com/i.test(url)) return;
          if (/\.(js|css|png|jpg|jpeg|gif|svg|woff2?|mp3|webp|ico|avif|wasm)(\?|$)/i.test(url)) return;
          console.log(`[KUGOU_API] ${params.request.method} ${url.slice(0, 250)}`);
        });
        loginWin.webContents.debugger.sendCommand('Network.enable');
        loginWin.once('closed', () => {
          try { loginWin.webContents.debugger.detach(); } catch {}
        });
      } catch (e) {
        console.warn('[KUGOU_CDP_err]', e.message);
      }
    }

    pollTimer = setInterval(async () => {
      try {
        if (loginWin.isDestroyed()) return;
        const cookies = await getPlatformCookies(platform);
        if (platform === 'kugou') {
          const allNames = cookies.map(c => `${c.name}=${c.value.slice(0, 12)}`).join('; ');
          console.log('[KUGOU_poll]', allNames);
        }
        if (hasLoginCookies(platform, cookies)) {
          const fullCookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          console.log('[KUGOU_SUCCESS]', JSON.stringify(cookies.map(c => ({name:c.name, val:c.value.slice(0,20)}))));
          const fs = require('fs');
          const path = require('path');
          fs.writeFileSync(
            path.join(__dirname, '../server/.kg-cookie.json'),
            JSON.stringify({ cookie: fullCookie, time: Date.now() }, null, 2),
          );
          // 从完整 cookie 串里提取昵称头像
          const cookieStr = fullCookie;
          const userInfo = await getUserInfo(platform, cookieStr);
          if (userInfo && (userInfo.nickname || userInfo.userId)) {
            finish({ platform, success: true, cookie: cookieStr, user: userInfo });
          }
        }
      } catch (e) { console.warn('[KUGOU_poll_err]', e.message); }
    }, 1000);

    loginWin.on('closed', async () => {
      if (settled) return;
      finish({ platform, success: false, msg: '已取消登录' });
    });

    // ★ 诊断：打印页面加载失败的原因（kugou.com 打不开的具体错误码）
    loginWin.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('[KUGOU_LOAD_FAIL]', errorCode, errorDescription);
    });
    loginWin.webContents.on('did-finish-load', () => {
      console.log('[KUGOU_LOAD_OK] 页面加载完成');
    });

    loginWin.loadURL(url).then(() => {
      console.log('[IvyM] login window URL loaded successfully');
    }).catch((err) => {
      console.error('[IvyM] login window URL load failed:', err.message);
    });

    console.log('[IvyM] login window created and shown');
  });
});

// ==================== 账号管理 IPC（React 禁止直接 saveAccounts）====================

// 读取所有已绑定账号
ipcMain.handle('account:get', () => AccountManager.loadAccounts());

// 添加或更新单个账号（自动清洗字段、合并旧值、更新 bindTime）
ipcMain.handle('account:upsert', (event, account) => AccountManager.upsertAccount(account));

// 移除指定平台账号
ipcMain.handle('account:remove', (event, platform) => AccountManager.removeAccount(platform));

// ==================== Phase 2: 网易云 QR 登录 ====================

// 获取二维码
ipcMain.handle('login:qr-key', async () => {
  try {
    const { neteaseQrLogin } = require('../server/netease');
    const result = await neteaseQrLogin();
    return result;
  } catch (e) {
    return { code: -1, msg: e.message };
  }
});

// 轮询扫码状态
ipcMain.handle('login:qr-check', async (event, unikey) => {
  try {
    const { neteaseQrCheck } = require('../server/netease');
    const result = await neteaseQrCheck(unikey);
    return result;
  } catch (e) {
    return { code: -1, msg: e.message };
  }
});

// 获取用户信息
ipcMain.handle('login:qr-user', async () => {
  try {
    const { neteaseUserInfo } = require('../server/netease');
    const result = await neteaseUserInfo();
    return { code: 200, data: result };
  } catch (e) {
    return { code: -1, msg: e.message };
  }
});

// ★ 酷狗音乐：走官方 BrowserWindow 登录（与 QQ/网易云一致），不再走 KuGouMusicApi QR 轮询

// QQ音乐：网页登录（BrowserWindow 方式）

// 打开 QQ 音乐官网登录窗口
ipcMain.handle('login:qq-open', async () => {
  return new Promise((resolve) => {
    let settled = false;

    const loginWin = new BrowserWindow({
      width: 900,
      height: 680,
      minWidth: 700,
      minHeight: 500,
      title: '绑定 QQ 音乐',
      autoHideMenuBar: true,
      icon: path.join(__dirname, '../build/logo.png'),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        partition: 'persist:ivym-qq-login',
      },
    });

    const saveQQCookies = async () => {
      try {
        const ses = loginWin.webContents.session;
        const cookies = await ses.cookies.get({ url: 'https://y.qq.com' });
        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        // 保存到文件
        const fs = require('fs');
        fs.writeFileSync(
          path.join(__dirname, '../server/.qq-cookie.json'),
          JSON.stringify({ cookie: cookieStr, time: Date.now() }, null, 2),
        );
        console.log(`[IvyM] QQ login cookies saved (${cookies.length} cookies)`);
        return cookieStr;
      } catch (e) {
        console.error('[IvyM] QQ cookie save failed:', e.message);
        return '';
      }
    };

    const finish = async (result) => {
      if (settled) return;
      settled = true;
      const cookie = await saveQQCookies();
      // 获取 QQ 用户信息（头像、昵称）
      let user = null;
      try {
        user = await getUserInfo('qq', cookie);
        console.log('[IvyM] QQ user info:', JSON.stringify(user));
      } catch (e) {
        console.warn('[IvyM] QQ user info fetch failed:', e.message);
      }
      if (!loginWin.isDestroyed()) loginWin.close();
      mainWin?.webContents.send('login:result', { ...result, cookie, user });
      resolve(result);
    };

    // 监听页面跳转 - 登录成功后页面会跳转到 y.qq.com 主页
    loginWin.webContents.on('did-navigate', async (e, url) => {
      if (url.startsWith('https://y.qq.com/') && !url.includes('login')) {
        // 可能已登录，尝试抓 cookie
        const ses = loginWin.webContents.session;
        const cookies = await ses.cookies.get({ url: 'https://y.qq.com' });
        const hasQQCookie = cookies.some(c => c.name.includes('uin') || c.name.includes('qqmusic'));
        if (hasQQCookie) {
          console.log('[IvyM] QQ login detected via navigation');
          finish({ platform: 'qq', success: true });
        }
      }
    });

    loginWin.on('closed', async () => {
      if (settled) return;
      finish({ platform: 'qq', success: false, msg: '已取消登录' });
    });

    loginWin.loadURL('https://y.qq.com/');
  });
});

// ==================== QQ音乐扫码登录（qq-music-api 方式）====================

// 获取二维码（qq-music-api 返回 {img: "data:image/png;base64,..."}）
// 获取二维码（通过后端 3001 代理，避免跨域）
ipcMain.handle('login:qq-qr-key', async () => {
  try {
    const res = await fetch('http://localhost:3001/api/qq/login/qr');
    if (!res.ok) {
      console.error('[QQ_QR] 后端返回 HTTP', res.status);
      return { code: -1, msg: '后端返回错误: ' + res.status };
    }
    const json = await res.json();
    console.log('[QQ_QR] 返回 code=' + json.code + ', hasImg=' + !!json.data?.img);
    return json;
  } catch (e) {
    console.error('[QQ_QR] 请求失败:', e.message);
    return { code: -1, msg: '无法连接到本地服务器 (3001)', error: e.message };
  }
});

// 检查扫码状态（通过后端 3001 代理）
ipcMain.handle('login:qq-qr-check', async (e, { qrsig, ptqrtoken }) => {
  try {
    const res = await fetch('http://localhost:3001/api/qq/login/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrsig, ptqrtoken }),
    });
    const json = await res.json();
    console.log('[QQ_CHECK] 返回 code=' + json.code + ', hasSession=' + !!json.session);
    return json;
  } catch (e) {
    console.error('[QQ_CHECK] 请求失败:', e.message);
    return { code: -1, msg: '无法连接到本地服务器', error: e.message };
  }
});

// ==================== 清除 partition session（内部共用）====================
async function clearPlatformSession(platform) {
  const partition = PLATFORM_PARTITIONS[platform];
  if (!partition) return;
  const ses = session.fromPartition(partition);

  await ses.clearStorageData({
    storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers', 'websql', 'fileSystems'],
  });

  // 兜底：确保 cookie 清掉
  const remaining = await ses.cookies.get({});
  for (const c of remaining) {
    const protocol = c.secure ? 'https://' : 'http://';
    const domain = c.domain?.startsWith('.') ? c.domain.slice(1) : c.domain || '';
    try { await ses.cookies.remove(`${protocol}${domain}${c.path || '/'}`, c.name); } catch {}
  }

  await ses.closeAllConnections?.();
  await ses.clearCache();
  await ses.clearHostResolverCache();
  await ses.clearAuthCache();

  console.log(`[IvyM] ${platform} session cleared (${remaining.length} cookies)`);
}

// ==================== 解绑 ====================
ipcMain.handle('login:clear', async (event, platform) => {
  // 1) 清除 cookie 文件
  if (platform === 'netease') {
    try { fs.unlinkSync(path.join(__dirname, '../server/.netease-cookie.json')); } catch {}
  } else if (platform === 'qq') {
    try { fs.unlinkSync(path.join(__dirname, '../server/.qq-cookie.json')); } catch {}
  } else if (platform === 'kugou') {
    try { fs.unlinkSync(path.join(__dirname, '../server/.kg-cookie.json')); } catch {}
  }

  // 2) 清除 Electron partition session
  await clearPlatformSession(platform);

  return { ok: true };
});

// ==================== 切换账号 ====================
ipcMain.handle('login:switch-account', async (event, platform) => {
  // 1) 清 cookie 文件 + partition session
  if (platform === 'netease') {
    try { fs.unlinkSync(path.join(__dirname, '../server/.netease-cookie.json')); } catch {}
  } else if (platform === 'qq') {
    try { fs.unlinkSync(path.join(__dirname, '../server/.qq-cookie.json')); } catch {}
  } else if (platform === 'kugou') {
    try { fs.unlinkSync(path.join(__dirname, '../server/.kg-cookie.json')); } catch {}
  }
  await clearPlatformSession(platform);

  // 2) 移除本地持久化账号（头像菜单不显示旧账号）
  AccountManager.removeAccount(platform);

  // 3) 通知前端更新菜单
  mainWin?.webContents.send('login:account-removed', { platform });

  // 4) 重新打开官方登录窗口（仅 BrowserWindow 方式平台）
  if (PLATFORM_LOGIN_URLS[platform]) {
    ipcEmitLoginWindow(platform);
  }

  return { ok: true };
});

// ==================== 打开登录窗口（供 switch-account 复用）====================
function ipcEmitLoginWindow(platform) {
  const url = PLATFORM_LOGIN_URLS[platform];
  const partition = PLATFORM_PARTITIONS[platform];

  const loginWin = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 700,
    minHeight: 500,
    title: `绑定${platform === 'netease' ? '网易云音乐' : platform === 'kugou' ? '酷狗音乐' : 'QQ音乐'}账号`,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../build/logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      partition,
    },
  });

  let settled = false;
  let pollTimer = null;

  const finish = async (result) => {
    if (settled) return;
    settled = true;
    if (pollTimer) clearInterval(pollTimer);
    if (result?.success && result.cookie) {
      try {
        if (platform === 'netease') {
          const { saveCookie } = require('../server/netease');
          saveCookie(result.cookie);
        } else if (platform === 'qq') {
          const { saveQQCookie } = require('../server/qq');
          saveQQCookie(result.cookie);
        }
      } catch { /* ignore */ }
      // 直接持久化账号，不依赖前端监听器
      if (result.user?.userId) {
        AccountManager.upsertAccount({
          platform: result.user.platform || platform,
          nickname: result.user.nickname || '',
          avatar: result.user.avatar || '',
          userId: result.user.userId,
          vip: result.user.vip || false,
          vipName: result.user.vipName || '',
          membership: result.user.membership || null,
          bindTime: Date.now(),
        });
      }
    }
    if (!loginWin.isDestroyed()) loginWin.close();
    mainWin?.webContents.send('login:result', result);
  };

  pollTimer = setInterval(async () => {
    try {
      if (loginWin.isDestroyed()) return;
      const cookies = await getPlatformCookies(platform);
      if (hasLoginCookies(platform, cookies)) {
        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        const userInfo = await getUserInfo(platform, cookieStr);
        if (userInfo && (userInfo.nickname || userInfo.userId)) {
          finish({ platform, success: true, cookie: cookieStr, user: userInfo });
        }
      }
    } catch { /* ignore */ }
  }, 1000);

  loginWin.on('closed', async () => {
    if (settled) return;
    finish({ platform, success: false, msg: '已取消登录' });
  });

  loginWin.loadURL(url).catch(console.error);
}

app.whenReady().then(async () => {
  // 网易云图片防盗链：添加 Referer 头
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.music.126.net/*', '*://*.music.163.com/*'] },
    (details, callback) => {
      details.requestHeaders['Referer'] = 'https://music.163.com/';
      callback({ requestHeaders: details.requestHeaders });
    },
  );

  // 初始化 AccountManager（必须在 app.whenReady 之后调用）
  AccountManager.init(app);

  await initServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
