import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { useSearchStore } from '../stores/searchStore';
import type { Song } from '../types';
import './search-page.css';

type Platform = 'all' | 'netease' | 'qq' | 'kugou';

interface SearchProps {
  onScrollInfo?: (info: { firstVisibleSong: { name: string; artists: string } | null }) => void;
}

export default function Search({ onScrollInfo }: SearchProps) {
  const results = useSearchStore(s => s.results);
  const loadMore = useSearchStore(s => s.loadMore);
  const play = usePlayerStore(s => s.play);

  const [activeFilter, setActiveFilter] = useState<Platform>('all');
  const sentinelRef = useRef<HTMLDivElement>(null);
  const songRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // 根据筛选+轮询获取歌曲列表
  const allSongs = useMemo(() => {
    if (!results) return [];
    const list: { song: Song; platform: 'netease' | 'qq' | 'kugou' }[] = [];
    const { songs: neteaseSongs } = results.netease;
    const { songs: qqSongs } = results.qq;
    const { songs: kugouSongs } = results.kugou;

    if (activeFilter === 'all') {
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
    } else if (activeFilter === 'netease') {
      neteaseSongs.forEach(s => list.push({ song: s, platform: 'netease' }));
    } else if (activeFilter === 'qq') {
      qqSongs.forEach(s => list.push({ song: s, platform: 'qq' }));
    } else {
      kugouSongs.forEach(s => list.push({ song: s, platform: 'kugou' }));
    }
    return list;
  }, [results, activeFilter]);

  // 无限滚动
  const handleLoadMore = useCallback(() => {
    if (activeFilter === 'all') {
      loadMore('netease');
      loadMore('qq');
      loadMore('kugou');
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

  // 监听滚动，检测第一首可见歌曲
  useEffect(() => {
    if (!onScrollInfo) return;
    const container = sentinelRef.current?.closest('.flex-1');
    if (!container) return;

    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top;
      let firstVisible: { name: string; artists: string } | null = null;
      songRefs.current.forEach((el, key) => {
        const rect = el.getBoundingClientRect();
        const isVisible = rect.top >= containerTop - 50 && rect.top < containerTop + 200 && rect.bottom > containerTop;
        if (isVisible && !firstVisible) {
          const [platform, id, idx] = key.split('-');
          const entry = allSongs.find((e, i) => `${e.platform}-${e.song.id}-${i}` === key);
          if (entry) {
            firstVisible = { name: entry.song.name, artists: entry.song.artists };
          }
        }
      });
      onScrollInfo({ firstVisibleSong: firstVisible });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => container.removeEventListener('scroll', handleScroll);
  }, [onScrollInfo, allSongs]);

  if (!results) return null;
  const sourceLabel = (p: string) => p === 'netease' ? '网易云' : p === 'qq' ? 'QQ' : '酷狗';

  return (
    <div className="search-page">
      {/* 平台筛选 */}
      <div className="filter-bar">
        {([
          { key: 'all', label: '全部', count: results.netease.songs.length + results.qq.songs.length + results.kugou.songs.length, color: 'rgba(0,0,0,0.75)' },
          { key: 'netease', label: '网易云', count: results.netease.songs.length, color: '#ec4141' },
          { key: 'qq', label: 'QQ', count: results.qq.songs.length, color: '#31c27c' },
          { key: 'kugou', label: '酷狗', count: results.kugou.songs.length, color: '#2196f3' },
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
        {allSongs.map((entry, i) => {
          const key = `${entry.platform}-${entry.song.id}-${i}`;
          return (
            <div
              key={key}
              ref={el => { if (el) songRefs.current.set(key, el); }}
              className="song-card"
              onClick={() => play(entry.song)}
            >
              <img src={entry.song.cover || '/logo.png'} alt="" className="song-cover" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).src = '/logo.png'; }} />
              <div className="song-info">
                <div className="song-name">{entry.song.name}</div>
                <div className="song-artist">{entry.song.artists}</div>
              </div>
              <span className={`song-badge ${entry.platform}`}>{sourceLabel(entry.platform)}</span>
              {entry.song.vip && <img src={`/icons/vip-${entry.platform}.svg`} alt="VIP" className="song-vip" />}
            </div>
          );
        })}
        <div ref={sentinelRef} className="scroll-sentinel" />
      </div>
    </div>
  );
}
