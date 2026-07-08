import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { gsap } from 'gsap';
import { usePlayerStore } from '../../stores/playerStore';
import GlassSurface from './GlassSurface';
import './search-bar.css';

interface Song {
  id: string;
  mid?: string;
  name: string;
  artists: string;
  album?: string;
  duration?: number;
  source?: string;
  fee?: number; // 1=VIP, 0=免费
}

interface MergedSong {
  id: string;
  name: string;
  artists: string;
  sources: { platform: 'netease' | 'qq'; fee?: number }[];
}

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
    setTimeout(() => searchRef.current?.focus(), 400);
  }, [isOpen]);

  const closeSearch = useCallback(() => {
    if (!isOpen || !islandRef.current) return;
    setIsOpen(false);
    gsap.to(islandRef.current, { width: 40, duration: 0.5, ease: 'power2.out' });
    gsap.to(islandRef.current.querySelector('.s-input-area'), { opacity: 0, duration: 0.15 });
    gsap.set(islandRef.current.querySelector('.s-input-area'), { pointerEvents: 'none' });
    gsap.set(islandRef.current.querySelector('.s-click-area'), { pointerEvents: 'auto' });
    gsap.to(islandRef.current.querySelector('.s-search-icon'), { opacity: 1, scale: 1, duration: 0.3, delay: 0.2, ease: 'back.out' });
    setKeyword('');
    setSearchResults(null);
  }, [isOpen, setSearchResults]);

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

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSearch(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, closeSearch]);

  const doSearch = useCallback(async (kw: string) => {
    if (!kw.trim()) { setSearchResults(null); return; }
    setLoading(true);
    try {
      const [neteaseRes, qqRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/netease/search?keyword=${encodeURIComponent(kw)}&limit=10`),
        fetch(`${API_BASE}/api/qq/search?keyword=${encodeURIComponent(kw)}&limit=10`),
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

  useEffect(() => {
    if (!keyword.trim()) return;
    const timer = setTimeout(() => doSearch(keyword), 400);
    return () => clearTimeout(timer);
  }, [keyword, doSearch]);

  // 合并相同歌曲（按 歌名+艺人 匹配）
  const mergedSongs: MergedSong[] = useMemo(() => {
    if (!searchResults) return [];
    const map = new Map<string, MergedSong>();

    searchResults.netease.forEach((song: Song) => {
      const key = `${song.name}-${song.artists}`;
      if (!map.has(key)) {
        map.set(key, { id: song.id, name: song.name, artists: song.artists, sources: [] });
      }
      map.get(key)!.sources.push({ platform: 'netease', fee: song.fee });
    });

    searchResults.qq.forEach((song: Song) => {
      const key = `${song.name}-${song.artists}`;
      if (!map.has(key)) {
        map.set(key, { id: song.mid || song.id, name: song.name, artists: song.artists, sources: [] });
      }
      map.get(key)!.sources.push({ platform: 'qq', fee: song.fee });
    });

    return Array.from(map.values());
  }, [searchResults]);

  const selectSong = useCallback((song: MergedSong) => {
    // 找到对应原始歌曲并加入播放列表
    if (searchResults) {
      const all: Song[] = [];
      song.sources.forEach(s => {
        if (s.platform === 'netease') {
          const found = searchResults.netease.find((n: Song) => n.name === song.name && n.artists === song.artists);
          if (found) all.push(found);
        } else {
          const found = searchResults.qq.find((q: Song) => q.name === song.name && q.artists === song.artists);
          if (found) all.push(found);
        }
      });
      setPlaylist(all);
    }
  }, [searchResults, setPlaylist]);

  const showPanel = keyword.trim().length > 0;

  return (
    <>
      {/* 搜索 Island - 顶部居中 */}
      <div className="search-island-wrapper" ref={islandRef}>
        <GlassSurface
          width="100%"
          height={40}
          borderRadius={999}
          backgroundOpacity={0.08}
          saturation={1.2}
          blur={16}
          distortionScale={-150}
          redOffset={5}
          greenOffset={15}
          blueOffset={25}
          brightness={60}
          opacity={0.8}
          mixBlendMode="screen"
          className="search-island"
        >
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
        </GlassSurface>
      </div>

      {/* 搜索结果面板 */}
      {showPanel && (
        <div className="search-results-panel" ref={panelRef} style={{ visibility: 'visible', opacity: 1 }}>
          {loading && <div className="search-empty">搜索中...</div>}

          {!loading && mergedSongs.length === 0 && (
            <div className="search-empty">未找到相关结果</div>
          )}

          {!loading && mergedSongs.length > 0 && (
            mergedSongs.map((song, i) => (
              <div key={`s-${i}`} className="search-result-item" onClick={() => selectSong(song)}>
                <div className="search-result-cover" />
                <div className="search-result-info">
                  <div className="search-result-name">{song.name}</div>
                  <div className="search-result-artist">{song.artists}</div>
                </div>
                <div className="search-result-badges">
                  {song.sources.map((src, j) => (
                    <span key={j} className={`search-result-source ${src.platform} ${src.fee === 1 ? 'is-vip' : ''}`}>
                      {src.platform === 'netease' ? '网易云' : 'QQ'}
                      {src.fee === 1 && (src.platform === 'netease' ? ' 黑胶' : ' 绿钻')}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
