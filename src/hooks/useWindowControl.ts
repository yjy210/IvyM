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
  const isElectron = !!(window.electron?.windowControls);

  const controls = window.electron?.windowControls;

  useEffect(() => {
    if (!controls) return;
    // 监听最大化/还原事件（图标切换）
    controls.onMaximize(() => setIsMaximized(true));
    controls.onUnmaximize(() => setIsMaximized(false));
  }, [controls]);

  const minimize = useCallback(() => {
    controls?.minimize();
  }, [controls]);

  const toggleMaximize = useCallback(() => {
    controls?.maximize();
  }, [controls]);

  const close = useCallback(() => {
    controls?.close();
  }, [controls]);

  return { isMaximized, isElectron, minimize, toggleMaximize, close };
}
