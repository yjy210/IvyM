import { WindowControls } from './WindowControls';

export function TitleBar() {
  return (
    <div className="app-region-drag flex items-center h-12 px-4 bg-transparent shrink-0">
      {/* ★ Logo — no-drag, 可主页导航 */}
      <div className="app-region-no-drag flex items-center gap-3 shrink-0">
        <img src="/logo.png" alt="IvyM" className="w-7 h-7 rounded-lg object-cover" />
        <span className="text-sm font-bold text-text-primary tracking-wide">IvyM</span>
      </div>

      {/* ★ 空白 spacer — 中间留空（让搜索框 fixed 居中可视化） */}
      <div className="flex-1 h-full" />

      {/* ★ 窗口控制按钮 — 必须放在 app-region-no-drag 内 */}
      <div className="app-region-no-drag flex items-center shrink-0">
        <WindowControls />
      </div>
    </div>
  );
}
