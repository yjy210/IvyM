const http = require('http');

const BASE = 'https://c.y.qq.com';

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
    const req = http.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://y.qq.com',
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

async function qqSearch(keyword, limit = 30) {
  const res = await qqRequest('/soso/fcgi-bin/client_search_cp', {
    w: keyword,
    n: limit,
    p: 1,
    cr: 1,
  });
  if (!res.data?.song?.list) return { code: 0, data: [] };
  const songs = res.data.song.list.map(s => ({
    id: s.songid,
    mid: s.songmid,
    name: s.songname,
    artists: s.singer?.map(a => a.name).join(', ') || '',
    album: s.albumname || '',
    duration: s.interval ? s.interval * 1000 : 0,
    source: 'qq',
  }));
  return { code: 200, data: songs, total: res.data.song.totalnum || songs.length };
}

async function qqSongUrl(mid) {
  // QQ音乐播放链接需要 vkey，这里是简化版
  // 实际生产环境需要完整的 QQ 音乐 API（含 vkey 获取）
  const res = await qqRequest('/base/fcgi-bin/fcg_music_express_mobile3.fcg',
    { songmid: mid, filename: `C400${mid}.m4a`, guid: '123456', platform: 'yqq' }
  );
  const data = res.data?.items?.[0];
  if (!data?.vkey) return { code: -1, data: null, msg: '需要安装QQ音乐cookie' };
  const url = `http://isure.stream.qqmusic.qq.com/C400${mid}.m4a?vkey=${data.vkey}&guid=123456&uin=0&fromtag=66`;
  return { code: 200, data: { url } };
}

module.exports = { qqSearch, qqSongUrl };
