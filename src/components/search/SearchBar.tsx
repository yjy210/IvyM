import { useState, useRef, useEffect, useCallback } from 'react';
import { gsap } from 'gsap';
import { usePlayerStore } from '../../stores/playerStore';
import './search-bar.css';

interface SearchBarProps {
  onSelect?: () => void;
}

export default function SearchBar({ onSelect }: SearchBarProps) {
  const [isActive, setIsActive] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);

  const islandRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  const searchResults = usePlayerStore(s => s.searchResults);
  const setSearchResults = usePlayerStore(s => s.setSearchResults);
  const setPlaylist = usePlayerStore(s => s.setPlaylist);
  const API_BASE = 'http://localhost:3001';

  // 初始化 GSAP timeline
  useEffect(() => {
    if (!islandRef.current || !panelRef.current) return;

    tlRef.current?.revert();

    const expandedWidth = Math.min(window.innerWidth * 0.9, 500);

    tlRef.current = gsap.timeline({ paused: true })
      .to('.search-island', {
        width: expandedWidth,
        duration: 0.7,
        ease: 'back.out(2)',
        easeReverse: 'power2.out',
      }, 0)
      .to('.search-input', {
        opacity: 1,
        duration: 0.3,
        ease: 'power2.out',
      }, 0.2)
      .to('.search-results-panel', {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.5,
        transformOrigin: 'top center',
        ease: 'back.out(1.5)',
        easeReverse: 'power3.out',
      }, 0.1);
  }, []);

  // 展开/收起
  const toggle = useCallback(() => {
    if (!tlRef.current) return;
    if (!isActive) {
      setIsActive(true);
      tlRef.current.timeScale(1).play();
      setTimeout(() => inputRef.current?.focus(), 300);
    } else {
      setIsActive(false);
      tlRef.current.timeScale(1).reverse();
      setKeyword('');
      setSearchResults(null);
    }
  }, [isActive, setSearchResults]);

  // 点击外部收起
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        islandRef.current && !islandRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
        toggle();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isActive, toggle]);

  // Escape 收起
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggle();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isActive, toggle]);

  // 搜索
  const doSearch = useCallback(async (kw: string) => {
    if (!kw.trim()) {
      setSearchResults(null);
      return;
    }
    setLoading(true);
    try {
      const [neteaseRes, qqRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/netease/search?keyword=${encodeURIComponent(kw)}&limit=5`),
        fetch(`${API_BASE}/api/qq/search?keyword=${encodeURIComponent(kw)}&limit=5`),
      ]);

      const netease = neteaseRes.status === 'fulfilled' && (await neteaseRes.value.ok) ? await neteaseRes.value.json() : null;
      const qq = qqRes.status === 'fulfilled' && (await qqRes.value.ok) ? await qqRes.value.json() : null;

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

  // 防抖搜索
  useEffect(() => {
    if (!keyword.trim()) return;
    const timer = setTimeout(() => doSearch(keyword), 400);
    return () => clearTimeout(timer);
  }, [keyword, doSearch]);

  // 选择歌曲
  const selectSong = useCallback((song: any) => {
    const results = usePlayerStore.getState().searchResults;
    if (results) {
      const all = [...results.netease, ...results.qq];
      setPlaylist(all);
    }
    onSelect?.();
    toggle();
  }, [setPlaylist, onSelect, toggle]);

  const hasResults = searchResults && (searchResults.netease.length > 0 || searchResults.qq.length > 0);

  return (
    <>
      {/* 搜索 Island */}
      <div className="search-island" ref={islandRef}>
        <button className="search-toggle" ref={toggleRef} onClick={toggle} aria-label="搜索">
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
        </button>
        <input
          ref={inputRef}
          className="search-input"
          type="text"
          placeholder="搜索歌曲、歌手、专辑..."
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') doSearch(keyword); }}
          style={{ pointerEvents: isActive ? 'auto' : 'none' }}
        />
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
                  <div
                    key={`n-${song.id}-${i}`}
                    className="search-result-item"
                    onClick={() => selectSong(song)}
                  >
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
                  <div
                    key={`q-${song.mid || song.id}-${i}`}
                    className="search-result-item"
                    onClick={() => selectSong(song)}
                  >
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
