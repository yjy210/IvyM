const { app, BrowserWindow, ipcMain, session } = require('electron');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { registerIpcHandlers } = require('./ipc');
const { startApiServer } = require('../server/index');

// 平台登录页 URL
const PLATFORM_LOGIN_URLS = {
  netease: 'https://music.163.com/#/login',
  qq: 'https://y.qq.com/n/ryqq/profile',
};

// 各平台 partition（隔离 session，避免污染主窗口）
const PLATFORM_PARTITIONS = {
  netease: 'persist:ivym-netease-login',
  qq: 'persist:ivym-qq-login',
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
function hasLoginCookies(platform, cookies) {
  const names = cookies.map(c => c.name);
  if (platform === 'netease') return names.includes('MUSIC_U'); // 网易云只认 MUSIC_U
  if (platform === 'qq') return qqHasValidLogin(cookies);
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

// 获取用户信息
async function getUserInfo(platform, cookieStr) {
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

      // VIP 检测：使用 userInfoUI.iconlist
      const iconlist = creator.userInfoUI?.iconlist;
      const isVip = Array.isArray(iconlist) && iconlist.length > 0;
      let vipName = '';
      if (isVip) {
        const iconText = iconlist.map(i => (i.srcUrl || '') + ' ' + (i.ext || '')).join(' ').toLowerCase();
        if (iconText.includes('svip') || iconText.includes('super') || iconText.includes('diamond')) {
          vipName = '豪华绿钻';
        } else if (iconText.includes('vip')) {
          vipName = '绿钻';
        }
      }

      return { platform, nickname, avatar, userId, vip: isVip, vipName };
    } catch (e) {
      console.warn('[IvyM] QQ profile API failed:', e.message);
    }

    return {
      platform,
      nickname: cookieNick || (userId ? 'QQ ' + userId : 'QQ 音乐'),
      avatar: cookieAvatar || qqAvatarUrl(userId),
      userId,
      vip: false,
      vipName: '',
    };
  }

  return null;
}

// ==================== 登录入口 ====================
ipcMain.handle('login:open', async (event, platform) => {
  console.log(`[IvyM] login:open called for platform: ${platform}`);
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
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      // 登录成功 → 保存 cookie 到文件（供 server 使用）
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
      }
      if (!loginWin.isDestroyed()) loginWin.close();
      mainWin?.webContents.send('login:result', result);
      resolve(result);
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

// ==================== 酷狗音乐 QR 登录 ====================

// 获取二维码
ipcMain.handle('login:kugou-qr-key', async () => {
  try {
    const { kugouQrLogin } = require('../server/kugou');
    const result = await kugouQrLogin();
    return result;
  } catch (e) {
    return { code: -1, msg: e.message };
  }
});

// 轮询扫码状态
ipcMain.handle('login:kugou-qr-check', async (event, sigx) => {
  try {
    const { kugouQrCheck } = require('../server/kugou');
    const result = await kugouQrCheck(sigx);
    return result;
  } catch (e) {
    return { code: -1, msg: e.message };
  }
});

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
