const { app, BrowserWindow, ipcMain, session } = require('electron');
const https = require('https');
const path = require('path');
const { registerIpcHandlers } = require('./ipc');
const { startApiServer } = require('../server/index');

// 平台官方登录页 URL
const PLATFORM_LOGIN_URLS = {
  netease: 'https://music.163.com/login',
  qq: 'https://y.qq.com',
  kugou: 'https://www.kugou.com',
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

// 平台官方登录页对应的 cookie 域名
const COOKIE_URLS = {
  netease: ['https://music.163.com', 'https://.music.163.com', 'https://163.com'],
  qq: ['https://qq.com', 'https://.qq.com', 'https://y.qq.com', 'https://.y.qq.com'],
  kugou: ['https://www.kugou.com', 'https://.kugou.com', 'https://kugou.com'],
};

// 平台用户信息 API
const USER_API = {
  netease: 'https://music.163.com/api/nuser/account/get',
  qq: 'https://u.y.qq.com/cgi-bin/musicu.fcg',
  kugou: 'https://www.kugou.com/UserInfo/User',
};

// 抓取指定域名下的 cookie
async function getCookiesForPlatform(platform) {
  const ses = session.defaultSession;
  const urls = COOKIE_URLS[platform] || [];
  let allCookies = [];
  for (const url of urls) {
    const cookies = await ses.cookies.get({ url });
    allCookies = allCookies.concat(cookies);
  }
  // 去重
  const seen = new Set();
  return allCookies.filter(c => {
    const key = `${c.name}=${c.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 带 cookie 请求用户信息（使用 https）
function fetchUserInfo(platform, cookieStr) {
  return new Promise((resolve, reject) => {
    const apiUrl = USER_API[platform];
    if (!apiUrl) return reject(new Error('Unknown platform'));
    const req = https.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': platform === 'netease' ? 'https://music.163.com' : platform === 'qq' ? 'https://y.qq.com' : 'https://www.kugou.com',
        'Cookie': cookieStr,
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// 解析各平台用户信息
function parseUserInfo(platform, raw) {
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
  if (platform === 'qq') {
    // QQ返回格式较复杂
    const user = raw?.data || raw;
    return {
      platform,
      nickname: user.nickname || user.singerName || '',
      avatar: user.headpic || user.avatarUrl || '',
      userId: String(user.uin || user.mid || ''),
      vip: false,
      vipName: '',
    };
  }
  if (platform === 'kugou') {
    if (!raw.userdata) return null;
    return {
      platform,
      nickname: raw.userdata.nickname || '',
      avatar: raw.userdata.head || '',
      userId: String(raw.userdata.userid || ''),
      vip: !!raw.userdata.vip,
      vipName: raw.userdata.vip ? '酷狗VIP' : '',
    };
  }
  return null;
}

// 打开平台官方登录窗口（使用 defaultSession，cookie 直接写入主 session）
ipcMain.handle('login:open', async (event, platform) => {
  const url = PLATFORM_LOGIN_URLS[platform] || 'https://music.163.com/login';

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
      // 不指定 partition → 使用 defaultSession，登录后的 cookie 与主窗口共用
    },
  });

  // 关闭后自动尝试获取用户信息
  loginWin.on('closed', async () => {
    try {
      // 等待一小段时间让 cookie 写入完成
      await new Promise(r => setTimeout(r, 500));
      const cookies = await getCookiesForPlatform(platform);
      const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      console.log(`[IvyM] ${platform} cookies found:`, cookies.length, 'cookieStr length:', cookieStr.length);

      if (!cookieStr) {
        mainWin?.webContents.send('login:result', { platform, success: false, msg: '未检测到登录状态，请确认已登录后关闭窗口' });
        return;
      }

      // 直接用 cookie 去官方 API 抓用户信息
      const raw = await fetchUserInfo(platform, cookieStr);
      console.log(`[IvyM] ${platform} user info raw:`, JSON.stringify(raw).slice(0, 200));
      const userInfo = parseUserInfo(platform, raw);

      if (userInfo && userInfo.nickname) {
        mainWin?.webContents.send('login:result', {
          platform,
          success: true,
          cookie: cookieStr,
          user: userInfo,
        });
      } else {
        mainWin?.webContents.send('login:result', { platform, success: false, msg: '登录已失效，请重新登录' });
      }
    } catch (err) {
      console.error('[IvyM] Login error:', err.message);
      mainWin?.webContents.send('login:result', { platform, success: false, msg: '获取用户信息失败: ' + err.message });
    }
    loginWin.destroy();
  });

  loginWin.loadURL(url);
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
