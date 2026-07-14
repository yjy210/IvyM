import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { useSearchStore } from '../stores/searchStore';
import { usePlaySong } from '../hooks/usePlaySong';
import type { Song } from '../types/song';
import './search-page.css';

type Platform = 'all' | 'netease' | 'qq';

export default function Search() {
  const results = useSearchStore(s => s.results);
  const loadMore = useSearchStore(s => s.loadMore);
  const { playSong } = usePlaySong();

  const [activeFilter, setActiveFilter] = useState<Platform>('all');
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 根据筛选+轮询获取歌曲列表
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

  // 无限滚动
  const handleLoadMore = useCallback(() => {
    if (activeFilter === 'all') {
      loadMore('netease');
      loadMore('qq');
    } else {
      loadMore(activeFilter);
    }
  }, [activeFilter, loadMore]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) handleLoadMore(); },
      { root: sentinelRef.current?.closest('.flex-1'), threshold: 0.1 }
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [handleLoadMore]);

  if (!results) return null;
  const sourceLabel = (p: string) => p === 'netease' ? '网易云' : 'QQ';

  return (
    <div className="search-page">
      {/* 平台筛选 */}
      <div className="filter-bar">
        {([
          { key: 'all', label: '全部', count: results.netease.songs.length + results.qq.songs.length, color: 'rgba(0,0,0,0.75)' },
          { key: 'netease', label: '网易云', count: results.netease.songs.length, color: '#ec4141' },
          { key: 'qq', label: 'QQ', count: results.qq.songs.length, color: '#31c27c' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            className={`filter-tab ${activeFilter === tab.key ? 'active' : ''}`}
            style={activeFilter === tab.key ? { background: tab.color, color: '#fff' } : undefined}
            onClick={() => setActiveFilter(tab.key)}
          >{tab.label} ({tab.count})</button>
        ))}
      </div>

      {/* 歌曲列表 */}
      <div className="song-list">
        {allSongs.map((entry, i) => (
          <div
            key={`${entry.platform}-${entry.song.id}-${i}`}
            className="song-card"
            onClick={() => playSong(entry.song)}
          >
            <img src={entry.song.cover || '/logo.png'} alt="" className="song-cover" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).src = '/logo.png'; }} />
            <div className="song-info">
              <div className="song-name">{entry.song.name}</div>
              <div className="song-artist">{entry.song.artists}</div>
            </div>
            <span className={`song-badge ${entry.platform}`}>{sourceLabel(entry.platform)}</span>
            {entry.song.badge.vip && <img src={`/icons/vip-${entry.platform}.svg`} alt="VIP" className="song-vip" />}
          </div>
        ))}
        <div ref={sentinelRef} className="scroll-sentinel" />
      </div>
    </div>
  );
}
