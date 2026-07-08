const path = require('path');
const fs = require('fs');
const api = require('NeteaseCloudMusicApi');

// ===== Cookie 持久化 =====
const COOKIE_FILE = path.join(__dirname, '.netease-cookie.json');

function getCookie() {
  try {
    const data = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
    return data.cookie || '';
  } catch {
    return '';
  }
}

function saveCookie(cookie) {
  fs.writeFileSync(
    COOKIE_FILE,
    JSON.stringify({ cookie, time: Date.now() }, null, 2),
  );
  console.log('[IvyM] Netease cookie saved');
}

// ======================== 搜索 ========================
async function neteaseSearch(keyword, limit = 30) {
  const res = await api.search({
    keywords: keyword,
    type: 1, // 单曲
    limit,
    offset: 0,
    cookie: getCookie(),
  });

  // 兼容旧返回格式
  const body = res.body || {};
  const songs = body.result?.songs || [];

  // 收集需要查询封面专辑 ID（去重）
  const albumIds = [...new Set(songs.map(s => s.album?.id).filter(Boolean))];
  const albumPicCache = new Map();

  // 并发获取封面（每个专辑只查一次）
  await Promise.all(
    albumIds.map(async (aid) => {
      try {
        const res = await api.album({ id: aid });
        const picUrl = res.body?.album?.picUrl || '';
        if (picUrl) albumPicCache.set(aid, picUrl);
      } catch { /* ignore */ }
    })
  );

  return {
    code: songs.length > 0 ? 200 : 0,
    data: songs.map(s => ({
      id: String(s.id),
      name: s.name,
      artists: s.artists?.map(a => a.name).join(', ') || '',
      album: s.album?.name || '',
      duration: s.duration,
      source: 'netease',
      vip: s.fee === 1 || s.fee === 4,
      cover: albumPicCache.get(s.album?.id) || '',
    })),
    total: body.result?.songCount || songs.length,
  };
}

// ======================== 播放 URL ========================
async function neteaseSongUrl(id) {
  const res = await api.song_url_v1({
    id,
    level: 'exhigh',
    encodeType: 'flac',
    cookie: getCookie(),
  });

  const body = res.body || {};
  const songData = body.data?.[0];

  if (!songData?.url) {
    // 区分 VIP 限制和真正错误
    return {
      code: 403,
      reason: 'vip_required',
      platform: 'netease',
      message: '当前歌曲为网易云音乐会员专属，请充值会员或登录网易云账号',
    };
  }

  return {
    code: 200,
    data: {
      url: songData.url,
      br: songData.br,
    },
  };
}

// ======================== 歌词 ========================
async function neteaseLyric(id) {
  const res = await api.lyric({
    id,
    cookie: getCookie(),
  });

  // 兼容旧返回格式：返回纯文本 LRC
  const body = res.body || {};
  const lyricText = body.lrc?.lyric || '';

  return {
    code: 200,
    data: lyricText,
  };
}

// ======================== Phase 2: QR 登录 ========================

async function neteaseQrLogin() {
  // 1. 获取 unikey
  const keyRes = await api.login_qr_key({});
  const unikey = keyRes.body?.data?.unikey;
  if (!unikey) return { code: -1, msg: '获取 key 失败' };

  // 2. 生成二维码（base64）
  const qrRes = await api.login_qr_create({ key: unikey, qrimg: true });
  const qrimg = qrRes.body?.data?.qrimg;
  if (!qrimg) return { code: -1, msg: '获取二维码失败' };

  return { code: 200, data: { qrimg, unikey } };
}

async function neteaseQrCheck(unikey) {
  const res = await api.login_qr_check({ key: unikey });
  const code = res.body?.code;
  let cookie = res.body?.cookie || '';

  // DEBUG
  console.log(`[IvyM] QR check: code=${code}, cookieLength=${cookie.length}`);

  // code 803 成功时，cookie 在 res.cookie 数组中
  if (code === 803 && !cookie && Array.isArray(res.cookie) && res.cookie.length > 0) {
    cookie = res.cookie.join(';');
  }

  // 登录成功（code 803）→ 自动保存 cookie
  if (code === 803 && cookie) {
    saveCookie(cookie);
    console.log('[IvyM] Cookie saved!');
  }

  return {
    code,
    msg: res.body?.message || '',
    cookie,
  };
}

async function neteaseUserInfo() {
  const res = await api.user_account({ cookie: getCookie() });
  const profile = res.body?.profile;
  if (!profile) return null;

  const vipType = profile.vipType || 0;
  return {
    nickname: profile.nickname || '',
    avatar: profile.avatarUrl || '',
    userId: String(profile.userId || ''),
    vip: vipType === 11, // 11 = 黑胶VIP
    vipName: vipType === 11 ? '黑胶VIP' : '',
  };
}

module.exports = { neteaseSearch, neteaseSongUrl, neteaseLyric, neteaseQrLogin, neteaseQrCheck, neteaseUserInfo };
