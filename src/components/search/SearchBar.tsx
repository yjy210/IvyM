import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { gsap } from 'gsap';
import { usePlayerStore } from '../../stores/playerStore';
import GlassSurface from './GlassSurface';
import type { Song } from '../../types';
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
  const setCurrentView = usePlayerStore(s => s.setCurrentView);
  const play = usePlayerStore(s => s.play);
  const API_BASE = 'http://localhost:3001';

  void setSearchResults; // 保留引用

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
      onComplete: () => {
        setIsOpen(false);
        setKeyword('');
        setSearchResults(null);
      },
    });
  }, [isOpen, setSearchResults]);

  // 点击外部收起
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

  // Escape 收起
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSearch(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, closeSearch]);

  // 搜索（请求三平台第一页，每平台 30 条）
  const doSearch = useCallback(async (kw: string) => {
    if (!kw.trim()) { setSearchResults(null); return; }
    setLoading(true);
    try {
      const [neteaseRes, qqRes, kugouRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/netease/search?keyword=${encodeURIComponent(kw)}&limit=30&page=1`),
        fetch(`${API_BASE}/api/qq/search?keyword=${encodeURIComponent(kw)}&limit=30&page=1`),
        fetch(`${API_BASE}/api/kugou/search?keyword=${encodeURIComponent(kw)}&limit=30&page=1`),
      ]);
      const netease = neteaseRes.status === 'fulfilled' && neteaseRes.value.ok ? await neteaseRes.value.json() : null;
      const qq = qqRes.status === 'fulfilled' && qqRes.value.ok ? await qqRes.value.json() : null;
      const kugou = kugouRes.status === 'fulfilled' && kugouRes.value.ok ? await kugouRes.value.json() : null;
      const limit = 30;
      setSearchResults({
        keyword: kw,
        netease: { songs: netease?.code === 200 ? netease.data : [], page: 1, hasMore: (netease?.total || 0) > limit, loading: false },
        qq: { songs: qq?.code === 200 ? qq.data : [], page: 1, hasMore: (qq?.total || 0) > limit, loading: false },
        kugou: { songs: kugou?.code === 200 ? kugou.data : [], page: 1, hasMore: (kugou?.total || 0) > limit, loading: false },
      });
      // 搜索完成后跳转到搜索结果页
      setCurrentView('search');
    } catch {
      setSearchResults({ keyword: kw, netease: { songs: [], page: 1, hasMore: false, loading: false }, qq: { songs: [], page: 1, hasMore: false, loading: false }, kugou: { songs: [], page: 1, hasMore: false, loading: false } });
      setCurrentView('search');
    } finally {
      setLoading(false);
    }
  }, [API_BASE, setSearchResults, setCurrentView]);

  // 防抖
  useEffect(() => {
    if (!keyword.trim()) return;
    const timer = setTimeout(() => doSearch(keyword), 400);
    return () => clearTimeout(timer);
  }, [keyword, doSearch]);

  // 不合并：每个平台单独显示（仅前 10 条作为快速预览）
  const flatSongs = useMemo(() => {
    if (!searchResults) return [];
    const list: { song: Song; platform: 'netease' | 'qq' | 'kugou' }[] = [];

    searchResults.netease.songs.slice(0, 10).forEach(song => list.push({ song, platform: 'netease' }));
    searchResults.qq.songs.slice(0, 10).forEach(song => list.push({ song, platform: 'qq' }));
    searchResults.kugou.songs.slice(0, 10).forEach(song => list.push({ song, platform: 'kugou' }));

    return list;
  }, [searchResults]);

  const selectSong = useCallback((entry: { song: Song; platform: 'netease' | 'qq' | 'kugou' }) => {
    play(entry.song);
  }, [play]);

  const showPanel = keyword.trim().length > 0;
  const getSrcLabel = (platform: 'netease' | 'qq' | 'kugou') => {
    if (platform === 'netease') return '网易云';
    if (platform === 'qq') return 'QQ';
    return '酷狗';
  };

  return (
    <>
      <div className={`search-island-wrapper ${isOpen ? 'open' : ''}`} ref={islandRef}>
        <GlassSurface
          width="100%"
          height={40}
          borderRadius={999}
          brightness={80}
          opacity={0.3}
          blur={3}
          displace={8}
          distortionScale={-80}
          redOffset={5}
          greenOffset={10}
          blueOffset={15}
          saturation={1.4}
          className="search-island"
        >
          {!isOpen && (
            <button className="s-open-btn" onClick={openSearch}>
              <svg className="s-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#BBBAA6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="16.5" y1="16.5" x2="21" y2="21" />
              </svg>
            </button>
          )}
          {isOpen && (
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
              />
              <button type="button" className="s-close-btn" onClick={closeSearch}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}
        </GlassSurface>
      </div>

      {showPanel && (
        <div className="search-results-panel" ref={panelRef} style={{ visibility: 'visible', opacity: 1 }}>
          {loading && <div className="search-empty">搜索中...</div>}
          {!loading && flatSongs.length === 0 && <div className="search-empty">未找到相关结果</div>}
          {!loading && flatSongs.length > 0 && (
            <>
              {flatSongs.map((entry, i) => {
                const { song, platform } = entry;
                const isVip = song.vip;
                return (
                  <div key={`s-${i}`} className="search-result-item" onClick={() => selectSong(entry)}>
                    {song.cover ? (
                      <img src={song.cover} alt="" className="search-result-cover" />
                    ) : (
                      <img src="/logo.png" alt="IvyM" className="search-result-cover" />
                    )}
                    <div className="search-result-info">
                      <div className="search-result-name">{song.name}</div>
                      <div className="search-result-artist">{song.artists}</div>
                    </div>
                    <span className="search-result-sources">
                      <span className={`search-result-source ${platform}`}>
                        {getSrcLabel(platform)}
                      </span>
                      {isVip && (
                        <img src={platform === 'qq' ? '/icons/vip-qq.svg' : platform === 'kugou' ? '/icons/vip-kugou.svg' : '/icons/vip-netease.svg'} alt="VIP" className="search-result-vip-icon" />
                      )}
                    </span>
                  </div>
                );
              })}
              <div className="search-view-all" onClick={() => setCurrentView('search')}>
                查看全部结果 →
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
