const { ipcMain, screen } = require('electron');

function registerIpcHandlers(win) {
  if (!win) return;

  // 完全手动跟踪窗口状态（不用 win.isMaximized() —— 透明窗口有 bug）
  let isMaxed = false;
  let savedBounds = null;

  ipcMain.on('window:minimize', () => {
    win.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (isMaxed) return;
    // 保存正常尺寸
    savedBounds = win.getBounds();
    // 最大化到工作区
    const workArea = screen.getPrimaryDisplay().workArea;
    win.setBounds(workArea);
    isMaxed = true;
    win.webContents.send('window:maximized');
  });

  ipcMain.on('window:unmaximize', () => {
    if (!isMaxed) return;
    // 还原到保存的正常尺寸
    if (savedBounds) {
      win.setBounds(savedBounds);
    } else {
      win.setSize(1200, 720);
      win.center();
    }
    isMaxed = false;
    win.webContents.send('window:unmaximized');
  });

  ipcMain.on('window:close', () => {
    win.close();
  });

  ipcMain.handle('window:isMaximized', () => isMaxed);
}

module.exports = { registerIpcHandlers };
