import { useState, useRef, useEffect, useCallback } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { useSearchStore } from '../../stores/searchStore';
import GlassSurface from './GlassSurface';
import './search-bar.css';

export default function SearchBar() {
  const [showHistory, setShowHistory] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const keyword = useSearchStore(s => s.keyword);
  const setKeyword = useSearchStore(s => s.setKeyword);
  const history = useSearchStore(s => s.history);
  const search = useSearchStore(s => s.search);
  const addHistory = useSearchStore(s => s.addHistory);
  const removeHistory = useSearchStore(s => s.removeHistory);
  const setCurrentView = usePlayerStore(s => s.setCurrentView);

  // 焦点 → 显示历史（仅当有历史时）
  const handleFocus = useCallback(() => {
    if (history.length > 0) setShowHistory(true);
  }, [history.length]);

  // 点击搜索框和面板以外 → 隐藏历史
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        searchRef.current && !searchRef.current.contains(target)
      ) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Esc → 隐藏历史
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowHistory(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // 回车：搜索 → 跳转结果页
  const submitSearch = useCallback((kw: string) => {
    const trimmed = kw.trim();
    if (!trimmed) return;
    setShowHistory(false);
    addHistory(trimmed);
    search(trimmed);
    setCurrentView('search');
  }, [addHistory, search, setCurrentView]);

  // 点击历史项：填充 + 搜索
  const selectHistory = useCallback((kw: string) => {
    setKeyword(kw);
    setShowHistory(false);
    addHistory(kw);
    search(kw);
    setCurrentView('search');
  }, [setKeyword, addHistory, search, setCurrentView]);

  // 清空输入
  const clearInput = useCallback(() => {
    setKeyword('');
    searchRef.current?.focus();
  }, [setKeyword]);

  // 点击搜索框任何区域都聚焦输入
  const handleContainerClick = useCallback(() => {
    searchRef.current?.focus();
  }, []);

  return (
    <div className="search-bar-container">
      <div className="search-bar-static">
        <GlassSurface
          width="100%" height={40} borderRadius={999}
          brightness={80} opacity={0.3} blur={3} displace={8}
          distortionScale={-80} redOffset={5} greenOffset={10} blueOffset={15}
          saturation={1.4} className="search-island"
        >
          <div className="s-input-area" onClick={handleContainerClick}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
            </svg>
            <input
              ref={searchRef} className="s-input" type="text"
              placeholder="搜索歌曲、歌手、专辑..."
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onFocus={handleFocus}
              onKeyDown={e => { if (e.key === 'Enter') submitSearch(keyword); }}
            />
            {keyword && (
              <button type="button" className="s-clear-btn" onClick={clearInput} title="清空">×</button>
            )}
          </div>
        </GlassSurface>
      </div>

      {showHistory && history.length > 0 && (
        <div ref={panelRef} className="search-history-popover">
          <div className="search-history-header">
            <span className="search-history-title">搜索历史</span>
            <button className="search-history-clear-all" onClick={() => { useSearchStore.getState().clearHistory(); }}>清空</button>
          </div>
          {history.map((kw, i) => (
            <div key={`h-${i}`} className="search-history-item" onClick={() => selectHistory(kw)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="search-history-text">{kw}</span>
              <button className="search-history-remove" onClick={(e) => { e.stopPropagation(); removeHistory(kw); }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
