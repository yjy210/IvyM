import { useRef, useEffect, useState } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { useMusicApi } from '../hooks/useMusicApi';
import type { Song } from '../types';

export function PlayerBar() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { currentSong, isPlaying, currentTime, duration, volume, playMode, playNext, playPrev, play, pause, seek, setVolume } = usePlayerStore();
  const { getSongUrl } = useMusicApi();
  const [actualUrl, setActualUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!currentSong) { setActualUrl(null); return; }
    getSongUrl(currentSong).then(url => setActualUrl(url));
  }, [currentSong, getSongUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying && actualUrl) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying, actualUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => usePlayerStore.setState({ currentTime: audio.currentTime });
    const onLoaded = () => usePlayerStore.setState({ duration: audio.duration });
    const onEnded = () => playNext();
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('ended', onEnded);
    };
  }, [playNext]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const formatTime = (t: number) => {
    if (!t || isNaN(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-20 bg-white/70 backdrop-blur-xl border-t border-black/5 flex items-center px-4 gap-4 shadow-soft shrink-0">
      <audio ref={audioRef} src={actualUrl || undefined} preload="auto" />

      {/* 歌曲信息 */}
      <div className="flex items-center gap-3 w-56 shrink-0">
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/10 to-purple-100 flex items-center justify-center overflow-hidden shadow-sm">
          {currentSong ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M9 18V5l12-2v13" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="6" cy="18" r="3" stroke="#6366f1" strokeWidth="2" />
              <circle cx="18" cy="16" r="3" stroke="#6366f1" strokeWidth="2" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="rgba(0,0,0,0.1)" strokeWidth="2" />
              <circle cx="12" cy="12" r="3" stroke="rgba(0,0,0,0.1)" strokeWidth="2" />
            </svg>
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm text-text-primary font-medium truncate">
            {currentSong?.name || '未播放'}
          </span>
          <span className="text-xs text-text-muted truncate">
            {currentSong?.artists || '选择一首歌曲'}
          </span>
        </div>
      </div>

      {/* 播放控制 */}
      <div className="flex-1 flex flex-col items-center gap-1.5 max-w-xl">
        <div className="flex items-center gap-4">
          <button className="text-text-muted hover:text-text-primary transition-colors" title={playMode}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M17 1l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 11V9a4 4 0 014-4h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M7 23l-4-4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 13v2a4 4 0 01-4 4H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <button onClick={playPrev} className="text-text-secondary hover:text-text-primary transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>

          <button
            onClick={() => isPlaying ? pause() : currentSong ? play(currentSong) : null}
            className="w-9 h-9 rounded-full bg-primary flex items-center justify-center hover:bg-primary-dark transition-colors shadow-sm"
          >
            {isPlaying ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button onClick={playNext} className="text-text-secondary hover:text-text-primary transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>

          <div className="w-4" />
        </div>

        {/* 进度条 */}
        <div className="w-full flex items-center gap-2">
          <span className="text-xs text-text-muted w-10 text-right">{formatTime(currentTime)}</span>
          <div className="flex-1 h-1 bg-black/8 rounded-full overflow-hidden group cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              seek(pct * duration);
              if (audioRef.current) audioRef.current.currentTime = pct * duration;
            }}
          >
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
            />
          </div>
          <span className="text-xs text-text-muted w-10">{formatTime(duration)}</span>
        </div>
      </div>

      {/* 音量 */}
      <div className="flex items-center gap-2 w-32">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="rgba(0,0,0,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" stroke="rgba(0,0,0,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="flex-1 h-1 accent-primary cursor-pointer"
        />
      </div>
    </div>
  );
}
