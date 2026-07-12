const fs = require('fs');
const path = require('path');

// ============ 路径初始化（由 main.js 在 app.whenReady() 后调用）============

let accountsFile = null;

/**
 * 初始化 AccountManager
 * @param {Object} [app] - Electron app 实例
 */
function init(app) {
  // 允许重新初始化（热重载 / 测试场景）
  accountsFile = app && app.isPackaged
    ? path.join(app.getPath('userData'), 'accounts.json')
    : path.join(__dirname, '../data/accounts.json');

  // 确保目录存在
  const dir = path.dirname(accountsFile);
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * 获取账号文件路径（未初始化时抛出明确错误）
 */
function getAccountsFile() {
  if (!accountsFile) {
    throw new Error('AccountManager has not been initialized. Call init(app) first.');
  }
  return accountsFile;
}

// ============ 字段白名单 ============
const ALLOWED_FIELDS = ['platform', 'nickname', 'avatar', 'userId', 'vip', 'vipName', 'membership', 'bindTime'];

// 合法的 provider 值（membership.provider）
const VALID_PROVIDERS = ['qq', 'netease', 'kugou'];

// ============ 数据清洗 ============

/**
 * 清洗单个账号对象，移除非法字段（如 cookie）
 */
function sanitizeAccount(account) {
  const clean = {};
  for (const field of ALLOWED_FIELDS) {
    switch (field) {
      case 'platform':
        clean.platform = account.platform;
        break;
      case 'nickname':
        clean.nickname = String(account.nickname || '');
        break;
      case 'avatar':
        clean.avatar = String(account.avatar || '');
        break;
      case 'userId':
        clean.userId = String(account.userId || '');
        break;
      case 'vip':
        clean.vip = Boolean(account.vip);
        break;
      case 'vipName':
        clean.vipName = String(account.vipName || '');
        break;
      case 'membership':
        clean.membership = sanitizeMembership(account.membership);
        break;
      case 'bindTime':
        clean.bindTime = typeof account.bindTime === 'number' ? account.bindTime : Date.now();
        break;
    }
  }
  return clean;
}

// ============ CRUD ============

/**
 * 清洗 membership 对象，补全缺失字段
 * - status: 'vip' | 'normal' | 'unknown'
 * - level / name / icon: string | null
 */
function sanitizeMembership(m) {
  if (!m || typeof m !== 'object') return null;
  const status = ['vip', 'normal'].includes(m.status) ? m.status : 'normal';
  const provider = VALID_PROVIDERS.includes(m.provider) ? m.provider : null;
  return {
    status,
    provider,
    level: m.level != null && typeof m.level === 'string' ? m.level : null,
    name: m.name != null && typeof m.name === 'string' ? m.name : null,
    icon: m.icon != null && typeof m.icon === 'string' && m.icon ? m.icon : null,
  };
}

/**
 * 读取已绑定账号列表
 */
function loadAccounts() {
  try {
    const data = JSON.parse(fs.readFileSync(getAccountsFile(), 'utf8'));
    if (!Array.isArray(data)) return [];
    return data.map(sanitizeAccount);
  } catch (err) {
    // 文件不存在（首次启动）属于正常情况，静默处理
    if (err.code === 'ENOENT') return [];
    console.error('[AccountManager] load failed:', err);
    return [];
  }
}

/**
 * 保存账号列表（原子写入：临时文件 + rename，防止崩溃损坏）
 * 策略：先尝试 rename，Windows 锁定失败时再删除重试
 */
function saveAccounts(accounts) {
  const clean = accounts.map(sanitizeAccount);
  const file = getAccountsFile();
  const tmp = file + '.tmp.' + Date.now();

  // 1. 写入临时文件（写盘失败直接清理，不碰旧文件）
  try {
    fs.writeFileSync(tmp, JSON.stringify(clean, null, 2));
  } catch (e) {
    console.error('[AccountManager] save failed:', e.message);
    return;
  }

  try {
    // 2. 尝试原子替换（Linux/macOS 直接成功）
    fs.renameSync(tmp, file);
  } catch (err) {
    // 3. Windows 锁定：按错误码判断，避免掩盖真正的问题
    if (process.platform === 'win32' && (err.code === 'EEXIST' || err.code === 'EPERM')) {
      fs.rmSync(file, { force: true });
      fs.renameSync(tmp, file);
    } else {
      // 其他异常（权限、跨盘等）：清理临时文件，不掩盖
      try { fs.unlinkSync(tmp); } catch {}
      console.error('[AccountManager] save failed:', err.message);
    }
  }
}

/**
 * 添加或更新单个账号
 * - 新账号：直接添加
 * - 已存在：递归合并 —— 顶层字段新值优先，membership 单独 deep merge
 *
 * 为什么 membership 要 deep merge：QQ 登录时 electron 的 login:open 会先保存一次
 * (此时 API 还没返回完整 membership → cleaned.membership = {icon:null,...})，
 * 然后 LoginDropdown 拿到完整 icon 后再 upsert 一次。
 * 如果只 spread merge，第一次的脏 icon:null 会把第二次的 clean icon 整个覆盖掉。
 * 改为 deep merge：新 membership 里的 null 字段会被旧值保留，新值只在非 null 时写入。
 */
function upsertAccount(account) {
  const accounts = loadAccounts();
  const idx = accounts.findIndex(a => a.platform === account.platform);
  const cleaned = sanitizeAccount(account);
  if (idx >= 0) {
    accounts[idx] = {
      ...accounts[idx],
      ...cleaned,
      membership: deepMergeMembership(accounts[idx].membership, cleaned.membership),
      bindTime: Date.now(),
    };
  } else {
    accounts.push(cleaned);
  }
  saveAccounts(accounts);
  return accounts;
}

/**
 * membership 递归合并：新值非 null 时写入，null 时保留旧值
 * - membership 本身为 null/undefined：保留旧值
 * - membership 成员为 null/undefined：保留旧成员值
 */
function deepMergeMembership(oldM, newM) {
  if (!newM || typeof newM !== 'object') return oldM ?? null;
  if (!oldM || typeof oldM !== 'object') return newM;
  return {
    status: newM.status ?? oldM.status ?? null,
    provider: newM.provider ?? oldM.provider ?? null,
    level: newM.level ?? oldM.level ?? null,
    name: newM.name ?? oldM.name ?? null,
    icon: newM.icon ?? oldM.icon ?? null,
  };
}

/**
 * 移除指定平台账号
 */
function removeAccount(platform) {
  const accounts = loadAccounts().filter(a => a.platform !== platform);
  saveAccounts(accounts);
  return accounts;
}

// ============ 测试辅助 ============

/**
 * 注入测试路径（仅用于单元测试）
 */
function __setFilePath(p) {
  accountsFile = p;
}

module.exports = {
  init,
  loadAccounts,
  saveAccounts,
  upsertAccount,
  removeAccount,
  sanitizeAccount,
  getAccountsFile,
  ALLOWED_FIELDS,
  ...(process.env.NODE_ENV === 'test' ? { __setFilePath } : {}),
};
