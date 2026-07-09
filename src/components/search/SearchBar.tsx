import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { gsap } from 'gsap';
import { usePlayerStore } from '../../stores/playerStore';
import GlassSurface from './GlassSurface';
import type { Song } from '../../types';
import './search-bar.css';

const HISTORY_KEY = 'ivym_search_history';
const HISTORY_MAX = 10;

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[])'); } catch { return []; }
}
function saveHistory(list: string[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
}
function addHistory(kw: string) {
  const trimmed = kw.trim();
  if (!trimmed) return;
  const list = loadHistory().filter(h => h !== trimmed);
  list.unshift(trimmed);
  saveHistory(list);
}

export default function SearchBar() {
  const [isOpen, setIsOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>(loadHistory);

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

  // 点击外部收起 — 仅当输入框为空时才关闭；有内容时只能点叉号关闭
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (keyword.trim()) return; // 有内容时不允许外部点击关闭
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

  // 搜索（仅更新下拉框预览，不跳转页面）
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
    } catch {
      setSearchResults({ keyword: kw, netease: { songs: [], page: 1, hasMore: false, loading: false }, qq: { songs: [], page: 1, hasMore: false, loading: false }, kugou: { songs: [], page: 1, hasMore: false, loading: false } });
    } finally {
      setLoading(false);
    }
  }, [API_BASE, setSearchResults]);

  // 回车：正式搜索 → 记录历史 + 跳转结果页 + 关闭下拉框
  const submitSearch = useCallback(async (kw: string) => {
    if (!kw.trim()) return;
    addHistory(kw);
    setHistory(loadHistory());
    await doSearch(kw);
    setCurrentView('search');
    closeSearch();
  }, [doSearch, setCurrentView, closeSearch]);

  // 防抖
  useEffect(() => {
    if (!keyword.trim()) return;
    const timer = setTimeout(() => doSearch(keyword), 400);
    return () => clearTimeout(timer);
  }, [keyword, doSearch]);

  // 轮询交替：网易1/QQ1/酷狗1/网易2/QQ2/酷狗2... 平台耗尽自动跳过
  const flatSongs = useMemo(() => {
    if (!searchResults) return [];
    const list: { song: Song; platform: 'netease' | 'qq' | 'kugou' }[] = [];
    const sources: { platform: 'netease' | 'qq' | 'kugou'; songs: Song[] }[] = [
      { platform: 'netease', songs: searchResults.netease.songs },
      { platform: 'qq', songs: searchResults.qq.songs },
      { platform: 'kugou', songs: searchResults.kugou.songs },
    ];
    const maxLen = Math.max(...sources.map(s => s.songs.length));
    for (let i = 0; i < maxLen; i++) {
      for (const src of sources) {
        if (i < src.songs.length) list.push({ song: src.songs[i], platform: src.platform });
      }
    }
    return list;
  }, [searchResults]);

  const selectSong = useCallback((entry: { song: Song; platform: 'netease' | 'qq' | 'kugou' }) => {
    play(entry.song);
  }, [play]);

  // 点击历史项直接搜索
  const selectHistory = useCallback((kw: string) => {
    setKeyword(kw);
    doSearch(kw);
  }, [doSearch]);

  // 删除单条历史
  const removeHistory = useCallback((kw: string) => {
    const next = loadHistory().filter(h => h !== kw);
    saveHistory(next);
    setHistory(next);
  }, []);

  const showPanel = isOpen; // 有内容或空输入（空时展示历史）
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
                onKeyDown={e => { if (e.key === 'Enter') submitSearch(keyword); }}
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
          {/* 有内容时显示搜索结果 */}
          {keyword.trim() && loading && <div className="search-empty">搜索中...</div>}
          {keyword.trim() && !loading && flatSongs.length === 0 && <div className="search-empty">未找到相关结果</div>}
          {keyword.trim() && !loading && flatSongs.length > 0 && (
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
            </>
          )}

          {/* 空输入时显示搜索历史 */}
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

          {/* 空输入且无历史 */}
          {!keyword.trim() && history.length === 0 && (
            <div className="search-empty">输入关键词搜索歌曲</div>
          )}
        </div>
      )}
    </>
  );
}
