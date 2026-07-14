export function TitleBar() {
  return (
    <div
      className="app-region-drag flex items-center h-12 px-4 bg-transparent shrink-0"
      onMouseDown={(e) => {
        // scoped blur：仅当焦点在标题栏 / 搜索框中标题栏一侧输入时，才 blur 搜索输入框；
        // 不 preventDefault → -webkit-app-region: drag 的窗口拖拽依旧生效
        const el = document.activeElement as HTMLElement | null;
        if (el && el.classList && el.classList.contains('s-input')) {
          el.blur();
        }
        void e;
      }}
    >
      <div className="app-region-no-drag flex items-center gap-3">
        <img src="/logo.png" alt="IvyM" className="w-7 h-7 rounded-lg object-cover" />
        <span className="text-sm font-bold text-text-primary tracking-wide">IvyM</span>
      </div>
    </div>
  );
}
