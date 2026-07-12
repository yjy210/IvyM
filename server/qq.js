const https = require('https');
const path = require('path');
const fs = require('fs');

const BASE = 'https://c.y.qq.com';

// QQ 音乐 cookie 文件
const QQ_COOKIE_FILE = path.join(__dirname, '.qq-cookie.json');

function getQQCookie() {
  try {
    return JSON.parse(fs.readFileSync(QQ_COOKIE_FILE, 'utf8')).cookie || '';
  } catch {
    return '';
  }
}

function saveQQCookie(cookie) {
  fs.writeFileSync(
    QQ_COOKIE_FILE,
    JSON.stringify({ cookie, time: Date.now() }, null, 2),
  );
  console.log('[IvyM] QQ cookie saved');
}

function qqRequest(path, params = {}) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf-8',
      notice: 0,
      ...params,
    }).toString();
    const url = `${BASE}${path}?${qs}`;
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://y.qq.com',
        'Cookie': getQQCookie(),
      },
    }, (res) => {
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

async function qqSearch(keyword, limit = 30, page = 1) {
  const res = await qqRequest('/soso/fcgi-bin/client_search_cp', {
    w: keyword,
    n: limit,
    p: page,
    cr: 1,
  });
  if (!res.data?.song?.list) return { code: 0, data: [], total: 0 };
  const songs = res.data.song.list.map(s => ({
    id: s.songid,
    mid: s.songmid,
    name: s.songname,
    artists: s.singer?.map(a => a.name).join(', ') || '',
    album: s.albumname || '',
    duration: s.interval ? s.interval * 1000 : 0,
    platform: 'qq',
    cover: s.albummid ? `https://y.qq.com/music/photo_new/T002R300x300M000${s.albummid}.jpg` : '',
    badge: { vip: s.pay?.payplay === 1 },
    // QQ音乐：后端通常返回完整URL，非会员也能播放
    availability: { trial: true, full: true },
  }));
  return { code: 200, data: songs, total: res.data.song.totalnum || songs.length };
}

// 从 cookie 字符串提取 uin
function getUinFromCookie(cookieStr) {
  const match = cookieStr.match(/(?:^|;\s*)(?:uin|wxuin|p_uin)=o?(\d+)/);
  return match ? match[1] : '0';
}

async function qqSongUrl(mid, quality = 'm4a') {
  const cookie = getQQCookie();
  if (!cookie) {
    return { code: -1, data: null, msg: '请先登录QQ音乐' };
  }

  const uin = getUinFromCookie(cookie);
  const guid = Date.now().toString(); // 简单用时间戳，足够用

  // 文件名映射
  const filenameMap = { m4a: `C400${mid}.m4a`, mp3: `M500${mid}.mp3` };
  const filename = filenameMap[quality] || filenameMap.m4a;

  const reqData = {
    req_0: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: {
        guid,
        songmid: [mid],
        songtype: [0],
        uin,
        loginflag: 1,
        platform: '20',
      },
    },
  };

  return new Promise((resolve) => {
    const url = new URL('https://u.y.qq.com/cgi-bin/musicu.fcg');
    url.searchParams.set('g_tk', '5381');
    url.searchParams.set('loginUin', uin);
    url.searchParams.set('hostUin', '0');
    url.searchParams.set('format', 'json');
    url.searchParams.set('inCharset', 'utf8');
    url.searchParams.set('outCharset', 'utf-8');
    url.searchParams.set('notice', '0');
    url.searchParams.set('platform', 'yqq.json');
    url.searchParams.set('needNewCode', '0');
    url.searchParams.set('data', JSON.stringify(reqData));

    const req = https.get(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://y.qq.com',
        'Cookie': cookie,
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          const info = json.req_0?.data?.midurlinfo?.[0];
          const sip = json.req_0?.data?.sip?.[0] || 'http://isure.stream.qqmusic.qq.com/';
          const purl = info?.purl || '';
          if (!purl) {
            // purl 为空 → VIP 或不可用，统一返回 403 与网易云一致
            resolve({ code: 403, reason: 'vip_required', msg: '该歌曲需要VIP或不可播放' });
            return;
          }
          // QQ音乐：后端始终返回完整URL，非会员也能播放
          resolve({ code: 200, data: { url: sip + purl, playMode: 'full', trialDuration: null } });
        } catch {
          resolve({ code: -1, data: null, msg: '解析播放链接失败' });
        }
      });
    });
    req.on('error', (e) => resolve({ code: -1, data: null, msg: '网络错误: ' + e.message }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ code: -1, data: null, msg: '请求超时' }); });
  });
}

