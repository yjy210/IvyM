export {};

declare global {
  interface Window {
    electronAPI?: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      minimize: () => void;
      maximize: () => void;
      unmaximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
      onMaximize: (callback: () => void) => void;
      onUnmaximize: (callback: () => void) => void;
    };
  }
}
