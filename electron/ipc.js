const { ipcMain, screen } = require('electron');

function registerIpcHandlers(win) {
  if (!win) return;

  // 完全手动跟踪窗口状态（不用 win.isMaximized() —— 透明窗口有 bug）
  let isMaxed = false;
  let savedBounds = null;

  ipcMain.on('window:minimize', () => {
    win.minimize();
  });

  // ★ toggle 最大化 / 还原 (单一 channel, 图标跟随状态自动切换)
  ipcMain.on('window:maximize', () => {
    if (isMaxed) {
      // 还原
      if (savedBounds) {
        win.setBounds(savedBounds);
      } else {
        win.setSize(1200, 720);
        win.center();
      }
      isMaxed = false;
      win.webContents.send('window:unmaximized');
    } else {
      // 保存 → 最大化
      savedBounds = win.getBounds();
      const workArea = screen.getPrimaryDisplay().workArea;
      win.setBounds(workArea);
      isMaxed = true;
      win.webContents.send('window:maximized');
    }
  });

  ipcMain.on('window:close', () => {
    win.close();
  });

  ipcMain.handle('window:isMaximized', () => isMaxed);
}

module.exports = { registerIpcHandlers };
