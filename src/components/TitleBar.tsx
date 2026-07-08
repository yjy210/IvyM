import { WindowControls } from './WindowControls';

export function TitleBar() {
  return (
    <div className="app-region-drag flex items-center justify-between h-12 px-4 bg-white/70 backdrop-blur-xl border-b border-black/5 shrink-0">
      {/* 左侧：Logo */}
      <div className="app-region-no-drag flex items-center gap-3">
        <img src="/logo.png" alt="IvyM" className="w-7 h-7 rounded-lg object-cover" />
        <span className="text-sm font-bold text-text-primary tracking-wide">IvyM</span>
      </div>

      {/* 中间：留空 */}
      <div className="flex-1" />

      {/* 右侧：登录 + 窗口控制 */}
      <div className="app-region-no-drag flex items-center gap-3">
        <button className="px-3 py-1.5 rounded-full bg-primary text-white text-xs font-medium hover:bg-primary-dark transition-colors">
          登录
        </button>
        <WindowControls />
      </div>
    </div>
  );
}
