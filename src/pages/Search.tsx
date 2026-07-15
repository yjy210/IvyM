import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { useSearchStore } from '../stores/searchStore';
import { usePlaySong } from '../hooks/usePlaySong';
import LoadingPuff from '../components/loading/LoadingPuff';
import type { Song } from '../types/song';
import './search-page.css';

type Platform = 'all' | 'netease' | 'qq';

interface FilterOption {
  key: Platform;
  label: string;
  count: number;
  icon: string;
  color: string;
}

export default function Search() {
  const results = useSearchStore(s => s.results);
  const loadMore = useSearchStore(s => s.loadMore);
  const neteaseLoading = useSearchStore(s => s.results?.netease?.loading);
  const qqLoading = useSearchStore(s => s.results?.qq?.loading);
  const neteaseHasMore = useSearchStore(s => s.results?.netease?.hasMore);
  const qqHasMore = useSearchStore(s => s.results?.qq?.hasMore);
  const { playSong } = usePlaySong();

  const [activeFilter, setActiveFilter] = useState<Platform>('all');
  const [filterExpanded, setFilterExpanded] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const allSongs = useMemo(() => {
    if (!results) return [];
    const list: { song: Song; platform: 'netease' | 'qq' }[] = [];
    const { songs: neteaseSongs } = results.netease;
    const { songs: qqSongs } = results.qq;

    if (activeFilter === 'all') {
      const sources = [
        { platform: 'netease' as const, songs: neteaseSongs },
        { platform: 'qq' as const, songs: qqSongs },
      ];
      const maxLen = Math.max(...sources.map(s => s.songs.length));
      for (let i = 0; i < maxLen; i++) {
        for (const src of sources) {
          if (i < src.songs.length) list.push({ song: src.songs[i], platform: src.platform });
        }
      }
    } else if (activeFilter === 'netease') {
      neteaseSongs.forEach(s => list.push({ song: s, platform: 'netease' }));
    } else {
      qqSongs.forEach(s => list.push({ song: s, platform: 'qq' }));
    }
    return list;
  }, [results, activeFilter]);

  const handleLoadMore = useCallback(() => {
    if (activeFilter === 'all') {
      if (neteaseHasMore && !neteaseLoading) loadMore('netease');
      if (qqHasMore && !qqLoading) loadMore('qq');
    } else {
      loadMore(activeFilter);
    }
  }, [activeFilter, loadMore, neteaseHasMore, qqHasMore, neteaseLoading, qqLoading]);

  useEffect(() => {
    if (!sentinelRef.current) return;

    let host: HTMLElement | null = sentinelRef.current.parentElement;
    while (host && host !== document.body) {
      const style = getComputedStyle(host);
      if (/(auto|scroll)/.test(style.overflowY)) break;
      host = host.parentElement;
    }

    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) handleLoadMore(); },
      { root: host, rootMargin: '200px', threshold: 0 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [handleLoadMore]);

  if (!results) return null;

  const filters: FilterOption[] = [
    { key: 'all',     label: '全部',   count: results.netease.songs.length + results.qq.songs.length, icon: '/logo.png',                color: 'rgba(0,0,0,0.75)' },
    { key: 'netease', label: '网易云', count: results.netease.songs.length,                            icon: '/platform-icons/wyy.svg', color: '#ec4141' },
    { key: 'qq',      label: 'QQ',     count: results.qq.songs.length,                                 icon: '/platform-icons/qq.svg',  color: '#31c27c' },
  ];

  const activeOpt = filters.find(f => f.key === activeFilter)!;
  const orderedOpts = [activeOpt, ...filters.filter(f => f.key !== activeFilter)];

  const sourceLabel = (p: string) => p === 'netease' ? '网易云' : 'QQ';

  const isLoading = activeFilter === 'all'
    ? (neteaseLoading || qqLoading)
    : activeFilter === 'netease' ? neteaseLoading : qqLoading;

  const hasMore = activeFilter === 'all'
    ? (neteaseHasMore || qqHasMore)
    : activeFilter === 'netease' ? neteaseHasMore : qqHasMore;

  return (
    <div className="search-page">

      {/* ★ 侧边悬浮筛选面板：右侧 fixed，鼠标 hover 展开为竖向列表 */}
      <div
        className={`filter-side${filterExpanded ? ' expanded' : ''}`}
        onMouseEnter={() => setFilterExpanded(true)}
        onMouseLeave={() => setFilterExpanded(false)}
      >
        {orderedOpts.map((opt) => (
          <button
            key={opt.key}
            className={`filter-side-item${activeFilter === opt.key ? ' active' : ''}`}
            onClick={() => { setActiveFilter(opt.key); setFilterExpanded(false); }}
            title={`${opt.label} (${opt.count})`}
            style={activeFilter === opt.key ? { borderColor: opt.color } : undefined}
          >
            <img src={opt.icon} alt={opt.label} className="filter-side-icon" />
            <span className="filter-side-label">
              <span className="filter-side-label-name">{opt.label}</span>
              <em>({opt.count})</em>
            </span>
          </button>
        ))}
      </div>

      <div className="song-list">
        {allSongs.map((entry, i) => (
          <div
            key={`${entry.platform}-${entry.song.id}-${i}`}
            className="song-card"
            onClick={() => playSong(entry.song)}
          >
            <img
              src={entry.song.cover || '/logo.png'}
              alt=""
              className="song-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => { (e.target as HTMLImageElement).src = '/logo.png'; }}
            />
            <div className="song-info">
              <div className="song-name">{entry.song.name}</div>
              <div className="song-artist">{entry.song.artists}</div>
            </div>
            <span className={`song-badge ${entry.platform}`}>{sourceLabel(entry.platform)}</span>
            {entry.song.badge?.vip && <img src={`/icons/vip-${entry.platform}.svg`} alt="VIP" className="song-vip" />}
          </div>
        ))}

        <div ref={sentinelRef} className="scroll-sentinel" />

        {isLoading && <LoadingPuff />}

        {!isLoading && !hasMore && allSongs.length > 0 && (
          <div className="song-list-end">— 已经到底了 —</div>
        )}
      </div>
    </div>
  );
}
