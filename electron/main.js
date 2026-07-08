const { app, BrowserWindow, ipcMain, session } = require('electron');
const https = require('https');
const path = require('path');
const qrcode = require('qrcode');
const { registerIpcHandlers } = require('./ipc');
const { startApiServer } = require('../server/index');

// 酷狗官方 API 常量
const KUGOU_APPID = 1005;
const KUGOU_SRCAPPID = 2919;

// 平台登录方式：netease/qq 用浏览器打开官网，kugou 用官方 QR API
const PLATFORM_LOGIN_URLS = {
  netease: 'https://music.163.com/#/login',
  qq: 'https://y.qq.com/n/ryqq/profile',
};

const LOGIN_METHOD = {
  netease: 'browser',
  qq: 'browser',
  kugou: 'qrcode', // 酷狗用官方二维码 API
};

// 网易云/QQ 用固定 partition
const PLATFORM_PARTITIONS = {
  netease: 'persist:ivym-netease-login',
  qq: 'persist:ivym-qq-login',
};

// 酷狗用动态 partition（每次登录创建全新浏览器环境，解绑后废弃）
let kugouPartition = null;

function getPartition(platform) {
  if (platform === 'kugou') {
    if (!kugouPartition) {
      kugouPartition = `persist:ivym-kugou-${Date.now()}`;
    }
    return kugouPartition;
  }
  return getPartition(platform);
}

// 酷狗解绑：废弃当前 partition，下次登录创建新的
function resetKugouPartition() {
  kugouPartition = `persist:ivym-kugou-${Date.now()}`;
  console.log('[IvyM] KuGou partition reset to:', kugouPartition);
}

// 各平台登录有效的关键 cookie 名
const LOGIN_KEY_COOKIES = {
  netease: ['MUSIC_U', '__csrf', 'os'],
  qq: ['uin', 'music_u', 'qm_keyst', 'qqmusic_key'],
  // 酷狗不用 cookie 检测，用 DOM 检测（见 pollTimer 内）
};

// QQ 音乐关键 cookie：需要 uin AND music key 同时存在
function qqHasValidLogin(cookies) {
  const names = cookies.map(c => c.name);
  const hasUin = names.includes('uin') || names.includes('wxuin') || names.includes('p_uin');
  const hasMusicKey = names.includes('qm_keyst') || names.includes('qqmusic_key') ||
    names.includes('music_key') || names.includes('p_skey') || names.includes('skey');
  return hasUin && hasMusicKey;
}

// 各平台 cookie 域名
const COOKIE_URLS = {
  netease: ['https://music.163.com', 'https://.music.163.com'],
  qq: ['https://y.qq.com', 'https://.y.qq.com', 'https://qq.com', 'https://.qq.com'],
  kugou: ['https://www.kugou.com', 'https://.kugou.com', 'https://kugou.com'],
};

let mainWin = null;

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1200,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    show: false,
    frame: false,                  // 去掉原生窗口边框
    transparent: true,             // 透明窗口
    backgroundColor: '#00000000',  // 全透明背景
    hasShadow: true,               // 窗口阴影
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../build/logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 开发环境连接 Vite，生产环境加载 build 产物
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWin.loadURL('http://localhost:5174');
  } else {
    mainWin.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 窗口准备好后再显示（避免闪烁）
  mainWin.once('ready-to-show', () => {
    mainWin.show();
  });

  // 注册 IPC handlers
  registerIpcHandlers(mainWin);
}

// 启动本地 API 服务器
async function initServer() {
  try {
    await startApiServer(3001);
    console.log('[IvyM] API server started on http://localhost:3001');
  } catch (err) {
    console.error('[IvyM] API server failed:', err.message);
  }
}

// 平台用户信息 API（酷狗不用 API，用 DOM 抓取）
const USER_API = {
  netease: 'https://music.163.com/api/nuser/account/get',
  qq: 'https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg',
};

// QQ 头像合成 URL（当平台没有返回头像时）
function qqAvatarUrl(uin) {
  return uin ? `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(uin)}&s=100` : '';
}

