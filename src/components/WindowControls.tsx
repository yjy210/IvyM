import { useWindowControl } from '../hooks/useWindowControl';

export function WindowControls() {
  const { isElectron, isMaximized, minimize, toggleMaximize, close } = useWindowControl();

  if (!isElectron) return null;

  return (
    <div className="flex items-center gap-0">
      {/* 最小化 — 横线 */}
      <button
        className="w-11 h-9 flex items-center justify-center text-text-muted hover:bg-black/8 hover:text-text-primary transition-colors rounded"
        onClick={minimize}
        title="最小化"
      >
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M2 6h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>

      {/* 最大化/还原 — 方形 */}
      <button
        className="w-11 h-9 flex items-center justify-center text-text-muted hover:bg-black/8 hover:text-text-primary transition-colors rounded"
        onClick={toggleMaximize}
        title={isMaximized ? '还原' : '最大化'}
      >
        {isMaximized ? (
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="2.5" y="3.5" width="6" height="6" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M4 2.5h5v5" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="2" y="2" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        )}
      </button>

      {/* 关闭 — 叉号 */}
      <button
        className="w-11 h-9 flex items-center justify-center text-text-muted hover:bg-red-500 hover:text-white transition-colors rounded"
        onClick={close}
        title="关闭"
      >
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
