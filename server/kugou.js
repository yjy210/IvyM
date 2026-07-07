const http = require('http');

const BASE = 'https://complexsearch.kugou.com';

function kugouRequest(path, params = {}) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({
      format: 'json',
      ...params,
    }).toString();
    const url = `${BASE}${path}?${qs}`;
    const req = http.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.kugou.com',
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

async function kugouSearch(keyword, limit = 30) {
  const res = await kugouRequest('/v2/search/song', {
    keyword,
    pagesize: limit,
    page: 1,
    platform: 'WebFilter',
    userid: '-1',
    clientver: '20000',
    iscorrection: 1,
  });
  if (!res.data?.infos) return { code: 0, data: [] };
  const songs = res.data.infos.map(s => ({
    id: s.songid || s.hash,
    hash: s.hash,
    name: s.songname || s.song_name,
    artists: s.singername || s.singer_name || '',
    album: s.album_name || '',
    duration: s.duration || 0,
    source: 'kugou',
  }));
  return { code: 200, data: songs, total: res.data.total || songs.length };
}

async function kugouSongUrl(hash) {
  const res = await kugouRequest('/v2/search/song', { keyword: hash, pagesize: 1 });
  const info = res.data?.infos?.[0];
  if (!info) return { code: -1, data: null };
  const playUrl = info.appoggurl || info.play_url || info.s3hash;
  return { code: 200, data: { url: playUrl } };
}

module.exports = { kugouSearch, kugouSongUrl };