async function qqQrLogin() {
  const res = await qqRequest('/cgi-bin/qrlogin/login', {
    _: Date.now(),
    g_tk: 5381,
    uin: 0,
    format: 'json',
    inCharset: 'utf-8',
    outCharset: 'utf-8',
    notice: 0,
    platform: 'yqq',
    uid: 0,
    g_tk_openkey: 0,
  });
  if (!res.qrcode) return { code: -1, msg: '获取二维码失败' };
  return { code: 200, data: { qrimg: res.qrcode, sigx: res.sigx || '' } };
}

async function qqQrCheck(sigx) {
  const res = await qqRequest('/cgi-bin/qrlogin/ptqrlogin', {
    _: Date.now(),
    g_tk: 5381,
    uin: 0,
    format: 'json',
    inCharset: 'utf-8',
    outCharset: 'utf-8',
    notice: 0,
    platform: 'yqq',
    uid: 0,
    g_tk_openkey: 0,
    pt_uisted: 0,
    ptwebqq: '',
    pt_randsig: sigx,
    pt_guid_sig: '',
    pt_no_auth: 0,
    pt_login_type: 3,
  });
  return { code: res.errcode, msg: res.msg || '', cookie: res.cookie || '', uin: res.uin || 0 };
}

// QQ 会员身份解析 —— 基于真实 dump 的字段判断（3 样本已验证）
//
// 主信号：userInfoUI.iconlist[0].srcUrl 的文件名（严格匹配，非 includes）
//   svip1.png     → 超级VIP
//   vip1.png      → 豪华绿钻
//   其他 (d- 前缀等) → 普通用户
//
// 为什么取 [0] 而不是遍历：iconlist[1] 之后是 d- 系列的购买/续费入口，
// 连豪华绿钻账号也会有 d-vip1.png，不能参与判断。
//
// 为什么用 split("/").pop() 严格匹配而非 includes()：防止未来出现
// d-svip1.png 时 includes("svip1.png") 误判为超级VIP。
function parseQQMembership(user) {
  const icon = user?.userInfoUI?.iconlist?.[0]?.srcUrl ?? '';
  const filename = icon.split('/').pop();

  switch (filename) {
    case 'svip1.png':
      return {
        status: 'vip',
        provider: 'qq',
        level: 'super_vip',
        name: '超级会员',
        icon: icon || null,
      };
    case 'vip1.png':
      return {
        status: 'vip',
        provider: 'qq',
        level: 'green_diamond',
        name: '豪华绿钻',
        icon: icon || null,
      };
    default:
      // d-xfvip1.png / d-vip1.png / d-svip1.png 等 → 普通用户
      return {
        status: 'normal',
        provider: 'qq',
        level: null,
        name: null,
        icon: null,
      };
  }
}

// 由 membership 派生兼容字段，避免前端空指针
function vipFromMembership(m) {
  return {
    isVip: m.status === 'vip',
    vipName: m.name || '',
  };
}

async function qqUserInfo() {
  const cookie = getQQCookie();
  if (!cookie) return null;

  const uin = getUinFromCookie(cookie);
  const url = `https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg?cid=205360838&userid=${uin}&reqfrom=1&reqtype=1`;

  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://y.qq.com',
        'Cookie': cookie,
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          if (j.code !== 0 || !j.data?.creator) {
            resolve(null);
            return;
          }
          const c = j.data.creator;
          const nickname = c.nick || '';
          const avatar = c.headpic || '';

          // 会员识别 —— creator.userInfoUI.iconlist[0].srcUrl 主判断（3 样本验证通过）
          const membership = parseQQMembership(c);
          const compat = vipFromMembership(membership);
          resolve({
            platform: 'qq',
            id: uin,
            nickname,
            avatar,
            userId: uin,
            membership,
            vip: compat.isVip,
            vipName: compat.vipName,
          });
        } catch (e) {
          console.error('[IvyM] qqUserInfo parse error:', e.message);
          resolve(null);
        }
      });
    });
    req.on('error', (e) => {
      console.error('[IvyM] qqUserInfo request error:', e.message);
      resolve(null);
    });
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
  });
}

