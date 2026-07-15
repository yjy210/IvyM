const { contextBridge, ipcRenderer } = require('electron');

// ★ 拖拽 blur 桥: 在 document 层捕获冒泡 mousedown
//    仅当路径经过 [data-window-drag-start] (titlebar 空白 spacer) 时,
//    ipc 通知主进程 → 主进程 send 'window:drag-start' → App.tsx blur .s-input
//    功能按钮(.app-region-no-drag 内部)点击时冒泡经过, 但因为同时经过 .app-region-no-drag,
//    我们跳过. 顶部 logo 文字本身也不 blur.
document.addEventListener(
  'mousedown',
  (e) => {
    const t = e.target;
    const inDragBlock = !!(t && t.closest && t.closest('[data-window-drag-start]'));
    const inNoDrag = !!(t && t.closest && t.closest('.app-region-no-drag'));
    // 命中 drag-only 空白 spacer, 且不经过 no-drag 功能区, 才触发 blur
    if (inDragBlock && !inNoDrag) ipcRenderer.send('window:drag-start');
  },
  true, // capture phase, 早于 React合成事件处理, 确保 blur 发生在 focus 变化之前
);
document.addEventListener('mouseup', () => ipcRenderer.send('window:drag-end'), true);

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

// ★ 窗口控制 — 独立命名空间 (Win11 风格自绘标题栏)
//   渲染进程通过 window.electron.windowControls.minimize/maximize/close 调用
contextBridge.exposeInMainWorld('electron', {
  windowControls: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    onMaximize: (callback) => {
      ipcRenderer.on('window:maximized', () => callback())
    },
    onUnmaximize: (callback) => {
      ipcRenderer.on('window:unmaximized', () => callback())
    },
  },
});
