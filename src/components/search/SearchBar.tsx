import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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

  // 面板显隐（由 store 派生不再单独 state）
  const [panelOpen, setPanelOpen] = useState(false);
  // ★ tooltip（只在文本被截断时显示完整内容，跟随鼠标）
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  // ★ 边界翻转标志（出界就放到鼠标左侧/上侧）
  const [tooltipFlip, setTooltipFlip] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });

  // 进入词条：判断 scrollWidth > clientWidth → 显示
  const handleTooltipEnter = useCallback((e: React.MouseEvent, text: string) => {
    const el = e.currentTarget as HTMLElement;
    if (el.scrollWidth > el.clientWidth) {
      setTooltip({ text, x: e.clientX, y: e.clientY });
      // 初始进入时按默认右下方向；实际翻转由 effect 监听鼠标移动来决定
      setTooltipFlip({ x: false, y: false });
    }
  }, []);

  // 鼠标移动：更新位置 + 依据 tooltip 实际尺寸判断是否出界翻转
  const handleTooltipMove = useCallback((e: React.MouseEvent) => {
    const x = e.clientX, y = e.clientY;
    setTooltip(t => (t ? { ...t, x, y } : null));
    // tooltip 文字通常不会超长，按经验宽度估约 320 / 高 30 已足够；精算可在容器 ref 测量
    const W = 320, H = 30;
    const flipX = x + 8 + W > window.innerWidth;
    const flipY = y + 8 + H > window.innerHeight;
    setTooltipFlip(f => (f.x === flipX && f.y === flipY) ? f : { x: flipX, y: flipY });
  }, []);

  // 离开：隐藏
  const handleTooltipLeave = useCallback(() => setTooltip(null), []);

  const hasKeyword = keyword.trim().length > 0;
  const hotList = hotItems[hotPlatform];

  // ★ 落地拉取默认平台热搜；切换平台时懒加载
  useEffect(() => { fetchHot('netease'); }, [fetchHot]);

  // ★ 输入即触发联想（防抖逻辑在 store 内部）
  useEffect(() => {
    fetchSuggestions(keyword);
    // 有输入时没结果也要开面板显示联想热区，无输入时暂停面板
    if (!hasKeyword) setPanelOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, fetchSuggestions]);

  // 焦点：无输入且有历史/热搜 → 打开面板
  const handleFocus = useCallback(() => {
    if (!hasKeyword) setPanelOpen(true);
  }, [hasKeyword]);

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(t) &&
          searchRef.current && !searchRef.current.contains(t)) setPanelOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Esc 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanelOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // 启动搜索（回车 / 点历史 / 点联想）
  const submitSearch = useCallback((kw: string) => {
    const trimmed = kw.trim();
    if (!trimmed) return;
    setPanelOpen(false);
    addHistory(trimmed);
    search(trimmed);
    setCurrentView('search');
  }, [addHistory, search, setCurrentView]);
  const selectHistory = submitSearch;
  const selectSuggestion = useCallback((sug: string) => {
    setKeyword(sug);
    submitSearch(sug);
  }, [setKeyword, submitSearch]);

  // ★ 高亮：匹配输入的前缀段显示灰色
  const suggestTooltipHandlers = useMemo(() => ({
    onMouseEnter: (e: React.MouseEvent, text: string) => handleTooltipEnter(e, text),
    onMouseMove: handleTooltipMove,
    onMouseLeave: handleTooltipLeave,
  }), [handleTooltipEnter, handleTooltipMove, handleTooltipLeave]);

  const renderSuggestLabel = useCallback((label: string) => {
    const kw = keyword.trim();
    if (!kw) return <span className="search-suggest-text" {...suggestTooltipHandlers} onMouseEnter={e => suggestTooltipHandlers.onMouseEnter(e, label)}>{label}</span>;
    const idx = label.toLowerCase().indexOf(kw.toLowerCase());
    if (idx === -1) return <span className="search-suggest-text" {...suggestTooltipHandlers} onMouseEnter={e => suggestTooltipHandlers.onMouseEnter(e, label)}>{label}</span>;
    const before = label.slice(0, idx);
    const matched = label.slice(idx, idx + kw.length);
    const after = label.slice(idx + kw.length);
    return (
      <span className="search-suggest-text" {...suggestTooltipHandlers} onMouseEnter={e => suggestTooltipHandlers.onMouseEnter(e, label)}>
        {before}<span className="search-suggest-match">{matched}</span>{after}
      </span>
    );
  }, [keyword, suggestTooltipHandlers]);

  // 平台切换
  const toggleHotPlatform = useCallback((p: HotPlatform) => {
    setHotPlatform(p);
  }, [setHotPlatform]);

  const showHistoryHot = panelOpen && !hasKeyword && (history.length > 0 || hotList.length > 0);
  // ★ 三项互斥：搜索联想只在面板开启 + 有输入 + 有结果时显示（提交/失焦后 panelOpen=false，自然消失）
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
              <button type="button" className="s-clear-btn" onClick={(e) => { e.stopPropagation(); setKeyword(''); searchRef.current?.focus(); }} title="清空">×</button>
            )}
          </div>
        </GlassSurface>
      </div>

      {/* ★ 搜索历史 + 热搜：仅无输入时显示 */}
      {showHistoryHot && (
        <div ref={panelRef} className="search-history-popover">
          {/* 搜索历史 */}
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

          {/* 热搜 */}
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

      {/* ★ tooltip 挂载点：跟随鼠标，仅截断时显示；出界时翻转 */}
      {tooltip && (() => {
        const OFFSET = 8;
        const style: React.CSSProperties = {};
        // 默认右下角；右侧或底部溢出则翻到左/上
        if (tooltipFlip.x) style.right = window.innerWidth - tooltip.x + OFFSET;
        else style.left = tooltip.x + OFFSET;
        if (tooltipFlip.y) style.bottom = window.innerHeight - tooltip.y + OFFSET;
        else style.top = tooltip.y + OFFSET;
        return <div className="search-tooltip" style={style}>{tooltip.text}</div>;
      })()}

      {/* ★ 搜索联想：仅有输入时显示，三者不并存 */}
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
