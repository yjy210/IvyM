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
      onLoginResult: (callback: (result: {
        platform: string;
        success: boolean;
        msg?: string;
        user?: { platform: string; nickname: string; avatar: string; userId: string; vip: boolean; vipName: string };
        cookie?: string;
      }) => void) => void;
      clearPlatformSession: (platform: 'netease' | 'qq' | 'kugou') => Promise<void>;
    };
  }
}
