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

// 从已登录页面直接抓取用户信息（DOM 抓取，最准确）
async function scrapeFromPage(loginWin, platform) {
  if (loginWin.isDestroyed()) return null;
  try {
    const result = await loginWin.webContents.executeJavaScript(`
      (() => {
        ${platform === 'netease' ? `
          // 网易云：右上角头像+昵称
          const img = document.querySelector('.m-nav .head img, .m-user img, img[src*="music.163"]');
          const nameEl = document.querySelector('.m-nav .name, .s-fc3, .j-txt');
          // 也可能是 #imgbar 头像
          const barImg = document.querySelector('#bar-entity img, .n-bnner img');
          return {
            nickname: nameEl?.textContent?.trim() || document.title.replace(' - 网易云音乐', '') || '',
            avatar: img?.src || barImg?.src || '',
          };
        ` : ''}
        ${platform === 'qq' ? `
          // QQ音乐：顶部用户区域
          const img = document.querySelector('.mod_profile img, .header__user img, .profile__img img, .user_head img, img[class*="avatar"], img[class*="headpic"]');
          const nameEl = document.querySelector('.profile__name, .header__username, .mod_name, .user_name, [class*="nickname"], [class*="user_name"]');
          return {
            nickname: nameEl?.textContent?.trim() || '',
            avatar: img?.src || '',
          };
        ` : ''}
        ${platform === 'kugou' ? `
          // 酷狗：用户区域
          const img = document.querySelector('.userHead img, .userInfo img, .login_info img, .user_head img, .avatar img, img[class*="head"], img[class*="avatar"]');
          const nameEl = document.querySelector('.userName, .user_name, .login_name, .nickname, [class*="userName"], [class*="nick"]');
          return {
            nickname: nameEl?.textContent?.trim() || '',
            avatar: img?.src || '',
          };
        ` : ''}
        return null;
      })()
    `, true);
    return result;
  } catch (e) {
    console.error('[IvyM] scrape failed:', e.message);
    return null;
  }
}

// 解析用户信息 = cookie(userId) + DOM(昵称/头像)
async function getUserInfo(loginWin, platform, cookieStr) {
  const cookies = await getPlatformCookies(platform);
  const userId = getUserIdFromCookies(platform, cookies);

  // 网易云用 API（最准确）
  if (platform === 'netease') {
    try {
      const raw = await httpsRequest(USER_API.netease, {
        headers: { 'Referer': 'https://music.163.com', 'Cookie': cookieStr },
      });
      if (raw.profile) {
        return {
          platform,
          nickname: raw.profile.nickname || '',
          avatar: raw.profile.avatarUrl || '',
          userId: String(raw.profile.userId || ''),
          vip: (raw.profile.vipType || 0) > 0,
          vipName: (raw.profile.vipType || 0) > 0 ? '黑胶VIP' : '',
        };
      }
    } catch {}
    // API 失败 → DOM 抓取
    const scraped = await scrapeFromPage(loginWin, platform);
    if (scraped) {
      return { platform, nickname: scraped.nickname, avatar: scraped.avatar, userId, vip: false, vipName: '' };
    }
    return { platform, nickname: '', avatar: '', userId, vip: false, vipName: '' };
  }

  // QQ 和酷狗：DOM 抓取（最准确）
  const scraped = await scrapeFromPage(loginWin, platform);
  return {
    platform,
    nickname: scraped?.nickname || '',
    avatar: scraped?.avatar || '',
    userId: userId || '',
    vip: false,
    vipName: '',
  };
}

// 打开平台官方登录窗口（独立 partition + 轮询 cookie + 自动关窗 + DOM 抓取用户信息）
ipcMain.handle('login:open', async (event, platform) => {
  const url = PLATFORM_LOGIN_URLS[platform] || 'https://music.163.com/#/login';
  const partition = PLATFORM_PARTITIONS[platform];

  // 先检查 partition 中是否已有有效 cookie（之前登录过，还没过期）
  const existing = await getPlatformCookies(platform);
  if (hasLoginCookies(platform, existing)) {
    console.log(`[IvyM] ${platform} already logged in (cookie exists), auto-binding...`);
    const cookieStr = existing.map(c => `${c.name}=${c.value}`).join('; ');
    const userId = getUserIdFromCookies(platform, existing);
    mainWin?.webContents.send('login:result', {
      platform,
      success: true,
      cookie: cookieStr,
      user: { platform, nickname: '', avatar: '', userId, vip: false, vipName: '' },
    });
    return { platform, success: true };
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
          console.log(`[IvyM] ${platform} login cookie detected, fetching user from page...`);
          const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          const userInfo = await getUserInfo(loginWin, platform, cookieStr);
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
        const userInfo = await getUserInfo(loginWin, platform, cookieStr);
        if (userInfo?.nickname || userInfo?.userId) {
          finish({ platform, success: true, cookie: cookieStr, user: userInfo });
          return;
        }
      }
      finish({ platform, success: false, msg: '已取消登录' });
    });

    loginWin.loadURL(url);
  });
});

// 解绑：彻底清除该平台 partition 的所有数据（cookie + storage + cache）
ipcMain.handle('login:clear', async (event, platform) => {
  const partition = PLATFORM_PARTITIONS[platform];
  if (!partition) return;
  const ses = session.fromPartition(partition);

  // 1) 清除所有 cookie（不限 URL）
  const allCookies = await ses.cookies.get({});
  for (const c of allCookies) {
    // cookie.remove 需要 URL，用 cookie 自己的 domain 拼
    const protocol = c.secure ? 'https://' : 'http://';
    const domain = c.domain?.startsWith('.') ? c.domain.slice(1) : c.domain || '';
    const path = c.path || '/';
    const cookieUrl = `${protocol}${domain}${path}`;
    try { await ses.cookies.remove(cookieUrl, c.name); } catch {}
  }

  // 2) 清除所有 storage
  await ses.clearStorageData({
    storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers', 'websql', 'fileSystems'],
  });

  // 3) 清除整个 partition 的所有数据（兜底）
  await ses.clearCache();
  await ses.clearHostCache();
  await ses.clearAuthCache();

  console.log(`[IvyM] ${platform} session fully cleared (${allCookies.length} cookies)`);
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
