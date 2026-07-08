const { app, BrowserWindow, ipcMain, session } = require('electron');
const https = require('https');
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

      // === 调试日志（分析完删除）===
      console.log('[IvyM DEBUG] Netease API raw text (first 500):', text?.slice(0, 500));
      // === 调试日志结束 ===

      const raw = safeJsonParse(text);

      // === 调试日志（分析完删除）===
      console.log('[IvyM DEBUG] safeJsonParse result:', JSON.stringify(raw)?.slice(0, 500));
      console.log('[IvyM DEBUG] raw.profile exists?', !!raw?.profile);
      console.log('[IvyM DEBUG] raw.account exists?', !!raw?.account);
      console.log('[IvyM DEBUG] raw.code:', raw?.code);
      // === 调试日志结束 ===

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

      const data = raw?.data || raw?.profile || raw?.creator || raw?.result || {};
      const creator = data.creator || data.user || data.profile || data || {};
      const vipInfo = data.vipInfo || data.vipinfo || data.vip || {};

      const profileNick = creator.nick || creator.nickname || creator.name || creator.hostname || creator.title || '';
      const profileAvatar = creator.headpic || creator.avatar || creator.avatarUrl || creator.logo || '';

      const nickname = profileNick || cookieNick || (userId ? 'QQ ' + userId : 'QQ 音乐');
      const avatar = profileAvatar || cookieAvatar || qqAvatarUrl(userId);

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
  const url = PLATFORM_LOGIN_URLS[platform];
  const partition = PLATFORM_PARTITIONS[platform];

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

          // === 调试日志（分析完删除）===
          console.log('\n[IvyM DEBUG] === Login detected ===');
          console.log('[IvyM DEBUG] platform:', platform);
          console.log('[IvyM DEBUG] cookies:', JSON.stringify(cookies.map(c => ({ name: c.name, domain: c.domain, hasValue: !!c.value }))));
          console.log('[IvyM DEBUG] cookieStr includes MUSIC_U:', cookieStr.includes('MUSIC_U'));
          console.log('[IvyM DEBUG] cookieStr includes __csrf:', cookieStr.includes('__csrf'));
          // === 调试日志结束 ===

          const userInfo = await getUserInfo(platform, cookieStr);

          // === 调试日志（分析完删除）===
          console.log('[IvyM DEBUG] userInfo:', JSON.stringify(userInfo));
          console.log('[IvyM DEBUG] finish condition:', !!userInfo, 'nickname?', !!userInfo?.nickname, 'userId?', !!userInfo?.userId);
          // === 调试日志结束 ===

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

// ==================== 解绑 ====================
ipcMain.handle('login:clear', async (event, platform) => {
  const partition = PLATFORM_PARTITIONS[platform];
  if (!partition) return;
  const ses = session.fromPartition(partition);

  // 1) 清除所有 storage
  await ses.clearStorageData({
    storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers', 'websql', 'fileSystems'],
  });

  // 2) 兜底：确保 cookie 清掉
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

  console.log(`[IvyM] ${platform} session cleared (${remaining.length} cookies)`);
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
