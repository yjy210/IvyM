import { useState, useRef, useEffect, useCallback } from 'react';
import { gsap } from 'gsap';
import { usePlayerStore } from '../../stores/playerStore';
import { useSearchStore } from '../../stores/searchStore';
import GlassSurface from './GlassSurface';
import './search-bar.css';

type AnimationState = 'closed' | 'opening' | 'open' | 'closing';

interface SearchBarProps {
  onOpenChange?: (open: boolean) => void;
  closeTrigger?: number;
}

export default function SearchBar({ onOpenChange, closeTrigger }: SearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [animationState, setAnimationState] = useState<AnimationState>('closed');
  const [historyActive, setHistoryActive] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const islandRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  const keyword = useSearchStore(s => s.keyword);
  const setKeyword = useSearchStore(s => s.setKeyword);
  const history = useSearchStore(s => s.history);
  const search = useSearchStore(s => s.search);
  const addHistory = useSearchStore(s => s.addHistory);
  const removeHistory = useSearchStore(s => s.removeHistory);
  const setCurrentView = usePlayerStore(s => s.setCurrentView);

  // 初始化 Timeline
  useEffect(() => {
    if (!islandRef.current || !overlayRef.current) return;
    tlRef.current = gsap.timeline({ paused: true })
      .to(islandRef.current, { width: Math.min(window.innerWidth * 0.9, 400), duration: 0.5, ease: 'power2.out' }, 0)
      .to(overlayRef.current, { autoAlpha: 1, duration: 0.3 }, 0)
      .to(searchRef.current, { opacity: 1, duration: 0.2 }, 0.1)
      .eventCallback('onReverseComplete', () => {
        setIsOpen(false);
        setAnimationState('closed');
        onOpenChange?.(false);
      });
    return () => { tlRef.current?.kill(); };
  }, []);

  // 展开
  const openSearch = useCallback(() => {
    if (animationState !== 'closed') return;
    setAnimationState('opening');
    setIsOpen(true);
    if (!keyword.trim()) setHistoryActive(true);
    tlRef.current?.play();
    setTimeout(() => searchRef.current?.focus(), 400);
    onOpenChange?.(true);
  }, [animationState, keyword, onOpenChange]);

  // 关闭：先隐藏历史 → 反转动画
  const closeSearch = useCallback(() => {
    if (animationState !== 'open') return;
    setAnimationState('closing');
    setHistoryActive(false);
    tlRef.current?.reverse();
  }, [animationState]);

  // × 按钮：阻止 focus → 清空 → blur button → focus input
  const clearInput = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setKeyword('');
    (e.target as HTMLButtonElement)?.blur();
    searchRef.current?.focus();
    if (history.length > 0) setHistoryActive(true);
  }, [setKeyword, history.length]);

  // 点击 Overlay 关闭
  const handleOverlayClick = useCallback(() => closeSearch(), [closeSearch]);

  // Esc 关闭
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSearch(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, closeSearch]);

  // 父组件触发关闭（点击 Header 区域）
  const prevCloseTrigger = useRef(closeTrigger);
  useEffect(() => {
    if (closeTrigger !== undefined && closeTrigger !== prevCloseTrigger.current) {
      prevCloseTrigger.current = closeTrigger;
      closeSearch();
    }
  }, [closeTrigger, closeSearch]);

  // 回车：搜索 → 跳转结果页
  const submitSearch = useCallback((kw: string) => {
    const trimmed = kw.trim();
    if (!trimmed) return;
    setHistoryActive(false);
    addHistory(trimmed);
    search(trimmed).then(() => setCurrentView('search'));
  }, [addHistory, search, setCurrentView]);

  // 点击历史项
  const selectHistory = useCallback((kw: string) => {
    setKeyword(kw);
    setHistoryActive(false);
    addHistory(kw);
    search(kw).then(() => setCurrentView('search'));
  }, [setKeyword, addHistory, search, setCurrentView]);

  return (
    <>
      {/* Overlay — 仅覆盖页面内容 */}
      {isOpen && (
        <div ref={overlayRef} className="search-overlay" onClick={handleOverlayClick} />
      )}

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
                style={{ opacity: 0 }}
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

      {/* 历史面板 — 始终渲染，通过 CSS 控制显示 */}
      {isOpen && (
        <div ref={panelRef} className={`search-results-panel ${historyActive ? 'active' : ''}`}>
          {history.length > 0 ? (
            <div className="search-history">
              <div className="search-history-header">
                <span className="search-history-title">搜索历史</span>
                <button className="search-history-close" onClick={() => setHistoryActive(false)}>×</button>
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
          ) : (
            <div className="search-empty">输入关键词搜索歌曲</div>
          )}
        </div>
      )}
    </>
  );
}
