const http = require('http');
const { neteaseSearch, neteaseSongUrl, neteaseLyric, neteaseQrLogin, neteaseQrCheck, neteaseUserInfo } = require('./netease');
const { qqSearch, qqUserInfo, qqSongUrl, qqSuggest, qqHot } = require('./qq'); // 搜索/用户信息/播放链接(直连QQ官方接口)
const api = require('NeteaseCloudMusicApi');


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
      const page = parseInt(url.searchParams.get('page') || '1');
      const data = await neteaseSearch(keyword, limit, (page - 1) * limit);
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
      const page = parseInt(url.searchParams.get('page') || '1');
      const data = await qqSearch(keyword, limit, page);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }
    if (url.pathname === '/api/qq/lyric') {
      const mid = url.searchParams.get('mid') || '';
      const data = await qqLyric(mid);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }
    if (url.pathname === '/api/qq/url') {
      const mid = url.searchParams.get('mid') || '';
      const quality = url.searchParams.get('quality') || 'm4a';
      const result = await qqSongUrl(mid, quality);
      const httpStatus = [200, 401, 403].includes(result.code) ? result.code : 200;
      res.writeHead(httpStatus, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        code: result.code,
        data: result.data,
        reason: result.reason || null,
        msg: result.msg || (result.code === 200 ? 'ok' : 'cannot_get_url'),
      }));
      return;
    }


    // ===== ★ 搜索结果页接口（与现有搜索页面一致）=====
    // 网易云 热搜榜  NeteaseCloudMusicApi.search_hot → { body: { result: { hots: [{ first }] } } }
    if (url.pathname === '/api/netease/search/hot') {
      const data = await api.search_hot({});
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data.body || data));
      return;
    }
    // 网易云 搜索联想  NeteaseCloudMusicApi.search_suggest → { body: { result: { allMatch: [{ keyword }] } } }
    if (url.pathname === '/api/netease/search/suggest') {
      const keyword = url.searchParams.get('keyword') || '';
      const data = await api.search_suggest({ keywords: keyword, type: 'mobile' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data.body || data));
      return;
    }
    // QQ音乐 热搜榜
    if (url.pathname === '/api/qq/search/hot') {
      const data = await qqHot();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200, data }));
      return;
    }
    // QQ音乐 搜索联想
    if (url.pathname === '/api/qq/search/suggest') {
      const keyword = url.searchParams.get('keyword') || '';
      const data = await qqSuggest(keyword);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200, data }));
      return;
    }

    // ===== 登录状态（前端用来判断是否显示VIP提示）=====
    if (url.pathname === '/api/netease/login/status') {
      const { neteaseUserInfo } = require('./netease');
      const info = await neteaseUserInfo();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        code: 200,
        loggedIn: !!info,
        vip: info?.vip || false,
        nickname: info?.nickname || '',
      }));
      return;
    }

    // ===== 用户信息 =====
    if (url.pathname === '/api/netease/user') {
      const info = await neteaseUserInfo();
      if (!info) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 401, msg: '登录已失效' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // 透传完整的 membership 结构（含 status / provider / level / name / icon）
        res.end(JSON.stringify({ code: 200, data: info }));
      }
      return;
    }
    if (url.pathname === '/api/qq/user') {
      const info = await qqUserInfo();
      if (!info) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 401, msg: 'QQ音乐未登录' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 200, data: info }));
      }
      return;
    }
    // ===== 登录 =====
    // 网易云 QR 码登录状态检查
    if (url.pathname === '/api/netease/login/check') {
      const key = url.searchParams.get('key') || '';
      const data = await neteaseQrCheck(key);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }
    // ===== QQ音乐扫码登录（通过 qq-music-api）=====
    if (url.pathname === '/api/qq/login/qr') {
      try {
        const qqApiRes = await fetch('http://localhost:3200/getQQLoginQr');
        const json = await qqApiRes.json();
        console.log('[QQ_QR] qq-music-api 返回:', JSON.stringify(json).slice(0, 300));
        // qq-music-api 返回 {img: "data:image/png;base64,..."}
        const img = json.img || json.data?.img || json.data?.qrcode || '';
        if (img) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 200, data: { img } }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: -1, msg: '二维码为空', raw: JSON.stringify(json).slice(0, 200) }));
        }
      } catch (e) {
        console.error('[QQ_QR] 请求失败:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: -1, msg: 'qq-music-api 未启动', error: e.message }));
      }
      return;
    }

    if (url.pathname === '/api/qq/login/check') {
      const qrsig = url.searchParams.get('qrsig') || '';
      const ptqrtoken = url.searchParams.get('ptqrtoken') || '';
      try {
        const qqApiRes = await fetch('http://localhost:3200/checkQQLoginQr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qrsig, ptqrtoken }),
        });
        const json = await qqApiRes.json();
        console.log('[QQ_CHECK] qq-music-api 返回:', JSON.stringify(json).slice(0, 300));
        // 登录成功 → 保存 cookie
        if (json.code === 0 && json.session?.cookie) {
          saveQQCookie(json.session.cookie);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(json));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: -1, msg: 'qq-music-api 未启动' }));
      }
      return;
    }

    // 网易云 QR 码登录
    if (url.pathname === '/api/netease/login/qr') {
      const qr = await neteaseQrLogin();
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

// QQ播放错误码 → 中文提示
function getErrorMessage(error) {
  const messages = {
    login_required: '请先登录QQ音乐',
    vip_required: '该歌曲需要VIP会员',
    network_error: '网络错误',
    parse_error: '播放链接解析失败',
    timeout: '请求超时',
  };
  return messages[error] || '无法获取播放链接';
}

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
