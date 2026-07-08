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
      openPlatformLogin: (platform: 'netease' | 'qq') => Promise<void>;
      onLoginResult: (callback: (result: {
        platform: string;
        success: boolean;
        msg?: string;
        user?: { platform: string; nickname: string; avatar: string; userId: string; vip: boolean; vipName: string };
        cookie?: string;
      }) => void) => void;
      // Phase 2: 网易云 QR 登录
      getQRKey: () => Promise<{ code: number; msg?: string; data?: { qrimg: string; unikey: string } }>;
      checkQRStatus: (unikey: string) => Promise<{ code: number; msg?: string; cookie?: string }>;
      getQRUserInfo: () => Promise<{ code: number; data?: { nickname: string; avatar: string; userId: string } }>;
      openQQLogin: () => Promise<void>;
      clearPlatformSession: (platform: 'netease' | 'qq') => Promise<void>;
    };
  }
}