async function qqSongUrl(mid, quality = 'm4a') {
  const cookie = getQQCookie();
  if (!cookie) {
    return { code: 401, reason: 'login_required', data: null, msg: '请先登录QQ音乐' };
  }

  const uin = getUinFromCookie(cookie);
  const guid = Date.now().toString();

  const filenameMap = {
    m4a: `C400${mid}.m4a`,
    mp3: `M500${mid}.mp3`,
    flac: `F000${mid}.flac`,
    ogg: `O600${mid}.ogg`,
  };
  const filename = filenameMap[quality] || filenameMap.m4a;

  const reqData = {
    req_0: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: { guid, songmid: [mid], songtype: [0], uin, loginflag: 1, platform: '20' },
    },
  };

  const BASE = 'https://u.y.qq.com';
  const qs = new URLSearchParams({
    g_tk: '5381', loginUin: uin, hostUin: '0', format: 'json',
    inCharset: 'utf8', outCharset: 'utf-8', notice: '0', platform: 'yqq.json',
    needNewCode: '0', data: JSON.stringify(reqData),
  });

  return new Promise((resolve) => {
    const req = https.get(`${BASE}/cgi-bin/musicu.fcg?${qs}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://y.qq.com',
        'Cookie': cookie,
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          const info = json.req_0?.data?.midurlinfo?.[0];
          const sip = json.req_0?.data?.sip?.[0] || 'http://isure.stream.qqmusic.qq.com/';
          const purl = info?.purl || '';
          if (!purl) {
            resolve({ code: 403, reason: 'vip_required', data: null, msg: '该歌曲需要VIP或不可播放' });
            return;
          }
          resolve({ code: 200, data: { url: sip + purl, playMode: 'full', trialDuration: null } });
        } catch {
          resolve({ code: -1, data: null, msg: '解析播放链接失败' });
        }
      });
    });
    req.on('error', (e) => resolve({ code: -1, data: null, msg: '网络错误: ' + e.message }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ code: -1, data: null, msg: '请求超时' }); });
  });
}

async function qqLyric(mid) {
  return new Promise((resolve) => {
    const url = new URL('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg');
    url.searchParams.set('songmid', mid);
    url.searchParams.set('g_tk', '5381');
    url.searchParams.set('loginUin', '0');
    url.searchParams.set('hostUin', '0');
    url.searchParams.set('format', 'json');
    url.searchParams.set('inCharset', 'utf8');
    url.searchParams.set('outCharset', 'utf-8');
    url.searchParams.set('notice', '0');
    url.searchParams.set('platform', 'yqq');
    url.searchParams.set('needNewCode', '1');

    const cookie = getQQCookie();
    https.get(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://y.qq.com',
        'Cookie': cookie,
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.code !== 0) {
            resolve({ code: 200, data: '' });
            return;
          }
          const lyric = json.lyric ? Buffer.from(json.lyric, 'base64').toString('utf8') : '';
          const trans = json.trans ? Buffer.from(json.trans, 'base64').toString('utf8') : '';
          resolve({ code: 200, data: lyric, trans });
        } catch (e) {
          console.error('[IvyM] qqLyric parse error:', e.message);
          resolve({ code: 200, data: '' });
        }
      });
    }).on('error', (e) => {
      console.error('[IvyM] qqLyric request error:', e.message);
      resolve({ code: 200, data: '' });
    });
  });
}

module.exports = { qqSearch, qqSongUrl, qqLyric, qqQrLogin, qqQrCheck, qqUserInfo, saveQQCookie };
