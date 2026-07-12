/**
 * QQ 官方用户接口 debug dump
 * ==========================
 * 目的：把 Cookie 登录后 QQ 官方 fcg_get_profile_homepage 的原始返回完整落盘，
 *       用于对比 VIP 账号 vs 非 VIP 账号的字段差异，定位真实 VIP 信号。
 *
 * 读：server/.qq-cookie.json
 * 写：server/.qq-debug-{userId}.json  （每次运行覆盖同名文件）
 *
 * 不改任何登录链路、不改 qqUserInfo / qqSongUrl。
 *
 * 用法：
 *   node scripts/qq-debug-dump.cjs            // 用当前 cookie 的 uin
 *   node scripts/qq-debug-dump.cjs 12345678   // 指定 userid 对比用
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..', 'server');
const COOKIE_FILE = path.join(SERVER_DIR, '.qq-cookie.json');

function getQQCookie() {
  try {
    return JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8')).cookie || '';
  } catch {
    return '';
  }
}

function getUinFromCookie(cookieStr) {
  const match = cookieStr.match(/(?:^|;\s*)(?:uin|wxuin|p_uin)=o?(\d+)/);
  return match ? match[1] : '0';
}

function httpsGet(url, cookie) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://y.qq.com',
        'Cookie': cookie,
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function main() {
  const cookie = getQQCookie();
  if (!cookie) {
    console.error('[QQ-DUMP] 未找到 cookie，请先登录 QQ 音乐（server/.qq-cookie.json）');
    process.exit(1);
  }

  // 优先用命令行参数指定的 userid，否则从 cookie 取 uin
  const forcedUserid = process.argv[2];
  const uin = forcedUserid && /^\d+$/.test(forcedUserid) ? forcedUserid : getUinFromCookie(cookie);
  if (!uin || uin === '0') {
    console.error('[QQ-DUMP] 无法从 cookie 提取 uin，也未提供 userid 参数');
    process.exit(1);
  }

  const url =
    'https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg' +
    '?cid=205360838' +
    '&userid=' + uin +
    '&reqfrom=1' +
    '&reqtype=1';

  console.log('[QQ-DUMP] 请求 URL:', url);
  console.log('[QQ-DUMP] 当前 uin :', uin);

  let rawText;
  try {
    rawText = await httpsGet(url, cookie);
  } catch (e) {
    console.error('[QQ-DUMP] 请求失败:', e.message);
    process.exit(1);
  }

  let j;
  try {
    j = JSON.parse(rawText);
  } catch (e) {
    console.error('[QQ-DUMP] JSON 解析失败');
    // 原始兜底：即使解析失败也写入 _rawText 供排查
    const dumpFile = path.join(SERVER_DIR, '.qq-debug-' + uin + '.json');
    fs.writeFileSync(dumpFile, JSON.stringify({ timestamp: Date.now(), userId: uin, _parseError: e.message, _rawText }, null, 2));
    console.log('[QQ-DUMP] 写入（含原始文本）:', dumpFile);
    return;
  }

  const data = j.data || {};
  const creator = data.creator || {};

  // 构造 debug dump 结构（对标 debug dump 协议）
  const dump = {
    timestamp: Date.now(),
    userId: uin,
    httpCode: j.code ?? null,
    dataKeys: data ? Object.keys(data) : [],
    creatorKeys: creator ? Object.keys(creator) : [],
    // 顶层 VIP 候选字段（独立存在 iconlist，便于差异对比）
    vipInfo: data.vipInfo ?? null,
    userInfoUI: creator.userInfoUI ?? data.userInfoUI ?? null,
    identity: creator.identity ?? data.identity ?? null,
    // 完整原始返回（差异对比主角）
    _rawData: data,
    _rawCreator: creator,
    _rawText: rawText,
  };

  const dumpFile = path.join(SERVER_DIR, '.qq-debug-' + uin + '.json');
  fs.writeFileSync(dumpFile, JSON.stringify(dump, null, 2));

  console.log('[QQ-DUMP] 写入完成:', dumpFile);
  console.log('[QQ-DUMP] dataKeys  :', dump.dataKeys.join(', '));
  console.log('[QQ-DUMP] creatorKeys:', dump.creatorKeys.join(', '));
  console.log('[QQ-DUMP] vipInfo   :', JSON.stringify(dump.vipInfo));
  console.log('[QQ-DUMP] iconlist  :', JSON.stringify((dump.userInfoUI || {}).iconlist || null));
}

main();
