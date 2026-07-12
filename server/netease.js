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
async function neteaseSearch(keyword, limit = 30, offset = 0) {
  const res = await api.search({
    keywords: keyword,
    type: 1, // 单曲
    limit,
    offset,
    cookie: getCookie(),
  });

  // 兼容旧返回格式
  const body = res.body || {};
  const songs = body.result?.songs || [];

  // 批量获取真实封面 URL（search 接口不返回 picUrl，需要 song_detail）
  const coverMap = new Map();
  if (songs.length > 0) {
    try {
      const ids = songs.map(s => s.id).join(',');
      const detail = await api.song_detail({ ids, cookie: getCookie() });
      detail.body?.songs?.forEach(s => {
        if (s.id && s.al?.picUrl) coverMap.set(String(s.id), s.al.picUrl);
      });
    } catch { /* 忽略封面获取失败 */ }
  }

  return {
    code: songs.length > 0 ? 200 : 0,
    data: songs.map(s => ({
      id: String(s.id),
      name: s.name,
      artists: s.artists?.map(a => a.name).join(', ') || '',
      album: s.album?.name || '',
      duration: s.duration,
      platform: 'netease',
      cover: coverMap.get(String(s.id)) || '',
      badge: { vip: s.fee === 1 || s.fee === 4 },
      // 默认允许试听，完整播放需要VIP（前端校验）
      availability: { trial: true, full: s.fee !== 1 && s.fee !== 4 },
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
    return { code: 403, reason: 'unavailable', message: '无法获取播放链接' };
  }

  // freeTrialInfo 存在 = 试听，否则 = 完整
  const isTrial = !!songData.freeTrialInfo;

  return {
    code: 200,
    data: {
      url: songData.url,
      playMode: isTrial ? 'trial' : 'full',
      trialDuration: isTrial ? 30 : null,
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

  // code 803 成功时，完整 cookie 在 res.cookie 数组中
  if (code === 803 && Array.isArray(res.cookie) && res.cookie.length > 0) {
    cookie = res.cookie.join(';');
  }

  // 登录成功（code 803）→ 自动保存 cookie
  if (code === 803 && cookie) {
    saveCookie(cookie);
    console.log('[IvyM] Netease login success, cookie saved');
  }

  return {
    code,
    msg: res.body?.message || '',
    cookie,
  };
}

async function neteaseUserInfo() {
  const res = await api.user_account({ cookie: getCookie() });
  const account = res.body?.account;
  const profile = res.body?.profile;
  if (!profile && !account) return null;

  // 网易云会员解析 — 与 QQ provider 返回同一结构 { status, provider, level, name, icon }
  // 注意：网易云 API 不返回官方 icon URL（vip.iconUrl 始终 null），
  // 因此 icon 字段置 null，由前端按 level 选择本地 SVG 资源
  return parseNeteaseMembership(profile, account);
}

/**
 * 网易云会员身份解析
 * 输入：{ account, profile }（api.user_account 返回的原始 body）
 * 输出：标准 NeteaseMembership { status, provider, level, name, icon, nickname, avatar, userId }
 */
function parseNeteaseMembership(profile, account) {
  // VIP 检测：11=黑胶VIP, 110=黑胶SVIP（网易云不区分 SVIP/普通 VIP，统一返回固定值）
  const av = account?.vipType || 0;
  const pv = profile?.vipType || 0;
  const maxVip = Math.max(
    [11, 110].includes(av) ? av : 0,
    [11, 110].includes(pv) ? pv : 0,
  );

  // level 决定前端加载哪个本地 SVG
  // black_vip  → /icons/vip-netease.svg       (红底 VIP)
  // black_svip → /icons/vip-netease-svip.svg  (红底 SVIP) [可选：可复用同一张]
  let membership;
  if (maxVip === 110) {
    membership = {
      status: 'vip',
      provider: 'netease',
      level: 'black_svip',
      name: '黑胶SVIP',
      icon: null,
    };
  } else if (maxVip === 11) {
    membership = {
      status: 'vip',
      provider: 'netease',
      level: 'black_vip',
      name: '黑胶VIP',
      icon: null,
    };
  } else {
    membership = {
      status: 'normal',
      provider: 'netease',
      level: null,
      name: null,
      icon: null,
    };
  }

  return {
    nickname: profile?.nickname || account?.nickname || '',
    avatar: profile?.avatarUrl || '',
    userId: String(profile?.userId || account?.id || ''),
    vip: membership?.status === 'vip',
    vipName: membership?.name || '',
    membership,
  };
}

module.exports = { neteaseSearch, neteaseSongUrl, neteaseLyric, neteaseQrLogin, neteaseQrCheck, neteaseUserInfo, saveCookie };
