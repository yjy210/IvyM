const https = require('https');
const path = require('path');
const fs = require('fs');

const QQ_COOKIE_FILE = path.join(__dirname, '../../.qq-cookie.json');

function getCookie() {
  try { return JSON.parse(fs.readFileSync(QQ_COOKIE_FILE, 'utf8')).cookie || ''; } catch { return ''; }
}

function getUin(cookie) {
  const m = cookie.match(/(?:^|;\s*)(?:uin|wxuin|p_uin)=o?(\d+)/);
  return m ? m[1] : '0';
}

/**
 * QQ音乐播放源Provider
 * 调用QQ官方接口获取真实播放权限
 *
 * @param {string} mid - 歌曲MID
 * @param {string} [quality=m4a] - 音质
 * @returns {object} 统一播放结果
 */
async function playQQ(mid, quality = 'm4a') {
  const cookie = getCookie();
  if (!cookie) {
    return { success: false, playMode: 'forbidden', error: 'login_required' };
  }

  const uin = getUin(cookie);
  const guid = Date.now().toString();
  const filename = quality === 'mp3' ? `M500${mid}.mp3` : `C400${mid}.m4a`;

  const reqData = {
    req_0: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: { guid, songmid: [mid], songtype: [0], uin, loginflag: 1, platform: '20' },
    },
  };

  return new Promise((resolve) => {
    const url = new URL('https://u.y.qq.com/cgi-bin/musicu.fcg');
    url.searchParams.set('g_tk', '5381');
    url.searchParams.set('loginUin', uin);
    url.searchParams.set('hostUin', '0');
    url.searchParams.set('format', 'json');
    url.searchParams.set('inCharset', 'utf8');
    url.searchParams.set('outCharset', '-utf8');
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
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          const info = json.req_0?.data?.midurlinfo?.[0];
          const sip = json.req_0?.data?.sip?.[0] || 'http://isure.stream.qqmusic.qq.com/';
          const purl = info?.purl || '';

          if (!purl) {
            // purl为空：VIP限制或无权限
            return resolve({ success: false, playMode: 'forbidden', error: 'vip_required' });
          }

          // songtype: 0=免费/完整, 1=试听 (QQ部分接口会返回)
          const songtype = info?.songtype || json.req_0?.data?.songtype?.[0];

          resolve({
            success: true,
            url: normalizeUrl(sip + purl),
            playMode: songtype === 1 ? 'trial' : 'full',
            trialDuration: songtype === 1 ? 30 : null,
          });
        } catch {
          resolve({ success: false, playMode: 'forbidden', error: 'parse_error' });
        }
      });
    });
    req.on('error', () => resolve({ success: false, playMode: 'forbidden', error: 'network_error' }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ success: false, playMode: 'forbidden', error: 'timeout' }); });
  });
}

function normalizeUrl(url) {
  if (url.startsWith('https://ws.stream.qqmusic.qq.com/')) {
    return url.replace('https://ws.stream.qqmusic.qq.com/', 'http://isure.stream.qqmusic.qq.com/');
  }
  return url;
}

module.exports = { playQQ };
