export {};

declare global {
  interface Window {
    // ★ 新窗口控制命名空间 (Win11 自绘标题栏)
    electron?: {
      windowControls?: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        onMaximize: (callback: () => void) => void;
        onUnmaximize: (callback: () => void) => void;
      };
    };

    // 登录 / 账号 / 窗口状态 (electronAPI 老命名空间, 暂保留)
    electronAPI?: {
      openPlatformLogin: (platform: 'netease' | 'qq') => Promise<void>;
      onLoginResult: (callback: (result: {
        platform: string;
        success: boolean;
        msg?: string;
        user?: { platform: string; nickname: string; avatar: string; userId: string; vip: boolean; vipName: string; membership?: any; raw?: any };
        cookie?: string;
      }) => void) => () => void;
      getAccounts: () => Promise<any[]>;
      upsertAccount: (account: any) => Promise<void>;
      removeAccount: (platform: string) => Promise<void>;
      getQRKey: () => Promise<{ code: number; msg?: string; data?: { qrimg: string; unikey: string } }>;
      checkQRStatus: (unikey: string) => Promise<{ code: number; msg?: string; cookie?: string }>;
      getQRUserInfo: () => Promise<{ code: number; data?: { nickname: string; avatar: string; userId: string } }>;
      openQQLogin: () => Promise<void>;
      switchAccount: (platform: 'netease' | 'qq') => Promise<void>;
      onAccountRemoved: (callback: (data: { platform: string }) => void) => () => void;
      clearPlatformSession: (platform: 'netease' | 'qq') => Promise<void>;
    };
  }
}
