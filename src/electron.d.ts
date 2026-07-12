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
        user?: { platform: string; nickname: string; avatar: string; userId: string; vip: boolean; vipName: string; membership?: any };
        cookie?: string;
      }) => void) => void;
      // 账号管理
      getAccounts: () => Promise<any[]>;
      upsertAccount: (account: any) => Promise<void>;
      removeAccount: (platform: string) => Promise<void>;
      // Phase 2: 网易云 QR 登录
      getQRKey: () => Promise<{ code: number; msg?: string; data?: { qrimg: string; unikey: string } }>;
      checkQRStatus: (unikey: string) => Promise<{ code: number; msg?: string; cookie?: string }>;
      getQRUserInfo: () => Promise<{ code: number; data?: { nickname: string; avatar: string; userId: string } }>;
      openQQLogin: () => Promise<void>;
      // 酷狗 QR 登录
      getKugouQrKey: () => Promise<{ code: number; msg?: string; data?: { qrimg: string; sigx: string } }>;
      checkKugouQr: (sigx: string) => Promise<{ code: number; status?: number; msg?: string; cookie?: string }>;
      // 酷狗官网 BrowserWindow 登录（fallback）
      kugouLogin?: () => Promise<void>;
      switchAccount: (platform: 'netease' | 'qq' | 'kugou') => Promise<void>;
      onAccountRemoved: (callback: (data: { platform: string }) => void) => () => void;
      clearPlatformSession: (platform: 'netease' | 'qq' | 'kugou') => Promise<void>;
    };
  }
}
