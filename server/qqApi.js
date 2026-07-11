const http = require('http');

const QQ_API_BASE = 'http://localhost:3200';

/**
 * 通过 sansenjian/qq-music-api 获取播放地址
 * 输入：songmid
 * 输出：{ success, url, playMode, error }
 */
function getSongUrl(songmid) {
  return new Promise((resolve) => {
    const url = `${QQ_API_BASE}/getMusicPlay?songmid=${encodeURIComponent(songmid)}`;

    const req = http.get(url, { timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);

          if (json.code === 0 && json.data?.url) {
            resolve({ success: true, url: json.data.url, playMode: 'full' });
          } else {
            resolve({ success: false, playMode: 'forbidden', error: json.msg || 'not_found' });
          }
        } catch {
          resolve({ success: false, playMode: 'forbidden', error: 'parse_error' });
        }
      });
    });

    req.on('error', (e) => resolve({ success: false, playMode: 'forbidden', error: 'network_error' }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ success: false, playMode: 'forbidden', error: 'timeout' }); });
  });
}

module.exports = { getSongUrl };