// 剥掉 QQ JSONP 回调壳：callback({...}) → {...}
function stripJsonp(text) {
  if (!text) return text;
  const m = text.match(/^\s*[^(]*\((.*)\)\s*;?\s*$/s);
  return m ? m[1] : text;
}

// 抓取指定 partition 下的 cookie
async function getPlatformCookies(platform) {
  const ses = session.fromPartition(getPartition(platform));
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

// 判断是否已有关键 cookie（登录成功）
function hasLoginCookies(platform, cookies) {
  if (platform === 'qq') return qqHasValidLogin(cookies);
  const keys = LOGIN_KEY_COOKIES[platform] || [];
  const names = cookies.map(c => c.name);
  return keys.some(k => names.includes(k));
}

// 通用 https 请求（支持 GET/POST），返回 raw text（兼容 JSONP）
function httpsRequest(url, { method = 'GET', headers = {}, body, params } = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    // 追加 query params
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
      res.on('end', () => resolve(safeJsonParse(data) || data));
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
    // uin 格式通常是 "o0123456789" 或纯数字
    return (map['uin'] || map['wxuin'] || map['p_uin'] || '').replace(/^o0*/, '');
  }
  if (platform === 'kugou') {
    return map['kg_mid'] || map['KG_FID'] || map['userid'] || map['USERID'] || '';
  }
  return '';
}

// 从 cookie 对象中获取 QQ 昵称（Mineradio 方案：从 ptnick_<uin> 获取）
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
  // 尝试任何 ptnick_ 开头的 cookie
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

// 获取用户信息（酷狗用 DOM 抓取需要 loginWin）
async function getUserInfo(platform, cookieStr, loginWin) {
  const cookies = await getPlatformCookies(platform);
  const userId = getUserIdFromCookies(platform, cookies);

  // ===== 网易云 =====
  if (platform === 'netease') {
    try {
      const text = await httpsRequest(USER_API.netease, {
        headers: { 'Referer': 'https://music.163.com', 'Cookie': cookieStr },
      });
      const raw = safeJsonParse(text);
      if (raw?.profile) {
        return {
          platform,
          nickname: raw.profile.nickname || '',
          avatar: raw.profile.avatarUrl || '',
          userId: String(raw.profile.userId || ''),
          vip: (raw.profile.vipType || 0) > 0,
          vipName: (raw.profile.vipType || 0) > 0 ? '黑胶VIP' : '',
        };
      }
    } catch (e) {
      console.warn('[IvyM] Netease API failed:', e.message);
    }
    return { platform, nickname: '', avatar: '', userId, vip: false, vipName: '' };
  }

  // ===== QQ音乐（Mineradio 方案：fcg_get_profile_homepage.fcg） =====
  if (platform === 'qq') {
    const cookieObj = {};
    cookies.forEach(c => { cookieObj[c.name] = c.value; });

    // 1. 从 cookie 提取昵称/头像（响应式，不需要 API）
    const cookieNick = qqNicknameFromCookie(cookieObj, userId);
    const cookieAvatar = qqAvatarFromCookie(cookieObj);

    // 2. 调用 QQ profile homepage API（GET，不是 POST）
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
      console.log('[IvyM] QQ profile API response:', JSON.stringify(raw).slice(0, 400));

      // 解析 creator 数据
      const data = raw?.data || raw?.profile || raw?.creator || raw?.result || {};
      const creator = data.creator || data.user || data.profile || data || {};
      const vipInfo = data.vipInfo || data.vipinfo || data.vip || {};

      const profileNick = creator.nick || creator.nickname || creator.name || creator.hostname || creator.title || '';
      const profileAvatar = creator.headpic || creator.avatar || creator.avatarUrl || creator.logo || '';

      // 合并优先级：API creator → cookie → 合成头像
      const nickname = profileNick || cookieNick || (userId ? 'QQ ' + userId : 'QQ 音乐');
      const avatar = profileAvatar || cookieAvatar || qqAvatarUrl(userId);

      // VIP 检测
      const vipType = Number(
        cookieObj.vipType || cookieObj.vip_type || data.vipType || data.vip_type ||
        creator.vipType || creator.vip_type || vipInfo.vipType || 0
      ) || 0;
      const isVip = vipType > 0 || data.isVip || creator.isVip || vipInfo.isVip;

      return {
        platform,
        nickname,
        avatar,
        userId,
        vip: !!isVip,
        vipName: isVip ? '绿钻会员' : '',
      };
    } catch (e) {
      console.warn('[IvyM] QQ profile API failed:', e.message);
    }

    // API 失败 fallback：用 cookie 信息
    return {
      platform,
      nickname: cookieNick || (userId ? 'QQ ' + userId : 'QQ 音乐'),
      avatar: cookieAvatar || qqAvatarUrl(userId),
      userId,
      vip: false,
      vipName: '',
    };
  }

  // ===== 酷狗（DOM 抓取，比 API 更稳定） =====
  if (platform === 'kugou') {
    const cookieObj = {};
    cookies.forEach(c => { cookieObj[c.name] = c.value; });

    let user = { nickname: '', avatar: '' };
    try {
      if (loginWin && !loginWin.isDestroyed()) {
        user = await loginWin.webContents.executeJavaScript(`
          (() => {
            const avatar = document.querySelector(
              '.user-avatar img, img[class*="avatar"], img[class*="head"], .userHead img, .userInfo img, img[src*="head"]'
            )?.src || '';
            const nickname = document.querySelector(
              '.user-name, .nickname, .username, [class*="userName"], [class*="user_name"], [class*="nickname"]'
            )?.innerText?.trim() || '';
            return { nickname, avatar };
          })()
        `, true);
        console.log('[IvyM] KuGou DOM result:', JSON.stringify(user));
      }
    } catch (e) {
      console.warn('[IvyM] KuGou DOM error:', e.message);
    }

    return {
      platform,
      nickname: user?.nickname || cookieObj['nickname'] || '酷狗用户',
      avatar: user?.avatar || cookieObj['head'] || '',
      userId,
      vip: false,
      vipName: '',
    };
  }

  return null;
}

