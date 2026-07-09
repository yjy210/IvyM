import { useState, useRef, useEffect, useCallback } from 'react';
import { gsap } from 'gsap';
import { usePlayerStore } from '../../stores/playerStore';
import { useSearchStore } from '../../stores/searchStore';
import GlassSurface from './GlassSurface';
import './search-bar.css';

export default function SearchBar() {
  const [isOpen, setIsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const islandRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const keyword = useSearchStore(s => s.keyword);
  const setKeyword = useSearchStore(s => s.setKeyword);
  const history = useSearchStore(s => s.history);
  const search = useSearchStore(s => s.search);
  const addHistory = useSearchStore(s => s.addHistory);
  const removeHistory = useSearchStore(s => s.removeHistory);
  const setCurrentView = usePlayerStore(s => s.setCurrentView);

  // 展开搜索框
  const openSearch = useCallback(() => {
    if (isOpen || !islandRef.current) return;
    setIsOpen(true);
    // 空输入时显示历史
    if (!keyword.trim()) setShowHistory(true);
    requestAnimationFrame(() => {
      gsap.to(islandRef.current, {
        width: Math.min(window.innerWidth * 0.9, 400),
        duration: 0.8,
        ease: 'back.out(2)',
      });
    });
    setTimeout(() => searchRef.current?.focus(), 400);
  }, [isOpen, keyword]);

  // 关闭搜索框：先隐藏下拉框 → 播放动画 → 结束重置状态
  const closeSearch = useCallback(() => {
    if (!isOpen || isClosing || !islandRef.current) return;
    setShowHistory(false);           // 立即隐藏历史下拉框
    setIsClosing(true);              // 进入关闭动画
    gsap.to(islandRef.current, {
      width: 40,
      duration: 0.5,
      ease: 'power2.out',
      onComplete: () => {
        setIsOpen(false);
        setIsClosing(false);
      },
    });
  }, [isOpen, isClosing]);

  // 清空输入框：只清空，不关闭，显示历史
  const clearInput = useCallback(() => {
    setKeyword('');
    if (history.length > 0) setShowHistory(true);
  }, [setKeyword, history.length]);

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (islandRef.current && !islandRef.current.contains(target) && panelRef.current && !panelRef.current.contains(target)) {
        closeSearch();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, closeSearch]);

  // Esc 关闭
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSearch(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, closeSearch]);

  // 回车：发送搜索 → 跳转结果页
  const submitSearch = useCallback((kw: string) => {
    const trimmed = kw.trim();
    if (!trimmed) return;
    setShowHistory(false);
    addHistory(trimmed);
    search(trimmed).then(() => setCurrentView('search'));
  }, [addHistory, search, setCurrentView]);

  // 点击历史项：填充 + 搜索
  const selectHistory = useCallback((kw: string) => {
    setKeyword(kw);
    setShowHistory(false);
    addHistory(kw);
    search(kw).then(() => setCurrentView('search'));
  }, [setKeyword, addHistory, search, setCurrentView]);

  const showPanel = isOpen && showHistory;

  return (
    <>
      <div className={`search-island-wrapper ${isOpen ? 'open' : ''}`} ref={islandRef}>
        <GlassSurface
          width="100%" height={40} borderRadius={999}
          brightness={80} opacity={0.3} blur={3} displace={8}
          distortionScale={-80} redOffset={5} greenOffset={10} blueOffset={15}
          saturation={1.4} className="search-island"
        >
          {!isOpen && (
            <button className="s-open-btn" onClick={openSearch}>
              <svg className="s-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#BBBAA6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
              </svg>
            </button>
          )}
          {isOpen && (
            <div className="s-input-area">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
              </svg>
              <input
                ref={searchRef} className="s-input" type="text"
                placeholder="搜索歌曲、歌手、专辑..."
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitSearch(keyword); }}
              />
              <button type="button" className="s-close-btn" onClick={clearInput} title="清空">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}
        </GlassSurface>
      </div>

      {/* 下拉框：仅显示搜索历史 */}
      {showPanel && (
        <div className="search-results-panel" ref={panelRef} style={{ visibility: 'visible', opacity: 1 }}>
          {history.length > 0 ? (
            <div className="search-history">
              <div className="search-history-title">搜索历史</div>
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
          ) : (
            <div className="search-empty">输入关键词搜索歌曲</div>
          )}
        </div>
      )}
    </>
  );
}
