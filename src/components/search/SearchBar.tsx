import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { gsap } from 'gsap';
import { usePlayerStore } from '../../stores/playerStore';
import { useSearchStore } from '../../stores/searchStore';
import type { Song } from '../../types';
import GlassSurface from './GlassSurface';
import './search-bar.css';

export default function SearchBar() {
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const islandRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const keyword = useSearchStore(s => s.keyword);
  const setKeyword = useSearchStore(s => s.setKeyword);
  const results = useSearchStore(s => s.results);
  const status = useSearchStore(s => s.status);
  const history = useSearchStore(s => s.history);
  const search = useSearchStore(s => s.search);
  const addHistory = useSearchStore(s => s.addHistory);
  const removeHistory = useSearchStore(s => s.removeHistory);
  const play = usePlayerStore(s => s.play);
  const setCurrentView = usePlayerStore(s => s.setCurrentView);

  const openSearch = useCallback(() => {
    if (isOpen || !islandRef.current) return;
    setIsOpen(true);
    requestAnimationFrame(() => {
      gsap.to(islandRef.current, {
        width: Math.min(window.innerWidth * 0.9, 400),
        duration: 0.8,
        ease: 'back.out(2)',
      });
    });
    setTimeout(() => searchRef.current?.focus(), 400);
  }, [isOpen]);

  const closeSearch = useCallback(() => {
    if (!isOpen || !islandRef.current) return;
    gsap.to(islandRef.current, {
      width: 40,
      duration: 0.5,
      ease: 'power2.out',
      onComplete: () => { setIsOpen(false); },
    });
  }, [isOpen]);

  // 点击外部收起 — 仅当输入框为空时才关闭；有内容时只能点叉号关闭
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (keyword.trim()) return;
      const target = e.target as Node;
      if (islandRef.current && !islandRef.current.contains(target) && panelRef.current && !panelRef.current.contains(target)) {
        closeSearch();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, closeSearch, keyword]);

  // Escape 收起
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSearch(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, closeSearch]);

  // 输入 → 300ms 防抖 → 实时预览
  const handleChange = useCallback((kw: string) => {
    setKeyword(kw);
    clearTimeout(debounceRef.current);
    if (!kw.trim()) return;
    debounceRef.current = setTimeout(() => { search(kw); }, 300);
  }, [setKeyword, search]);

  // 回车：正式搜索 → 记录历史 + 跳转结果页 + 关闭下拉框
  const submitSearch = useCallback((kw: string) => {
    if (!kw.trim()) return;
    clearTimeout(debounceRef.current);
    addHistory(kw);
    search(kw).then(() => {
      setCurrentView('search');
      closeSearch();
    });
  }, [addHistory, search, setCurrentView, closeSearch]);

  // 轮询交替
  const flatSongs = useMemo(() => {
    if (!results) return [];
    const list: { song: Song; platform: 'netease' | 'qq' | 'kugou' }[] = [];
    const sources: { platform: 'netease' | 'qq' | 'kugou'; songs: Song[] }[] = [
      { platform: 'netease', songs: results.netease.songs },
      { platform: 'qq', songs: results.qq.songs },
      { platform: 'kugou', songs: results.kugou.songs },
    ];
    const maxLen = Math.max(...sources.map(s => s.songs.length));
    for (let i = 0; i < maxLen; i++) {
      for (const src of sources) {
        if (i < src.songs.length) list.push({ song: src.songs[i], platform: src.platform });
      }
    }
    return list;
  }, [results]);

  const selectSong = useCallback((entry: { song: Song; platform: 'netease' | 'qq' | 'kugou' }) => {
    play(entry.song);
  }, [play]);

  const selectHistory = useCallback((kw: string) => {
    setKeyword(kw);
    submitSearch(kw);
  }, [setKeyword, submitSearch]);

  const showPanel = isOpen;
  const isLoading = status === 'loading';
  const getSrcLabel = (p: 'netease' | 'qq' | 'kugou') => p === 'netease' ? '网易云' : p === 'qq' ? 'QQ' : '酷狗';

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
                onChange={e => handleChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitSearch(keyword); }}
              />
              <button type="button" className="s-close-btn" onClick={closeSearch}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}
        </GlassSurface>
      </div>

      {showPanel && (
        <div className="search-results-panel" ref={panelRef} style={{ visibility: 'visible', opacity: 1 }}>
          {keyword.trim() && isLoading && <div className="search-empty">搜索中...</div>}
          {keyword.trim() && !isLoading && status === 'empty' && <div className="search-empty">未找到相关结果</div>}
          {keyword.trim() && !isLoading && status === 'error' && <div className="search-empty">搜索出错，请稍后重试</div>}
          {keyword.trim() && !isLoading && flatSongs.length > 0 && (
            flatSongs.map((entry, i) => {
              const { song, platform } = entry;
              return (
                <div key={`${platform}-${song.id}-${i}`} className="search-result-item" onClick={() => selectSong(entry)}>
                  <img src={song.cover || '/logo.png'} alt="" className="search-result-cover" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).src = '/logo.png'; }} />
                  <div className="search-result-info">
                    <div className="search-result-name">{song.name}</div>
                    <div className="search-result-artist">{song.artists}</div>
                  </div>
                  <span className="search-result-sources">
                    <span className={`search-result-source ${platform}`}>{getSrcLabel(platform)}</span>
                    {song.vip && <img src={`/icons/vip-${platform}.svg`} alt="VIP" className="search-result-vip-icon" />}
                  </span>
                </div>
              );
            })
          )}

          {!keyword.trim() && history.length > 0 && (
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
          )}

          {!keyword.trim() && history.length === 0 && (
            <div className="search-empty">输入关键词搜索歌曲</div>
          )}
        </div>
      )}
    </>
  );
}
