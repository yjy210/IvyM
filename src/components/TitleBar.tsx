import { useCallback } from 'react';

/**
 * ★ TitleBar 拖拽 + 失焦 解耦重构
 *
 * 结构（从顶到底）：
 *   ┌─ 拖拽条 (app-region-drag, h-1.5, absolute top-0)  ← 仅此处承接 Electron 窗口拖拽
 *   │
 *   └─ 交互层 (app-region-no-drag, 覆盖下方)
 *        ├── logo + IvyM 文字 (左侧)
 *        └── 空白 spacer (flex-1)
 *             └─ onMouseDown: scoped blur —— 仅失焦搜索框 (.s-input)
 *
 * 机制：
 *   - 拖拽条是真 ·-webkit-app-region: drag，Electron 原生处理拖拽完全不走 React
 *     所以 React onMouseDown 在这里不会触发 → 不存在"blur 抢拖拽"的冲突
 *   - 交互层是 no-drag 区，onMouseDown **100% 可冒泡**
 *   - spacer 覆盖 logo 右侧整片空白，点这里触发 scoped blur（仅搜索框失焦，按钮/其他组件不受影响）
 *   - 不 preventDefault
 */
export function TitleBar() {
  const onBlankMouseDown = useCallback(() => {
    // scoped: 仅当前焦点在搜索输入框时才 blur，其它已聚焦组件不受影响
    const el = document.activeElement as HTMLElement | null;
    if (el && el.classList && el.classList.contains('s-input')) {
      el.blur();
    }
  }, []);

  return (
    <div className="relative h-12 shrink-0 bg-transparent">
      {/* ★ 真·拖拽条：仅顶部 1.5 小条是原生 drag 区，保证窗口可拖 */}
      <div className="app-region-drag absolute top-0 left-0 right-0 h-1.5 z-20" />

      {/* ★ 交互层：no-drag，正常接受 DOM 事件（含 mouse down blur） */}
      <div className="app-region-no-drag relative z-10 flex items-center h-full px-4">
        {/* 左侧 logo + 文字 */}
        <div className="flex items-center gap-3 shrink-0">
          <img src="/logo.png" alt="IvyM" className="w-7 h-7 rounded-lg object-cover" />
          <span className="text-sm font-bold text-text-primary tracking-wide">IvyM</span>
        </div>

        {/* ★ 空白 spacer：点击 = blur 搜索框；该区域本身不 drag，drag 由顶部细条承担 */}
        <div
          className="flex-1 h-full"
          onMouseDown={onBlankMouseDown}
        />
      </div>
    </div>
  );
}
