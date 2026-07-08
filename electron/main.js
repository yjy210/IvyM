const { app, BrowserWindow, ipcMain, session } = require('electron');
const https = require('https');
const path = require('path');
const { registerIpcHandlers } = require('./ipc');
const { startApiServer } = require('../server/index');

// 平台官方登录页 URL
const PLATFORM_LOGIN_URLS = {
  netease: 'https://music.163.com/#/login',
  qq: 'https://y.qq.com/n/ryqq/profile',
  kugou: 'https://www.kugou.com/',
};

// 各平台 partition（隔离 session，避免污染主窗口）
const PLATFORM_PARTITIONS = {
  netease: 'persist:ivym-netease-login',
  qq: 'persist:ivym-qq-login',
  kugou: 'persist:ivym-kugou-login',
};

// 各平台登录有效的关键 cookie 名（用于判断登录是否成功）
const LOGIN_KEY_COOKIES = {
  netease: ['MUSIC_U', '__csrf', 'os'],
  // QQ 需要同时有 uin + music key (qm_keyst/qqmusic_key/music_key/skey)
  qq: ['uin', 'music_u', 'qm_keyst', 'qqmusic_key'],
  kugou: ['kg_mid', 'KuGoo', 'KG_FID', 'userid'],
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

// 平台用户信息 API
const USER_API = {
  netease: 'https://music.163.com/api/nuser/account/get',
  qq: 'https://u.y.qq.com/cgi-bin/musicu.fcg',
  kugou: 'https://www.kugou.com/UserInfo/User',
};

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

// 判断是否已有关键 cookie（登录成功）
function hasLoginCookies(platform, cookies) {
  if (platform === 'qq') return qqHasValidLogin(cookies);
  const keys = LOGIN_KEY_COOKIES[platform] || [];
  const names = cookies.map(c => c.name);
  return keys.some(k => names.includes(k));
}

// 通用 https 请求（支持 GET/POST）
function httpsRequest(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(data); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

// 带 cookie 请求用户信息
async function fetchUserInfo(platform, cookieStr) {
  if (platform === 'netease') {
    return httpsRequest(USER_API.netease, {
      headers: { 'Referer': 'https://music.163.com', 'Cookie': cookieStr },
    });
  }
  if (platform === 'qq') {
    // QQ 需要 POST JSON 到 musicu.fcg 获取用户信息（和 Mineradio 一致）
    const uinMatch = cookieStr.match(/(?:uin|wxuin|p_uin)=([^;]+)/);
    const uin = uinMatch ? uinMatch[1].replace(/^o0*/, '') : '';
    const body = JSON.stringify({
      comm: { cv: 4747474, ct: 24, format: 'json', inCharset: 'utf-8', outCharset: 'utf-8', notice: 0, platform: 'yqq', needNewCode: 1, uin: parseInt(uin) || 0 },
      req_1: { module: 'music.UserInfoServer', method: 'GetLoginUserInfo', param: {} },
    });
    return httpsRequest(USER_API.qq, {
      method: 'POST',
      headers: { 'Referer': 'https://y.qq.com', 'Cookie': cookieStr },
      body,
    });
  }
  if (platform === 'kugou') {
    const cookies = await getPlatformCookies(platform);
    const info = { cookie: cookieStr };
    cookies.forEach(c => { info[c.name] = c.value; });
    return info;
  }
  return null;
}

// 解析各平台用户信息（平台返回什么就显示什么，不替换）
function parseUserInfo(platform, raw) {
  if (!raw) return null;

  // 网易云
  if (platform === 'netease') {
    if (!raw.profile) return null;
    return {
      platform,
      nickname: raw.profile.nickname || '',
      avatar: raw.profile.avatarUrl || '',
      userId: String(raw.profile.userId || ''),
      vip: (raw.profile.vipType || 0) > 0,
      vipName: (raw.profile.vipType || 0) > 0 ? '黑胶VIP' : '',
    };
  }

  // QQ音乐 — 从 musicu.fcg 响应解析（Mineradio 兼容结构）
  if (platform === 'qq') {
    // 结构可能是 { req_1: { data: { creator: {...} } } } 或 { data: { creator: {...} } }
    const qqData = raw.req_1?.data || raw.data || raw;
    const creator = qqData.creator || qqData;
    const uin = String(qqData.uin || raw.uin || '');

    // 平台返回什么昵称就用什么（可能是 "用户12345" 这样的默认昵称）
    const nickname = creator?.nick || creator?.nickname || creator?.name ||
      creator?.hostname || creator?.title || qqData.nickname || '';
    // 平台返回什么头像就用什么（可能是空白图）
    const avatar = creator?.headpic || creator?.avatar || creator?.avatarUrl ||
      creator?.logo || qqData.headpic || qqData.avatar || '';

    return {
      platform,
      nickname,
      avatar,
      userId: uin,
      vip: (qqData.vipType || qqData.vip_type || 0) > 0,
      vipName: (qqData.vipType || qqData.vip_type || 0) > 0 ? '绿钻会员' : '',
    };
  }

  // 酷狗 — cookie 通常没有昵称/头像，返回空即可（前端会显示 placeholder）
  if (platform === 'kugou') {
    const userid = raw.userid || raw.KG_FID || raw.kg_mid || raw.USERID || '';
    return {
      platform,
      nickname: raw.nickname || raw.Nickname || raw.nick || '',
      avatar: raw.head || raw.avatar || raw.Head || raw.LOGO || '',
      userId: String(userid),
      vip: false,
      vipName: '',
    };
  }

  return null;
}

// 打开平台官方登录窗口（Mineradio 方案：独立 partition + 轮询 cookie + 自动关窗）
ipcMain.handle('login:open', async (event, platform) => {
  const url = PLATFORM_LOGIN_URLS[platform] || 'https://music.163.com/#/login';
  const partition = PLATFORM_PARTITIONS[platform];

  // 先检查 partition 中是否已有有效 cookie（之前登录过，还没过期）
  const existing = await getPlatformCookies(platform);
  if (hasLoginCookies(platform, existing)) {
    console.log(`[IvyM] ${platform} already logged in (cookie exists), auto-binding...`);
    const cookieStr = existing.map(c => `${c.name}=${c.value}`).join('; ');
    try {
      const raw = await fetchUserInfo(platform, cookieStr);
      const userInfo = parseUserInfo(platform, raw);
      if (userInfo && userInfo.nickname) {
        mainWin?.webContents.send('login:result', { platform, success: true, cookie: cookieStr, user: userInfo });
        return { platform, success: true, user: userInfo };
      }
    } catch (e) {
      console.warn(`[IvyM] ${platform} cached cookie API failed, opening window...`);
    }
  }

  return new Promise((resolve) => {
    let settled = false;

    const loginWin = new BrowserWindow({
      width: 900,
      height: 680,
      minWidth: 700,
      minHeight: 500,
      title: `绑定${platform === 'netease' ? '网易云音乐' : platform === 'qq' ? 'QQ音乐' : '酷狗音乐'}账号`,
      autoHideMenuBar: true,
      icon: path.join(__dirname, '../build/logo.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        partition,
      },
    });

    // 完成 + 发消息 + 关窗
    const finish = async (result) => {
      if (settled) return;
      settled = true;
      clearInterval(pollTimer);
      if (!loginWin.isDestroyed()) loginWin.destroy();
      mainWin?.webContents.send('login:result', result);
      resolve(result);
    };

    // 轮询 cookie，每秒检测一次
    const pollTimer = setInterval(async () => {
      try {
        const cookies = await getPlatformCookies(platform);
        if (hasLoginCookies(platform, cookies)) {
          console.log(`[IvyM] ${platform} login cookie detected, fetching user...`);
          const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          let userInfo = null;
          try {
            const raw = await fetchUserInfo(platform, cookieStr);
            userInfo = parseUserInfo(platform, raw);
          } catch (apiErr) {
            console.warn(`[IvyM] ${platform} API failed: ${apiErr.message}, using cookie fallback`);
          }
          // API 失败但有 cookie → 从 cookie 提取基本信息
          if (!userInfo || !userInfo.nickname) {
            userInfo = parseUserInfo(platform, Object.fromEntries(cookies.map(c => [c.name, c.value])));
          }
          if (userInfo && (userInfo.nickname || userInfo.userId)) {
            finish({ platform, success: true, cookie: cookieStr, user: userInfo });
          }
        }
      } catch { /* ignore */ }
    }, 1000);

    // 窗口被用户关闭 → 尝试最后一次抓 cookie
    loginWin.on('closed', async () => {
      if (settled) return;
      const cookies = await getPlatformCookies(platform);
      if (hasLoginCookies(platform, cookies)) {
        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        try {
          const raw = await fetchUserInfo(platform, cookieStr);
          const userInfo = parseUserInfo(platform, raw);
          if (userInfo?.nickname) {
            finish({ platform, success: true, cookie: cookieStr, user: userInfo });
            return;
          }
        } catch {}
      }
      finish({ platform, success: false, msg: '已取消登录' });
    });

    loginWin.loadURL(url);
  });
});

// 解绑：清除该平台 partition 的所有 cookie/storage
ipcMain.handle('login:clear', async (event, platform) => {
  const partition = PLATFORM_PARTITIONS[platform];
  if (!partition) return;
  const ses = session.fromPartition(partition);
  // 清除该 partition 的所有 cookie
  const urls = COOKIE_URLS[platform] || [];
  for (const url of urls) {
    const cookies = await ses.cookies.get({ url });
    for (const c of cookies) {
      await ses.cookies.remove(url, c.name);
    }
  }
  // 清除 localStorage / cache
  await ses.clearStorageData({ storages: ['localstorage', 'indexdb', 'cachestorage'] });
  console.log(`[IvyM] ${platform} session cleared`);
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
