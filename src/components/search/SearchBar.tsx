import { useState, useRef, useEffect, useCallback } from 'react';
import { gsap } from 'gsap';
import { usePlayerStore } from '../../stores/playerStore';
import './search-bar.css';

export default function SearchBar() {
  const [isOpen, setIsOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const islandRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const searchResults = usePlayerStore(s => s.searchResults);
  const setSearchResults = usePlayerStore(s => s.setSearchResults);
  const setPlaylist = usePlayerStore(s => s.setPlaylist);
  const API_BASE = 'http://localhost:3001';

  // 展开搜索
  const openSearch = useCallback(() => {
    if (isOpen || !islandRef.current) return;
    setIsOpen(true);
    const expandedWidth = Math.min(window.innerWidth * 0.9, 400);
    gsap.to(islandRef.current, { width: expandedWidth, duration: 0.8, ease: 'back.out(2)' });
    gsap.to(islandRef.current.querySelector('.s-search-icon'), { opacity: 0, scale: 0.5, duration: 0.2 });
    gsap.set(islandRef.current.querySelector('.s-click-area'), { pointerEvents: 'none' });
    gsap.set(islandRef.current.querySelector('.s-input-area'), { pointerEvents: 'auto' });
    gsap.fromTo(
      islandRef.current.querySelector('.s-input-area'),
      { opacity: 0, x: 10 },
      { opacity: 1, x: 0, duration: 0.4, delay: 0.3 }
    );
    // 结果面板
    if (panelRef.current) {
      gsap.fromTo(panelRef.current, { autoAlpha: 0, y: -8, scale: 0.95 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.4, delay: 0.3 });
    }
    setTimeout(() => searchRef.current?.focus(), 400);
  }, [isOpen]);

  // 收起搜索
  const closeSearch = useCallback(() => {
    if (!isOpen || !islandRef.current) return;
    setIsOpen(false);
    gsap.to(islandRef.current, { width: 40, duration: 0.5, ease: 'power2.out' });
    gsap.to(islandRef.current.querySelector('.s-input-area'), { opacity: 0, duration: 0.15 });
    gsap.set(islandRef.current.querySelector('.s-input-area'), { pointerEvents: 'none' });
    gsap.set(islandRef.current.querySelector('.s-click-area'), { pointerEvents: 'auto' });
    gsap.to(islandRef.current.querySelector('.s-search-icon'), { opacity: 1, scale: 1, duration: 0.3, delay: 0.2, ease: 'back.out' });
    if (panelRef.current) {
      gsap.to(panelRef.current, { autoAlpha: 0, duration: 0.2 });
    }
    setKeyword('');
    setSearchResults(null);
  }, [isOpen, setSearchResults]);

  // 点击外部收起
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        islandRef.current && !islandRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
        closeSearch();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, closeSearch]);

  // Escape 收起
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSearch(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, closeSearch]);

  // 搜索
  const doSearch = useCallback(async (kw: string) => {
    if (!kw.trim()) { setSearchResults(null); return; }
    setLoading(true);
    try {
      const [neteaseRes, qqRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/netease/search?keyword=${encodeURIComponent(kw)}&limit=5`),
        fetch(`${API_BASE}/api/qq/search?keyword=${encodeURIComponent(kw)}&limit=5`),
      ]);
      const netease = neteaseRes.status === 'fulfilled' && await neteaseRes.value.ok ? await neteaseRes.value.json() : null;
      const qq = qqRes.status === 'fulfilled' && await qqRes.value.ok ? await qqRes.value.json() : null;
      setSearchResults({
        netease: netease?.code === 200 ? netease.data : [],
        qq: qq?.code === 200 ? qq.data : [],
        keyword: kw,
      });
    } catch {
      setSearchResults({ netease: [], qq: [], keyword: kw });
    } finally {
      setLoading(false);
    }
  }, [API_BASE, setSearchResults]);

  // 防抖
  useEffect(() => {
    if (!keyword.trim()) return;
    const timer = setTimeout(() => doSearch(keyword), 400);
    return () => clearTimeout(timer);
  }, [keyword, doSearch]);

  // 选择歌曲
  const selectSong = useCallback(() => {
    const results = usePlayerStore.getState().searchResults;
    if (results) {
      setPlaylist([...results.netease, ...results.qq]);
    }
  }, [setPlaylist]);

  const hasResults = searchResults && (searchResults.netease.length > 0 || searchResults.qq.length > 0);

  return (
    <>
      {/* 搜索 Island */}
      <div className="search-island" ref={islandRef}>
        <svg className="s-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#BBBAA6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
        <span className="s-click-area" onClick={openSearch} />
        <div className="s-input-area">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          <input
            ref={searchRef}
            className="s-input"
            type="text"
            placeholder="搜索歌曲、歌手、专辑..."
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doSearch(keyword); }}
            onClick={e => e.stopPropagation()}
          />
          <button type="button" className="s-close-btn" onClick={closeSearch}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* 搜索结果面板 */}
      <div className="search-results-panel" ref={panelRef}>
        {loading && <div className="search-empty">搜索中...</div>}

        {!loading && keyword.trim() && !hasResults && (
          <div className="search-empty">未找到相关结果</div>
        )}

        {!loading && hasResults && searchResults && (
          <>
            {searchResults.netease.length > 0 && (
              <>
                <div className="search-section-title">网易云音乐</div>
                {searchResults.netease.map((song, i) => (
                  <div key={`n-${song.id}-${i}`} className="search-result-item" onClick={selectSong}>
                    <div className="search-result-cover" />
                    <div className="search-result-info">
                      <div className="search-result-name">{song.name}</div>
                      <div className="search-result-artist">{song.artists}</div>
                    </div>
                    <span className="search-result-source netease">网易云</span>
                  </div>
                ))}
              </>
            )}
            {searchResults.qq.length > 0 && (
              <>
                <div className="search-section-title">QQ音乐</div>
                {searchResults.qq.map((song, i) => (
                  <div key={`q-${song.mid || song.id}-${i}`} className="search-result-item" onClick={selectSong}>
                    <div className="search-result-cover" />
                    <div className="search-result-info">
                      <div className="search-result-name">{song.name}</div>
                      <div className="search-result-artist">{song.artists}</div>
                    </div>
                    <span className="search-result-source qq">QQ</span>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
