import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { usePlayerStore } from '../../stores/playerStore';
import { useSearchStore, HotPlatform } from '../../stores/searchStore';
import GlassSurface from './GlassSurface';
import './search-bar.css';

export default function SearchBar() {
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const keyword = useSearchStore(s => s.keyword);
  const setKeyword = useSearchStore(s => s.setKeyword);
  const history = useSearchStore(s => s.history);
  const removeHistory = useSearchStore(s => s.removeHistory);
  const suggestions = useSearchStore(s => s.suggestions);
  const hotItems = useSearchStore(s => s.hotItems);
  const hotPlatform = useSearchStore(s => s.hotPlatform);

  const fetchSuggestions = useSearchStore(s => s.fetchSuggestions);
  const fetchHot = useSearchStore(s => s.fetchHot);
  const setHotPlatform = useSearchStore(s => s.setHotPlatform);
  const addHistory = useSearchStore(s => s.addHistory);
  const search = useSearchStore(s => s.search);
  const setCurrentView = usePlayerStore(s => s.setCurrentView);

  const [panelOpen, setPanelOpen] = useState(false);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [tooltipFlip, setTooltipFlip] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });

  // ★ tooltip 强制隐藏——点击/回车/失焦等操作立即抹掉
  const hideTooltip = useCallback(() => setTooltip(null), []);

  const handleTooltipEnter = useCallback((e: React.MouseEvent, text: string) => {
    const el = e.currentTarget as HTMLElement;
    if (el.scrollWidth > el.clientWidth) {
      setTooltip({ text, x: e.clientX, y: e.clientY });
      setTooltipFlip({ x: false, y: false });
    }
  }, []);

  const handleTooltipMove = useCallback((e: React.MouseEvent) => {
    const x = e.clientX, y = e.clientY;
    setTooltip(t => (t ? { ...t, x, y } : null));
    const W = 320, H = 30;
    const flipX = x + 8 + W > window.innerWidth;
    const flipY = y + 8 + H > window.innerHeight;
    setTooltipFlip(f => (f.x === flipX && f.y === flipY) ? f : { x: flipX, y: flipY });
  }, []);

  const handleTooltipLeave = useCallback(() => setTooltip(null), []);

  const hasKeyword = keyword.trim().length > 0;
  const hotList = hotItems[hotPlatform];

  useEffect(() => { fetchHot('netease'); }, [fetchHot]);

  // ★ 输入触发联想；关键修改：不再因空 keyword 而强制关闭面板，
  //   保留搜索页仍可"点空白框弹历史"的能力
  useEffect(() => {
    fetchSuggestions(keyword);
    if (hasKeyword && searchRef.current && document.activeElement === searchRef.current) {
      setPanelOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, fetchSuggestions]);

  // 聚焦：一律打开面板；无输入→历史/热搜，有输入→联想
  const handleFocus = useCallback(() => setPanelOpen(true), []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(t) &&
          searchRef.current && !searchRef.current.contains(t)) {
        setPanelOpen(false);
        hideTooltip();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [hideTooltip]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPanelOpen(false); hideTooltip(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [hideTooltip]);

  // ★ Electron 拖拽区 mousedown 桥——补漏点（拖拽区吞了 mousedown 事件）
  useEffect(() => {
    const anyWin = window as any;
    if (!anyWin.electronAPI?.onDragStart) return;
    const off = anyWin.electronAPI.onDragStart(() => {
      setPanelOpen(false);
      hideTooltip();
      searchRef.current?.blur();
    });
    return () => { if (typeof off === 'function') off(); };
  }, [hideTooltip]);

  const submitSearch = useCallback((kw: string) => {
    const trimmed = kw.trim();
    if (!trimmed) return;
    setPanelOpen(false);
    hideTooltip();
    addHistory(trimmed);
    search(trimmed);
    setCurrentView('search');
  }, [addHistory, search, setCurrentView, hideTooltip]);

  const selectHistory = submitSearch;
  const selectSuggestion = useCallback((sug: string) => {
    setKeyword(sug);
    submitSearch(sug);
  }, [setKeyword, submitSearch]);

  const suggestTooltipHandlers = useMemo(() => ({
    onMouseEnter: (e: React.MouseEvent, text: string) => handleTooltipEnter(e, text),
    onMouseMove: handleTooltipMove,
    onMouseLeave: handleTooltipLeave,
  }), [handleTooltipEnter, handleTooltipMove, handleTooltipLeave]);

  const renderSuggestLabel = useCallback((label: string) => {
    const kw = keyword.trim();
    const commonProps = { onMouseMove: suggestTooltipHandlers.onMouseMove, onMouseLeave: suggestTooltipHandlers.onMouseLeave };
    if (!kw) return <span className="search-suggest-text" {...commonProps} onMouseEnter={e => handleTooltipEnter(e, label)}>{label}</span>;
    const idx = label.toLowerCase().indexOf(kw.toLowerCase());
    if (idx === -1) return <span className="search-suggest-text" {...commonProps} onMouseEnter={e => handleTooltipEnter(e, label)}>{label}</span>;
    const before = label.slice(0, idx);
    const matched = label.slice(idx, idx + kw.length);
    const after = label.slice(idx + kw.length);
    return (
      <span className="search-suggest-text" {...commonProps} onMouseEnter={e => handleTooltipEnter(e, label)}>
        {before}<span className="search-suggest-match">{matched}</span>{after}
      </span>
    );
  }, [keyword, suggestTooltipHandlers, handleTooltipEnter]);

  const toggleHotPlatform = useCallback((p: HotPlatform) => setHotPlatform(p), [setHotPlatform]);

  const showHistoryHot = panelOpen && !hasKeyword && (history.length > 0 || hotList.length > 0);
  const showSuggest = panelOpen && hasKeyword && suggestions.length > 0;

  return (
    <div className="search-bar-container">
      <div className="search-bar-static">
        <GlassSurface
          width="100%" height={40} borderRadius={999}
          brightness={80} opacity={0.3} blur={3} displace={8}
          distortionScale={-80} redOffset={5} greenOffset={10} blueOffset={15}
          saturation={1.4} className="search-island"
        >
          <div className="s-input-area">
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
              <button type="button" className="s-clear-btn" onClick={(e) => {
                e.stopPropagation(); setKeyword(''); searchRef.current?.focus();
              }} title="清空">×</button>
            )}
          </div>
        </GlassSurface>
      </div>

      {showHistoryHot && (
        <div ref={panelRef} className="search-history-popover">
          {history.length > 0 && (
            <>
              <div className="search-history-header">
                <span className="search-history-title">搜索历史</span>
                <button className="search-history-clear-all" onClick={() => useSearchStore.getState().clearHistory()}>清空</button>
              </div>
              <div className="search-grid">
                {history.map((kw, i) => (
                  <div key={`h-${i}`} className="search-grid-item search-history-item" onClick={() => selectHistory(kw)}>
                    <span
                      className="search-history-text"
                      onMouseEnter={e => handleTooltipEnter(e, kw)}
                      onMouseMove={handleTooltipMove}
                      onMouseLeave={handleTooltipLeave}
                    >{kw}</span>
                    <button className="search-history-remove" onClick={(e) => { e.stopPropagation(); removeHistory(kw); }}>×</button>
                  </div>
                ))}
              </div>
            </>
          )}

          {hotList.length > 0 && (
            <>
              <div className="search-hot-header">
                <button className={`search-hot-platform${hotPlatform === 'netease' ? ' active' : ''}`} onClick={() => toggleHotPlatform('netease')} title="网易云音乐">
                  <img src="/platform-icons/wyy.svg" alt="网易云音乐" className="hot-platform-logo wyy" />
                </button>
                <button className={`search-hot-platform${hotPlatform === 'qq' ? ' active' : ''}`} onClick={() => toggleHotPlatform('qq')} title="QQ 音乐">
                  <img src="/platform-icons/qq.svg" alt="QQ 音乐" className="hot-platform-logo qq" />
                </button>
                <span className="search-hot-title">热搜榜</span>
              </div>
              <div className="search-grid search-hot-grid">
                {hotList.map((item, i) => (
                  <div key={`hot-${i}`} className="search-grid-item search-hot-item" onClick={() => selectHistory(item)}>
                    <span className={`search-hot-rank rank-${i + 1}`}>{i + 1}</span>
                    <span
                      className="search-hot-text"
                      onMouseEnter={e => handleTooltipEnter(e, item)}
                      onMouseMove={handleTooltipMove}
                      onMouseLeave={handleTooltipLeave}
                    >{item}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ★ Tooltip 走 Portal，脱离 .search-bar-container 的 transform 影响 */}
      {tooltip && createPortal((() => {
        const OFFSET = 12;
        const style: React.CSSProperties = { position: 'fixed' };
        if (tooltipFlip.x) style.right = window.innerWidth - tooltip.x + OFFSET;
        else style.left = tooltip.x + OFFSET;
        if (tooltipFlip.y) style.bottom = window.innerHeight - tooltip.y + OFFSET;
        else style.top = tooltip.y + OFFSET;
        return <div className="search-tooltip" style={style}>{tooltip.text}</div>;
      })(), document.body)}

      {showSuggest && (
        <div ref={panelRef} className="search-history-popover">
          <div className="search-suggest-list">
            {suggestions.map((sug, i) => (
              <div key={`s-${i}`} className="search-suggest-item" onClick={() => selectSuggestion(sug)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
                </svg>
                {renderSuggestLabel(sug)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
