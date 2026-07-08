const http = require('http');
const { neteaseSearch, neteaseSongUrl, neteaseLyric, neteaseQrLogin } = require('./netease');
const { qqSearch, qqSongUrl, qqQrLogin } = require('./qq');
const { kugouSearch, kugouSongUrl, kugouQrLogin } = require('./kugou');

const PORT = 3001;

const server = http.createServer(async (req, res) => {
  // CORS（允许 Electron 渲染进程跨域调用）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    // ===== 网易云 =====
    if (url.pathname === '/api/netease/search') {
      const keyword = url.searchParams.get('keyword') || '';
      const limit = parseInt(url.searchParams.get('limit') || '30');
      const data = await neteaseSearch(keyword, limit);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }
    if (url.pathname === '/api/netease/url') {
      const id = url.searchParams.get('id') || '';
      const data = await neteaseSongUrl(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }
    if (url.pathname === '/api/netease/lyric') {
      const id = url.searchParams.get('id') || '';
      const data = await neteaseLyric(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    // ===== QQ音乐 =====
    if (url.pathname === '/api/qq/search') {
      const keyword = url.searchParams.get('keyword') || '';
      const limit = parseInt(url.searchParams.get('limit') || '30');
      const data = await qqSearch(keyword, limit);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }
    if (url.pathname === '/api/qq/url') {
      const mid = url.searchParams.get('mid') || '';
      const data = await qqSongUrl(mid);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    // ===== 酷狗 =====
    if (url.pathname === '/api/kugou/search') {
      const keyword = url.searchParams.get('keyword') || '';
      const limit = parseInt(url.searchParams.get('limit') || '30');
      const data = await kugouSearch(keyword, limit);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }
    if (url.pathname === '/api/kugou/url') {
      const hash = url.searchParams.get('hash') || '';
      const data = await kugouSongUrl(hash);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    // ===== 登录 =====
    // 网易云 QR 码登录
    if (url.pathname === '/api/netease/login/qr') {
      const qr = await neteaseQrLogin();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(qr));
      return;
    }
    // QQ音乐 QR 码登录
    if (url.pathname === '/api/qq/login/qr') {
      const qr = await qqQrLogin();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(qr));
      return;
    }
    // 酷狗 QR 码登录
    if (url.pathname === '/api/kugou/login/qr') {
      const qr = await kugouQrLogin();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(qr));
      return;
    }

    // 根路径
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', name: 'IvyM API Server', version: '0.1.0' }));
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found', path: url.pathname }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

function startApiServer(port = PORT) {
  return new Promise((resolve, reject) => {
    server.listen(port, () => resolve(server));
    server.on('error', reject);
  });
}

// 直接运行时启动
if (require.main === module) {
  startApiServer().then(() => {
    console.log(`[IvyM] API Server running on http://localhost:${PORT}`);
  });
}

module.exports = { startApiServer, server };
