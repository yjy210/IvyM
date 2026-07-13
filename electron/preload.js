const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // --- 窗口控制 ---
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  unmaximize: () => ipcRenderer.send('window:unmaximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // --- 窗口状态变更回调 ---
  onMaximize: (callback) => {
    ipcRenderer.on('window:maximized', () => callback());
  },
  onUnmaximize: (callback) => {
    ipcRenderer.on('window:unmaximized', () => callback());
  },

  // --- 平台账号登录（打开官方登录页） ---
  openPlatformLogin: (platform) => ipcRenderer.invoke('login:open', platform),
  onLoginResult: (callback) => {
    const listener = (event, result) => callback(result);
    ipcRenderer.on('login:result', listener);
    return () => ipcRenderer.removeListener('login:result', listener);
  },
  // --- Phase 2: 网易云 QR 登录 ---
  getQRKey: () => ipcRenderer.invoke('login:qr-key'),
  checkQRStatus: (unikey) => ipcRenderer.invoke('login:qr-check', unikey),
  getQRUserInfo: () => ipcRenderer.invoke('login:qr-user'),
  // --- QQ音乐登录（网页方式）---
  // --- QQ音乐扫码登录（qq-music-api 方式）---
  getQQQRKey: () => ipcRenderer.invoke('login:qq-qr-key'),
  checkQQQRStatus: (params) => ipcRenderer.invoke('login:qq-qr-check', params),
  // --- 酷狗音乐 QR 登录 ---
  getKugouQrKey: () => ipcRenderer.invoke('login:kugou-qr-key'),
  checkKugouQr: (sigx) => ipcRenderer.invoke('login:kugou-qr-check', { sigx }),
  // ★ 酷狗统一 QR 入口：启动 QR 流程（二维码 + 状态推送 + 账号落库）
  startKugouQrLogin: () => ipcRenderer.invoke('login:kugou-qr-start'),
  // ★ 用户关闭 QR 弹窗时调用，通知后端清除 session 避免状态污染
  cancelKugouQrLogin: () => ipcRenderer.send('login:kugou-qr-cancel'),
  onKugouQrImg: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('login:kugou-qr-img', listener);
    return () => ipcRenderer.removeListener('login:kugou-qr-img', listener);
  },
  onKugouQrStatus: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('login:kugou-qr-status', listener);
    return () => ipcRenderer.removeListener('login:kugou-qr-status', listener);
  },
  // --- 解绑：清除平台的登录 session ---
  clearPlatformSession: (platform) => ipcRenderer.invoke('login:clear', platform),
  // --- 切换账号：清 session + 清账号 + 重新登录 ---
  switchAccount: (platform) => ipcRenderer.invoke('login:switch-account', platform),
  // --- 监听账号被移除（切换账号后刷新菜单）---
  onAccountRemoved: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('login:account-removed', listener);
    return () => ipcRenderer.removeListener('login:account-removed', listener);
  },
  // --- 账号管理（React 通过 IPC 操作，禁止直接读写文件）---
  getAccounts: () => ipcRenderer.invoke('account:get'),
  upsertAccount: (account) => ipcRenderer.invoke('account:upsert', account),
  removeAccount: (platform) => ipcRenderer.invoke('account:remove', platform),
  // ★ DEBUG 抓包: VIP vs 普通账号字段对比工具 (DEBUG_KUGOO=1)
  dumpKugooDebugLog: (label) => ipcRenderer.invoke('kugoo:debug:dump', label),
  clearKugooDebugLog: () => ipcRenderer.invoke('kugoo:debug:clear'),
});
