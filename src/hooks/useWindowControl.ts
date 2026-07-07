import { useState, useEffect, useCallback } from 'react';

declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void;
      maximize: () => void;
      unmaximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
      onMaximize: (cb: () => void) => void;
      onUnmaximize: (cb: () => void) => void;
    };
  }
}

export function useWindowControl() {
  const [isMaximized, setIsMaximized] = useState(false);
  const isElectron = !!window.electronAPI;

  useEffect(() => {
    if (!isElectron) return;

    // 初始化时查询一次最大化状态
    window.electronAPI!.isMaximized().then(setIsMaximized);

    // 监听最大化/还原事件
    window.electronAPI!.onMaximize(() => setIsMaximized(true));
    window.electronAPI!.onUnmaximize(() => setIsMaximized(false));
  }, [isElectron]);

  const minimize = useCallback(() => {
    window.electronAPI?.minimize();
  }, []);

  const toggleMaximize = useCallback(() => {
    if (isMaximized) {
      window.electronAPI?.unmaximize();
    } else {
      window.electronAPI?.maximize();
    }
  }, [isMaximized]);

  const close = useCallback(() => {
    window.electronAPI?.close();
  }, []);

  return { isMaximized, isElectron, minimize, toggleMaximize, close };
}
