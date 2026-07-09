import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { gsap } from 'gsap';
import { usePlayerStore } from '../stores/playerStore';
import type { Song } from '../types';
import './search-page.css';

const API_BASE = 'http://localhost:3001';

type Platform = 'all' | 'netease' | 'qq' | 'kugou';
type SortMode = 'mixed' | 'netease' | 'qq' | 'kugou';

export default function Search() {
  const searchResults = usePlayerStore(s => s.searchResults);
  const play = usePlayerStore(s => s.play);
  const appendSearchResults = usePlayerStore(s => s.appendSearchResults);
  const setPlatformLoading = usePlayerStore(s => s.setPlatformLoading);

  const [activeFilter, setActiveFilter] = useState<Platform>('all');
  const [sortMode, setSortMode] = useState<SortMode>('mixed');
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 根据排序模式排列歌曲
  const allSongs = useMemo(() => {
    if (!searchResults) return [];
    const list: { song: Song; platform: 'netease' | 'qq' | 'kugou' }[] = [];

    const neteaseSongs = searchResults.netease.songs;
    const qqSongs = searchResults.qq.songs;
    const kugouSongs = searchResults.kugou.songs;

    if (sortMode === 'mixed') {
      // 轮询交替：网易1/QQ1/酷狗1/网易2/QQ2/酷狗2...
      const sources = [
        { platform: 'netease' as const, songs: neteaseSongs },
        { platform: 'qq' as const, songs: qqSongs },
        { platform: 'kugou' as const, songs: kugouSongs },
      ];
      const maxLen = Math.max(...sources.map(s => s.songs.length));
      for (let i = 0; i < maxLen; i++) {
        for (const src of sources) {
          if (i < src.songs.length) list.push({ song: src.songs[i], platform: src.platform });
        }
      }
    } else if (sortMode === 'netease') {
      neteaseSongs.forEach(s => list.push({ song: s, platform: 'netease' }));
      qqSongs.forEach(s => list.push({ song: s, platform: 'qq' }));
      kugouSongs.forEach(s => list.push({ song: s, platform: 'kugou' }));
    } else if (sortMode === 'qq') {
      qqSongs.forEach(s => list.push({ song: s, platform: 'qq' }));
      neteaseSongs.forEach(s => list.push({ song: s, platform: 'netease' }));
      kugouSongs.forEach(s => list.push({ song: s, platform: 'kugou' }));
    } else if (sortMode === 'kugou') {
      kugouSongs.forEach(s => list.push({ song: s, platform: 'kugou' }));
      neteaseSongs.forEach(s => list.push({ song: s, platform: 'netease' }));
      qqSongs.forEach(s => list.push({ song: s, platform: 'qq' }));
    }
    return list;
  }, [searchResults, sortMode]);

  // GSAP 筛选动画
  useEffect(() => {
    if (!containerRef.current) return;
    const cards = gsap.utils.toArray<HTMLElement>('.song-card');

    const matching = activeFilter === 'all'
      ? cards
      : cards.filter(c => c.dataset.platform === activeFilter);
    const hidden = activeFilter === 'all'
      ? []
      : cards.filter(c => c.dataset.platform !== activeFilter);

    if (hidden.length) {
      gsap.to(hidden, {
        opacity: 0, scale: 0.92, y: -8,
        duration: 0.25, stagger: { each: 0.02, from: 'start' },
        onComplete: () => gsap.set(hidden, { display: 'none' }),
      });
    }
    gsap.set(matching, { display: 'flex' });
    gsap.fromTo(matching,
      { opacity: 0, scale: 0.95, y: 12 },
      { opacity: 1, scale: 1, y: 0, duration: 0.3, stagger: { each: 0.015 }, overwrite: true }
    );
  }, [activeFilter]);

  // 无限滚动：加载更多
  const loadMore = useCallback(async () => {
    if (!searchResults) return;
    const keyword = searchResults.keyword;
    const platformsToLoad: ('netease' | 'qq' | 'kugou')[] = activeFilter === 'all'
      ? ['netease', 'qq', 'kugou']
      : [activeFilter];

    for (const p of platformsToLoad) {
      const state = searchResults[p];
      if (state.hasMore && !state.loading) {
        setPlatformLoading(p, true);
        try {
          const res = await fetch(
            `${API_BASE}/api/${p}/search?keyword=${encodeURIComponent(keyword)}&limit=30&page=${state.page + 1}`
          );
          const json = await res.json();
          appendSearchResults(p, json.data || [], (state.page + 1) * 30 < (json.total || 0));
        } catch { appendSearchResults(p, [], false); }
        setPlatformLoading(p, false);
      }
    }
  }, [activeFilter, searchResults, appendSearchResults, setPlatformLoading]);

  // IntersectionObserver
  useEffect(() => {
    const scrollParent = containerRef.current?.parentElement;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { root: scrollParent, threshold: 0.1 }
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loadMore]);

  if (!searchResults) return null;

  const sourceLabel = (p: string) => p === 'netease' ? '网易云' : p === 'qq' ? 'QQ' : '酷狗';
  const totalCount = allSongs.length;

  return (
    <div className="search-page" ref={containerRef}>
      {/* 排序菜单 */}
      <div className="sort-bar">
        <span className="sort-label">排序</span>
        {(['mixed', 'netease', 'qq', 'kugou'] as SortMode[]).map(mode => (
          <button
            key={mode}
            className={`sort-tab ${sortMode === mode ? 'active' : ''}`}
            onClick={() => setSortMode(mode)}
          >
            {mode === 'mixed' ? '综合' : mode === 'netease' ? '网易优先' : mode === 'qq' ? 'QQ优先' : '酷狗优先'}
          </button>
        ))}
      </div>

      {/* 平台筛选标签 */}
      <div className="filter-bar">
        <button
          className={`filter-tab ${activeFilter === 'all' ? 'active' : ''}`}
          style={activeFilter === 'all' ? { background: 'rgba(0,0,0,0.75)', color: '#fff' } : undefined}
          onClick={() => setActiveFilter('all')}
        >全部 ({totalCount})</button>
        <button
          className={`filter-tab ${activeFilter === 'netease' ? 'active' : ''}`}
          style={activeFilter === 'netease' ? { background: '#ec4141', color: '#fff' } : undefined}
          onClick={() => setActiveFilter('netease')}
        >网易云 ({searchResults.netease.songs.length})</button>
        <button
          className={`filter-tab ${activeFilter === 'qq' ? 'active' : ''}`}
          style={activeFilter === 'qq' ? { background: '#31c27c', color: '#fff' } : undefined}
          onClick={() => setActiveFilter('qq')}
        >QQ ({searchResults.qq.songs.length})</button>
        <button
          className={`filter-tab ${activeFilter === 'kugou' ? 'active' : ''}`}
          style={activeFilter === 'kugou' ? { background: '#2196f3', color: '#fff' } : undefined}
          onClick={() => setActiveFilter('kugou')}
        >酷狗 ({searchResults.kugou.songs.length})</button>
      </div>

      {/* 歌曲列表 */}
      <div className="song-list">
        {allSongs.map((entry, i) => (
          <div
            key={`${entry.platform}-${entry.song.id}-${i}`}
            className="song-card"
            data-platform={entry.platform}
            onClick={() => play(entry.song)}
          >
            <img src={entry.song.cover || '/logo.png'} alt="" className="song-cover" />
            <div className="song-info">
              <div className="song-name">{entry.song.name}</div>
              <div className="song-artist">{entry.song.artists}</div>
            </div>
            <span className={`song-badge ${entry.platform}`}>{sourceLabel(entry.platform)}</span>
            {entry.song.vip && (
              <img
                src={`/icons/vip-${entry.platform}.svg`}
                alt="VIP"
                className="song-vip"
              />
            )}
          </div>
        ))}
        {/* 无限滚动哨兵 */}
        <div ref={sentinelRef} className="scroll-sentinel" />
      </div>
    </div>
  );
}
