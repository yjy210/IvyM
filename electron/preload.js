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

  // --- 平台账号登录（打开官方登录页，捕获 cookie） ---
  openPlatformLogin: (platform) => ipcRenderer.invoke('login:open', platform),
  onLoginResult: (callback) => {
    ipcRenderer.on('login:result', (event, result) => callback(result));
  },
});
