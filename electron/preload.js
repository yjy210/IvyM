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
  openQQLogin: () => ipcRenderer.invoke('login:qq-open'),
  // --- 酷狗音乐 QR 登录 ---
  getKuGouQRKey: () => ipcRenderer.invoke('login:kugou-qr-key'),
  checkKuGouQRStatus: (sigx) => ipcRenderer.invoke('login:kugou-qr-check', sigx),
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
});