// 打开平台官方登录窗口（独立 partition + 轮询 cookie + 自动关窗 + DOM 抓取用户信息）
// ==================== 登录入口：按平台分流 ====================
ipcMain.handle('login:open', async (event, platform) => {
  const method = LOGIN_METHOD[platform] || 'browser';

  if (method === 'qrcode') {
    // 酷狗走官方 QR API
    return openKuGouQRLogin(platform);
  }

  // 网易云/QQ 走浏览器
  return openBrowserLogin(platform);
});

// ==================== 网易云/QQ：浏览器登录 ====================
function openBrowserLogin(platform) {
  const url = PLATFORM_LOGIN_URLS[platform];
  const partition = getPartition(platform);

  return new Promise((resolve) => {
    // 先检查是否已登录
    getPlatformCookies(platform).then((existing) => {
      if (hasLoginCookies(platform, existing)) {
        console.log(`[IvyM] ${platform} already logged in, auto-binding...`);
        const cookieStr = existing.map(c => `${c.name}=${c.value}`).join('; ');
        const userId = getUserIdFromCookies(platform, existing);
        mainWin?.webContents.send('login:result', {
          platform,
          success: true,
          cookie: cookieStr,
          user: { platform, nickname: '', avatar: '', userId, vip: false, vipName: '' },
        });
        return resolve({ platform, success: true });
      }

      let settled = false;

      const loginWin = new BrowserWindow({
        width: 900,
        height: 680,
        minWidth: 700,
        minHeight: 500,
        title: `绑定${platform === 'netease' ? '网易云音乐' : 'QQ音乐'}账号`,
        autoHideMenuBar: true,
        icon: path.join(__dirname, '../build/logo.png'),
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          partition,
        },
      });

      const finish = async (result) => {
        if (settled) return;
        settled = true;
        clearInterval(pollTimer);
        if (!loginWin.isDestroyed()) loginWin.close();
        mainWin?.webContents.send('login:result', result);
        resolve(result);
      };

      const pollTimer = setInterval(async () => {
        try {
          const cookies = await getPlatformCookies(platform);
          if (hasLoginCookies(platform, cookies)) {
            const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
            const userInfo = await getUserInfo(platform, cookieStr, loginWin);
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

      loginWin.loadURL(url);
    });
  });
}

// ==================== 酷狗：官方 QR 登录 ====================
async function openKuGouQRLogin(platform) {
  // 1) 获取 QR key
  const keyRes = await httpsRequest(
    'https://login-user.kugou.com/v2/qrcode',
    {
      method: 'GET',
      params: { appid: KUGOU_APPID, type: 1, plat: 4, srcappid: KUGOU_SRCAPPID },
    }
  ).catch(() => null);

  const key = keyRes?.body?.data?.key || keyRes?.data?.key;
  if (!key) {
    mainWin?.webContents.send('login:result', { platform, success: false, msg: '获取二维码失败' });
    return { platform, success: false };
  }

  // 2) 生成本地 QR 图片
  const loginUrl = `https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=${key}`;
  const qrBase64 = await qrcode.toDataURL(loginUrl, { width: 300, margin: 2 });

  // 3) 创建 QR 展示窗口
  return new Promise((resolve) => {
    let settled = false;

    const qrWin = new BrowserWindow({
      width: 400,
      height: 500,
      title: '绑定酷狗音乐',
      autoHideMenuBar: true,
      resizable: false,
      icon: path.join(__dirname, '../build/logo.png'),
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });

    // 加载 QR 页面
    qrWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #1a1a2e;
            color: #fff;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            padding: 24px;
          }
          h3 { font-size: 18px; margin-bottom: 8px; }
          p { font-size: 13px; color: #999; margin-bottom: 24px; text-align: center; }
          img { border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
          #status { margin-top: 20px; font-size: 13px; color: #6366f1; min-height: 20px; }
        </style>
      </head>
      <body>
        <h3>🎧 扫描二维码登录酷狗音乐</h3>
        <p>请使用酷狗音乐 APP 扫码</p>
        <img src="${qrBase64}" alt="QR Code" width="260" height="260" />
        <p id="status">等待扫码...</p>
      </body>
      </html>
    `)}`);

    const finish = async (result) => {
      if (settled) return;
      settled = true;
      clearInterval(pollTimer);
      if (!qrWin.isDestroyed()) qrWin.close();
      mainWin?.webContents.send('login:result', result);
      resolve(result);
    };

    // 4) 轮询扫码状态
    const pollTimer = setInterval(async () => {
      try {
        const statusRes = await httpsRequest(
          'https://login-user.kugou.com/v2/get_userinfo_qrcode',
          { params: { plat: 4, appid: KUGOU_APPID, srcappid: KUGOU_SRCAPPID, qrcode: key } }
        ).catch(() => null);

        const status = statusRes?.body?.data?.status;

        if (status === 4) {
          // 登录成功！
          const token = statusRes.body.data.token;
          const userid = statusRes.body.data.userid;
          console.log(`[IvyM] KuGou QR login success! userid=${userid}`);

          finish({
            platform,
            success: true,
            cookie: `token=${token}; userid=${userid}`,
            user: { platform, nickname: '', avatar: '', userId: String(userid), vip: false, vipName: '' },
          });
        } else if (status === 0) {
          // 二维码过期
          finish({ platform, success: false, msg: '二维码已过期，请重试' });
        }
        // status 1=等待扫码, 2=待确认 → 继续轮询
      } catch { /* ignore */ }
    }, 2000);

    qrWin.on('closed', async () => {
      if (settled) return;
      finish({ platform, success: false, msg: '已取消登录' });
    });
  });
}

// 解绑：网易云/QQ 清数据，酷狗直接废弃 session
ipcMain.handle('login:clear', async (event, platform) => {
  // 酷狗：不清理，直接废弃 partition，下次登录创建全新环境
  if (platform === 'kugou') {
    resetKugouPartition();
    return;
  }

  const partition = getPartition(platform);
  if (!partition) return;
  const ses = session.fromPartition(partition);

  // 1) 清除所有 storage
  await ses.clearStorageData({
    storages: [
      'cookies',
      'localstorage',
      'indexdb',
      'cachestorage',
      'serviceworkers',
      'shadercache',
      'appcache',
      'websql',
      'fileSystems',
    ],
  });

  // 2) 兜底：确保 cookie 真的清掉了
  const remaining = await ses.cookies.get({});
  for (const c of remaining) {
    const protocol = c.secure ? 'https://' : 'http://';
    const domain = c.domain?.startsWith('.') ? c.domain.slice(1) : c.domain || '';
    try { await ses.cookies.remove(`${protocol}${domain}${c.path || '/'}`, c.name); } catch {}
  }

  // 3) 关闭所有网络连接（断开 service worker / websocket）
  await ses.closeAllConnections?.();

  // 4) 清除网络缓存和认证
  await ses.clearCache();
  await ses.clearHostResolverCache();
  await ses.clearAuthCache();

  console.log(`[IvyM] ${platform} session fully cleared (${remaining.length} cookies)`);
});

app.whenReady().then(async () => {
  await initServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
