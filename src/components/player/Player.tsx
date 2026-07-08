import { useState, useRef, useEffect, useCallback } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import './player.css';

export default function Player() {
  const currentSong = usePlayerStore(s => s.currentSong);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const playMode = usePlayerStore(s => s.playMode);
  const play = usePlayerStore(s => s.play);
  const pause = usePlayerStore(s => s.pause);
  const playNext = usePlayerStore(s => s.playNext);
  const playPrev = usePlayerStore(s => s.playPrev);
  const setPlayMode = usePlayerStore(s => s.setPlayMode);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [songUrl, setSongUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const API_BASE = 'http://localhost:3001';

  // 获取播放地址
  const fetchSongUrl = useCallback(async (song: typeof currentSong) => {
    if (!song) return;
    setLoading(true);
    try {
      let url: string | null = null;
      if (song.source === 'netease') {
        const res = await fetch(`${API_BASE}/api/netease/url?id=${song.id}`);
        const data = await res.json();
        url = data.data?.url || null;
      } else if (song.source === 'qq') {
        const res = await fetch(`${API_BASE}/api/qq/url?mid=${song.mid || song.id}`);
        const data = await res.json();
        url = data.data?.url || null;
      }
      setSongUrl(url);
    } catch {
      setSongUrl(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 当前歌曲变化时获取 URL
  useEffect(() => {
    if (currentSong) {
      fetchSongUrl(currentSong);
    } else {
      setSongUrl(null);
    }
  }, [currentSong, fetchSongUrl]);

  // 播放/暂停控制
  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying && songUrl) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, songUrl]);

  // 音量控制
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // 音频事件
  const onTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const onEnded = () => {
    if (playMode === 'loop') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
    } else {
      playNext();
    }
  };

  // 进度条点击
  const onProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pct * duration;
  };

  // 音量条点击
  const onVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    setVolume(Math.max(0, Math.min(1, pct)));
  };

  // 切换播放模式
  const togglePlayMode = () => {
    const modes: Array<'sequence' | 'loop' | 'shuffle'> = ['sequence', 'loop', 'shuffle'];
    const idx = modes.indexOf(playMode);
    setPlayMode(modes[(idx + 1) % modes.length]);
  };

  // 格式化时间
  const fmt = (s: number) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="player-bar">
      <audio
        ref={audioRef}
        src={songUrl || undefined}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
      />

      {/* 歌曲信息 */}
      <div className="player-song-info">
        {currentSong?.cover ? (
          <img src={currentSong.cover} alt="" className="player-cover" />
        ) : (
          <div className="player-cover" />
        )}
        <div className="player-text">
          <div className="player-song-name">{currentSong?.name || '未选择歌曲'}</div>
          <div className="player-song-artist">{currentSong?.artists || '搜索并选择歌曲播放'}</div>
        </div>
      </div>

      {/* 控制区 */}
      <div className="player-controls">
        <div className="player-btns">
          <button className="player-btn player-mode" onClick={togglePlayMode} title={playMode === 'sequence' ? '顺序播放' : playMode === 'loop' ? '单曲循环' : '随机播放'}>
            {playMode === 'sequence' && (
              <svg viewBox="0 0 24 24"><line x1="2" y1="6" x2="22" y2="6"/><line x1="2" y1="18" x2="22" y2="18"/><line x1="14" y1="9" x2="22" y2="9"/><line x1="14" y1="15" x2="22" y2="15"/></svg>
            )}
            {playMode === 'loop' && (
              <svg viewBox="0 0 24 24"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="10" y="15" fontSize="8" fill="currentColor" stroke="none">1</text></svg>
            )}
            {playMode === 'shuffle' && (
              <svg viewBox="0 0 24 24"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
            )}
          </button>

          <button className="player-btn" onClick={playPrev} title="上一首">
            <svg viewBox="0 0 24 24"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
          </button>

          <button className="player-btn player-btn-play" onClick={() => isPlaying ? pause() : (currentSong ? play(currentSong) : null)} title={isPlaying ? '暂停' : '播放'}>
            {isPlaying ? (
              <svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            ) : (
              <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            )}
          </button>

          <button className="player-btn" onClick={playNext} title="下一首">
            <svg viewBox="0 0 24 24"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
          </button>
        </div>

        <div className="player-progress-row">
          <span className="player-time">{fmt(currentTime)}</span>
          <div className="player-progress" onClick={onProgressClick}>
            <div className="player-progress-bar" style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }} />
          </div>
          <span className="player-time">{fmt(duration)}</span>
        </div>
      </div>

      {/* 音量 */}
      <div className="player-volume">
        <svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
        <div className="player-volume-slider" onClick={onVolumeClick}>
          <div className="player-volume-bar" style={{ width: `${volume * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
