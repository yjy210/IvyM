export function TitleBar() {
  return (
    <div className="app-region-drag flex items-center h-12 px-4 bg-transparent shrink-0">
      <div className="app-region-no-drag flex items-center gap-3">
        <img src="/logo.png" alt="IvyM" className="w-7 h-7 rounded-lg object-cover" />
        <span className="text-sm font-bold text-text-primary tracking-wide">IvyM</span>
      </div>
      {/* ★ 空白 spacer + data-window-drag-start：告诉 preload 点击 "这里应该 blur"，触发 Electron IPC 广播 */}
      <div className="flex-1 h-full" data-window-drag-start />
    </div>
  );
}