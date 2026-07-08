export {};

declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void;
      maximize: () => void;
      unmaximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
      onMaximize: (callback: () => void) => void;
      onUnmaximize: (callback: () => void) => void;
      openPlatformLogin: (platform: 'netease' | 'qq' | 'kugou') => Promise<void>;
      onLoginResult: (callback: (result: { platform: string; cookie: string; cookies: { name: string; value: string }[] }) => void) => void;
    };
  }
}
