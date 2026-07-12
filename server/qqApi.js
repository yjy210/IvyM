const http = require('http');
const path = require('path');
const fs = require('fs');

const QQ_API_BASE = 'http://localhost:3200';
const QQ_COOKIE_FILE = path.join(__dirname, '.qq-cookie.json');

function getQQCookie() {
  try {
    return JSON.parse(fs.readFileSync(QQ_COOKIE_FILE, 'utf8')).cookie || '';
  } catch {
    return '';
  }
}

/**
 * 通过 sansenjian/qq-music-api 获取播放地址
 * 输入：songmid
 * 输出：{ success, url, playMode, error }
 *
 * sansenjian/qq-music-api 期望接收 QQ cookie 来提供有权限的播放地址
 */
function getSongUrl(songmid) {
  if (!songmid) return { success: false, error: 'no_song' };

  const qqCookie = getQQCookie();

  const url = new URL(`${QQ_API_BASE}/getMusicPlay`);
  url.searchParams.set('songmid', songmid);

  return new Promise((resolve) => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://y.qq.com',
    };
    if (qqCookie) headers.Cookie = qqCookie;

    const req = http.get(url.toString(), { headers, timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          const playData = json.data?.playUrl?.[songmid];
          const playUrl = playData?.url || '';

          if (playUrl) {
            resolve({ success: true, url: playUrl, playMode: 'full' });
          } else {
            resolve({ success: false, playMode: 'forbidden', error: playData?.error || 'no_url' });
          }
        } catch {
          resolve({ success: false, playMode: 'forbidden', error: 'parse_error' });
        }
      });
    });
    req.on('error', () => resolve({ success: false, playMode: 'forbidden', error: 'network_error' }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ success: false, playMode: 'forbidden', error: 'timeout' }); });
  });
}

module.exports = { getSongUrl };
