import { usePlayerStore } from '../stores/playerStore';
import { WindowControls } from './WindowControls';

/**
 * ★ 左侧 "IvyM" 胶囊：
 *   - 视觉上是一个黑色圆角胶囊，点击回主页
 *   - 属于 app-region-drag → 拖动胶囊本身也能拖动窗口
 *   - onClick 仍然生效（Electron: 短点击视为 click；长按=drag）
 *   - 只有这一处 logo，App.tsx 里那个重复的 IvyM 按钮已删除
 */
export function TitleBar() {
  const setCurrentView = usePlayerStore(s => s.setCurrentView);
  const coverOpen = usePlayerStore(s => s.coverOpen);

  return (
    <div className="app-region-drag flex items-center h-9 px-3 bg-transparent shrink-0">
      {/*
        ★ 左上角 IvyM 胶囊：
        - 加 app-region-drag 让 Electron 认可拖拽
        - onClick 靠 React 事件依旧触发（Electron 保留短点击）
        - coverOpen 时隐藏
      */}
      <button
        className={`app-region-drag ivym-badge ${coverOpen ? 'hidden' : ''}`}
        onClick={() => setCurrentView('home')}
        title="返回主页"
      >
        <span className="ivym-badge-text">IvyM</span>
      </button>

      {/* ★ 空白 spacer 作为拖拽感应区（点击→关搜索面板） */}
      <div className="flex-1 h-full" data-window-drag-start />

      <div className="app-region-no-drag flex items-center shrink-0">
        <WindowControls />
      </div>
    </div>
  );
}
