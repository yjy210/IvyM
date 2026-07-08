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
  fee?: number;
  cover?: string;
}

interface MergedSong {
  id: string;
  name: string;
  artists: string;
  sources: { platform: 'netease' | 'qq'; vip: boolean; cover?: string }[];
  cover?: string;
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

  // 搜索
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

  // 防抖
  useEffect(() => {
    if (!keyword.trim()) return;
    const timer = setTimeout(() => doSearch(keyword), 400);
    return () => clearTimeout(timer);
  }, [keyword, doSearch]);

  // 合并相同歌曲
  const mergedSongs: MergedSong[] = useMemo(() => {
    if (!searchResults) return [];
    const map = new Map<string, MergedSong>();

    searchResults.netease.forEach((song: Song) => {
      const key = `${song.name}-${song.artists}`;
      if (!map.has(key)) {
        map.set(key, { id: song.id, name: song.name, artists: song.artists, sources: [], cover: song.cover });
      }
      map.get(key)!.sources.push({ platform: 'netease', vip: song.vip || false, cover: song.cover });
    });

    searchResults.qq.forEach((song: Song) => {
      const key = `${song.name}-${song.artists}`;
      if (!map.has(key)) {
        map.set(key, { id: song.mid || song.id, name: song.name, artists: song.artists, sources: [], cover: song.cover });
      }
      map.get(key)!.sources.push({ platform: 'qq', vip: song.vip || false, cover: song.cover });
    });

    return Array.from(map.values());
  }, [searchResults]);

  const selectSong = useCallback((song: MergedSong) => {
    if (searchResults) {
      // 找到第一个可用平台的歌并播放
      for (const src of song.sources) {
        if (src.platform === 'netease') {
          const found = searchResults.netease.find((n: Song) => n.name === song.name && n.artists === song.artists);
          if (found) { play(found); return; }
        } else {
          const found = searchResults.qq.find((q: Song) => q.name === song.name && q.artists === song.artists);
          if (found) { play(found); return; }
        }
      }
    }
  }, [searchResults, play]);

  const showPanel = keyword.trim().length > 0;
  const getSrcLabel = (platform: 'netease' | 'qq') => platform === 'netease' ? '网易云' : 'QQ';

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
          {!loading && mergedSongs.length === 0 && <div className="search-empty">未找到相关结果</div>}
          {!loading && mergedSongs.length > 0 && (
            mergedSongs.map((song, i) => (
              <div key={`s-${i}`} className="search-result-item" onClick={() => selectSong(song)}>
                {song.cover ? (
                  <img src={song.cover} alt="" className="search-result-cover" />
                ) : (
                  <img src="/logo.png" alt="IvyM" className="search-result-cover" />
                )}
                <div className="search-result-info">
                  <div className="search-result-name">{song.name}</div>
                  <div className="search-result-artist">{song.artists}</div>
                </div>
                <div className="search-result-sources">
                  {song.sources.map((src, j) => (
                    <span key={j} className={`search-result-source ${src.platform} ${src.vip ? 'is-vip' : ''}`}>
                      {getSrcLabel(src.platform)}{src.vip ? 'VIP' : ''}
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
