const path = require('path');
const fs = require('fs');
const api = require('NeteaseCloudMusicApi');

// ===== Cookie 持久化（Phase 2 登录后自动填充，Phase 1 暂为空）=====
const COOKIE_FILE = path.join(__dirname, '.netease-cookie.json');

function getCookie() {
  try {
    return JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
  } catch {
    return '';
  }
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

  return {
    code: songs.length > 0 ? 200 : 0,
    data: songs.map(s => ({
      id: String(s.id),
      name: s.name,
      artists: s.artists?.map(a => a.name).join(', ') || '',
      album: s.album?.name || '',
      duration: s.duration,
      source: 'netease',
      fee: s.fee || 0,
      cover: s.album?.picUrl || '',
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

  // 兼容旧返回格式
  const body = res.body || {};
  const songData = body.data?.[0];

  if (!songData?.url) {
    return { code: -1, data: null };
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

// ======================== 以下函数保持原样（Phase 2 再改） ========================

async function neteaseQrLogin() {
  const keyRes = await api.login_qr_key({ timer: Date.now() });
  if (!keyRes.body?.unikey) return { code: -1, msg: '获取 key 失败' };
  const qrRes = await api.login_qr_create({ key: keyRes.body.unikey, qrimg: 1, timer: Date.now() });
  if (!qrRes.body?.qrimg) return { code: -1, msg: '获取二维码失败' };
  return { code: 200, data: { qrimg: qrRes.body.qrimg, unikey: keyRes.body.unikey } };
}

async function neteaseQrCheck(unikey) {
  const res = await api.login_qr_check({ key: unikey, timer: Date.now() });
  return { code: res.body?.code, msg: res.body?.message || '', cookie: res.body?.cookie || '' };
}

async function neteaseUserInfo(cookie) {
  const res = await api.user_account({ cookie });
  const profile = res.body?.profile;
  if (!profile) return {};
  return { body: { profile: profile.profile || profile } };
}

module.exports = { neteaseSearch, neteaseSongUrl, neteaseLyric, neteaseQrLogin, neteaseQrCheck, neteaseUserInfo };
