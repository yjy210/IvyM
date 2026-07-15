import { useState, useRef, useEffect, useCallback } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { useLyricsStore } from '../../store/lyricsStore';
import GlassSurface from './GlassSurface';
import VolumeSlider from './VolumeSlider';
import Toast from './Toast';
import { playSong } from '../../services/playController';
import { onPlayEvent } from '../../events/playEvents';
import MarqueeText from './MarqueeText';
import { useAutoHidePlayer } from './useAutoHidePlayer';
import './player.css';
import './GlassSurface.css';
import './VolumeSlider.css';
import './toast.css';

interface Song {
  id: string;
  mid?: string;
  name: string;
  artists: string;
  source?: string;
  cover?: string;
}

export default function Player() {
  const currentSong = usePlayerStore(s => s.currentSong);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const playMode = usePlayerStore(s => s.playMode);
  const playlist = usePlayerStore(s => s.playlist);
  const play = usePlayerStore(s => s.play);
  const pause = usePlayerStore(s => s.pause);
  const playNext = usePlayerStore(s => s.playNext);
  const playPrev = usePlayerStore(s => s.playPrev);
  const setPlayMode = usePlayerStore(s => s.setPlayMode);
  const setPlaylist = usePlayerStore(s => s.setPlaylist);
  const currentQuality = usePlayerStore(s => s.currentQuality);
  const setPlayerHiddenStore = usePlayerStore(s => s.setPlayerHidden);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(70);
  const [popup, setPopup] = useState<'lyrics' | 'playlist' | 'save' | null>(null);
  const volumeBtnRef = useRef<HTMLButtonElement>(null);
  const prevVolumeRef = useRef(70);
  const [trialEndTime, setTrialEndTime] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<{ id: string; message: string } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const currentUrl = usePlayerStore(s => s.currentUrl);
  // ★ 点击封面 = 开/关歌词页；已删除歌词页右上角 ×
  const toggleLyrics = useLyricsStore((s) => s.toggle);
  const lyricsVisible = useLyricsStore((s) => s.visible);
  const coverOpen = usePlayerStore(s => s.coverOpen);
  const [playerHidden, setPlayerHidden] = useState(false);

  // ★ 用一个稳定的回调把 hidden 状态同时写到本地和全局 store
  const onHiddenChange = useCallback((hidden: boolean) => {
    setPlayerHidden(hidden);
    setPlayerHiddenStore(hidden);
  }, [setPlayerHiddenStore]);

  const { gsapRef } = useAutoHidePlayer(coverOpen, onHiddenChange);

  const [likes, setLikes] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('ivym_likes') || '[]'); }
    catch { return []; }
  });

  const [playlists, setPlaylists] = useState<{name: string, songs: Song[]}[]>(() => {
    try { return JSON.parse(localStorage.getItem('ivym_playlists') || '[]'); }
    catch { return [{name: '我喜欢的音乐', songs: []}]; }
  });

  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying && currentUrl) audioRef.current.play().catch(() => {});
    else audioRef.current.pause();
  }, [isPlaying, currentUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume]);

  // ★ 同步 currentTime + duration 到 store（供歌词页读取）
  const onTimeUpdate = () => {
    if (!audioRef.current) return;
    const t = audioRef.current.currentTime;
    setCurrentTime(t);
    (usePlayerStore as any).setState?.({ currentTime: t });
    if (trialEndTime && t >= trialEndTime) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      const finishedSong = currentSong;
      setTrialEndTime(null);
      const trialMsg = (finishedSong as any)?.isVip
        ? '试听结束，开通会员畅听完整版'
        : `试听结束，${(finishedSong as any)?.trialRequiresMembership ? '该歌曲需要会员' : '30秒试听已结束'}`;
      setToastMsg({ id: `trial-end-${Date.now()}`, message: trialMsg });
      setTimeout(() => {
        autoPlayNext();
        setTimeout(() => setToastMsg(null), 3500);
      }, 800);
    }
  };

  const handlePlay = useCallback(async () => {
    if (!currentSong) return;
    const result = await playSong(currentSong, { quality: currentQuality });
    if (result.started && result.source) {
      setTrialEndTime(result.source.playMode === 'trial' ? result.source.trialDuration : null);
      play(currentSong, result.source.url);
    }
  }, [currentSong, play, currentQuality]);

  useEffect(() => {
    const unsub = onPlayEvent(e => {
      if (e.type === 'PLAY_STARTED') {
        if (e.message?.startsWith('trial:')) {
          setToastMsg({ id: e.id, message: '会员可畅听完整版' });
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          toastTimerRef.current = window.setTimeout(() => {
            setToastMsg(cur => (cur?.id === e.id ? null : cur));
          }, 3000);
        }
        return;
      }
      setToastMsg({ id: e.id, message: e.message });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => {
        setToastMsg(cur => (cur?.id === e.id ? null : cur));
      }, 3000);
    });
    return () => {
      unsub();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const onLoadedMetadata = () => {
    let dur = 0;
    if ((currentSong as any)?.duration) dur = (currentSong as any).duration / 1000;
    else if (audioRef.current) dur = audioRef.current.duration;
    setDuration(dur);
    (usePlayerStore as any).setState?.({ duration: dur });
  };

  const onEnded = () => {
    if (playMode === 'loop') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
      return;
    }
    autoPlayNext();
  };

  const autoPlayNext = useCallback(async () => {
    const { playlist, currentSongId, playMode } = usePlayerStore.getState() as any;
    if (playlist.length === 0) return;
    const idx = playlist.findIndex((s: any) => s.id === currentSongId);
    let nextIdx: number;
    if (playMode === 'shuffle') nextIdx = Math.floor(Math.random() * playlist.length);
    else nextIdx = (idx + 1) % playlist.length;
    const nextSong = playlist[nextIdx];
    if (!nextSong) return;
    try {
      const result = await playSong(nextSong, { quality: currentQuality });
      if (result.started && result.source) {
        setTrialEndTime(result.source.playMode === 'trial' ? result.source.trialDuration : null);
        play(nextSong, result.source.url);
      }
    } catch { /* ignore */ }
  }, [play, currentQuality]);

  const togglePlayMode = () => {
    const modes: Array<'sequence' | 'loop' | 'shuffle'> = ['sequence', 'loop', 'shuffle'];
    const idx = modes.indexOf(playMode);
    setPlayMode(modes[(idx + 1) % modes.length]);
  };

  const isLiked = currentSong
    ? likes.includes(`${currentSong.source}-${currentSong.id || (currentSong as any).mid}`)
    : false;

  const toggleLike = () => {
    if (!currentSong) return;
    const key = `${currentSong.source}-${currentSong.id || (currentSong as any).mid}`;
    let newLikes: string[];
    if (likes.includes(key)) {
      newLikes = likes.filter(k => k !== key);
    } else {
      newLikes = [...likes, key];
      const newPlaylists = playlists.map(p => {
        if (p.name === '我喜欢的音乐' && !p.songs.find(s => `${s.source}-${s.id || s.mid}` === key)) {
          return { ...p, songs: [...p.songs, currentSong as Song] };
        }
        return p;
      });
      setPlaylists(newPlaylists);
      localStorage.setItem('ivym_playlists', JSON.stringify(newPlaylists));
    }
    setLikes(newLikes);
    localStorage.setItem('ivym_likes', JSON.stringify(newLikes));
  };

  const saveToPlaylist = (playlistIdx: number) => {
    if (!currentSong || playlistIdx < 0) return;
    const key = `${currentSong.source}-${currentSong.id || (currentSong as any).mid}`;
    const target = playlists[playlistIdx];
    if (target.songs.find(s => `${s.source}-${s.id || s.mid}` === key)) return;
    const newPlaylists = playlists.map((p, i) => {
      if (i === playlistIdx) return { ...p, songs: [...p.songs, currentSong as Song] };
      return p;
    });
    setPlaylists(newPlaylists);
    localStorage.setItem('ivym_playlists', JSON.stringify(newPlaylists));
  };

  const fmt = (s: number) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progressPct = duration ? Math.min((currentTime / duration) * 100, 100) : 0;

  return (
    <>
      <audio
        ref={audioRef}
        src={currentUrl || undefined}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
      />

      <div className="player-bar-anim-wrapper" ref={gsapRef}>
        <div className="player-bar">
          <GlassSurface
            width="100%" height="100%" borderRadius={20}
            brightness={85} opacity={0.35} blur={4} displace={4}
            distortionScale={-40} saturation={1.4} className="player-glass"
          >
            <div className="player-glass-inner" />
          </GlassSurface>

          <div className="player-content">
            <div className="player-progress-track" onClick={(e) => {
              if (!duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              if (audioRef.current) audioRef.current.currentTime = pct * duration;
            }}>
              <div className="player-progress-fill" style={{ width: `${progressPct}%` }}>
                <span className="player-progress-time" style={{ left: `${progressPct}%` }}>
                  {fmt(currentTime)} / {fmt(duration)}
                </span>
              </div>
            </div>

            <div className="player-main">
              <div className="player-song-info">
                <div
                  className="player-cover-hit"
                  onClick={(e) => { e.stopPropagation(); toggleLyrics(); }}
                  title={lyricsVisible ? '关闭歌词页' : '打开歌词页'}
                >
                  {currentSong?.cover ? (
                    <img src={currentSong.cover} alt="" className="player-cover" />
                  ) : (
                    <img src="/logo.png" alt="IvyM" className="player-cover" />
                  )}
                </div>
                <div className="player-text">
                  <div className="player-song-name">
                    <MarqueeText text={currentSong?.name || '未选择歌曲'} />
                  </div>
                  <div className="player-song-artist">
                    <MarqueeText text={currentSong?.artists || '搜索并选择歌曲播放'} />
                  </div>
                </div>
              </div>

              <div className="player-left-tools">
                <button className={`player-btn${isLiked ? ' liked' : ''}`} onClick={toggleLike} title="喜欢">
                  <i className="iconfont icon-xihuan" />
                </button>
                <button className={`player-btn${popup === 'lyrics' ? ' active' : ''}`} data-popup-btn onClick={() => setPopup(p => p === 'lyrics' ? null : 'lyrics')} title="歌词">
                  <i className="iconfont icon-bold icon-geci32" />
                </button>
              </div>

              <div className="player-play-group">
                <button className={`player-btn${playMode !== 'sequence' ? ' active' : ''}`} onClick={togglePlayMode} title={playMode === 'sequence' ? '顺序播放' : playMode === 'loop' ? '单曲循环' : '随机播放'}>
                  {playMode === 'sequence' && <i className="iconfont icon-a-shunxupoppy_icon_positive_order" />}
                  {playMode === 'loop' && <i className="iconfont icon-a-25px" />}
                  {playMode === 'shuffle' && <i className="iconfont icon-suiji" />}
                </button>
                <button className="player-btn" onClick={playPrev} title="上一首">
                  <svg viewBox="0 0 24 24"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
                </button>
                <button className="player-btn player-btn-play" onClick={() => isPlaying ? pause() : handlePlay()} title={isPlaying ? '暂停' : '播放'}>
                  {isPlaying ? (
                    <svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  )}
                </button>
                <button className="player-btn" onClick={playNext} title="下一首">
                  <svg viewBox="0 0 24 24"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
                </button>
                <button className="player-btn playlist-btn" data-popup-btn onClick={() => setPopup(p => p === 'playlist' ? null : 'playlist')} title="播放列表">
                  <svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                </button>
              </div>

              <div className="player-right-tools">
                <button className="player-btn player-btn-save" data-popup-btn onClick={() => setPopup(p => p === 'save' ? null : 'save')} title="收藏到歌单">
                  <img src="/icons/jiahaojilu.svg" alt="收藏" className="player-save-icon" />
                </button>
                <div className="player-volume-wrapper">
                  <button
                    ref={volumeBtnRef}
                    className="player-btn"
                    onClick={() => {
                      if (volume > 0) { prevVolumeRef.current = volume; setVolume(0); }
                      else { setVolume(prevVolumeRef.current || 70); }
                    }}
                    title={volume === 0 ? '取消静音' : '静音'}
                  >
                    {volume === 0 ? (
                      <img src="/icons/sound.svg" alt="静音" className="volume-icon" />
                    ) : volume >= 50 ? (
                      <svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                    ) : (
                      <svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                    )}
                  </button>
                  <div className="volume-popover">
                    <span className="volume-value">{volume}%</span>
                    <div className="volume-panel">
                      <VolumeSlider value={volume} onChange={setVolume} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={`player-popup${popup === 'lyrics' ? ' active' : ''}`} data-popup="lyrics">
            <div className="player-popup-header">
              <span className="player-popup-title">歌词</span>
              <button className="player-popup-close" onClick={() => setPopup(null)}>×</button>
            </div>
            <div className="player-popup-body player-lyrics"><p>暂无歌词</p></div>
          </div>

          <div className={`player-popup${popup === 'playlist' ? ' active' : ''}`} data-popup="playlist">
            <div className="player-popup-header">
              <span className="player-popup-title">当前播放 ({playlist.length})</span>
              <button className="player-popup-close" onClick={() => setPopup(null)}>×</button>
            </div>
            <div className="player-popup-body">
              {playlist.length === 0 ? (
                <div className="comment-empty">播放列表为空</div>
              ) : (
                playlist.map((song, i) => (
                  <div
                    key={`${song.source}-${song.id}-${i}`}
                    className={`playlist-item${currentSong?.id === song.id && currentSong?.source === song.source ? ' current' : ''}`}
                    onClick={() => play(song)}
                  >
                    {song.cover ? (
                      <img src={song.cover} alt="" className="playlist-item-cover" />
                    ) : (
                      <img src="/logo.png" alt="IvyM" className="playlist-item-cover" />
                    )}
                    <div className="playlist-item-info">
                      <div className="playlist-item-name">{song.name}</div>
                      <div className="playlist-item-artist">{song.artists}</div>
                    </div>
                    <span className={`playlist-item-source ${song.source || 'netease'}`}>
                      {song.source === 'qq' ? 'QQ' : '网易云'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={`player-popup${popup === 'save' ? ' active' : ''}`} data-popup="save">
            <div className="player-popup-header">
              <span className="player-popup-title">收藏到歌单</span>
              <button className="player-popup-close" onClick={() => setPopup(null)}>×</button>
            </div>
            <div className="player-popup-body">
              <div className="save-playlist-list">
                {playlists.map((pl, i) => {
                  const key = currentSong ? `${currentSong.source}-${currentSong.id || (currentSong as any).mid}` : '';
                  const hasSong = pl.songs.find(s => `${s.source}-${s.id || s.mid}` === key);
                  return (
                    <div key={i} className="save-playlist-item" onClick={() => saveToPlaylist(i)}>
                      <div className="save-playlist-icon">
                        <svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                      </div>
                      <div className="save-playlist-info">
                        <div className="save-playlist-name">{pl.name}</div>
                        <div className="save-playlist-count">{pl.songs.length} 首</div>
                      </div>
                      <span className={`save-playlist-hint${hasSong ? ' has' : ''}`}>
                        {hasSong ? '已添加' : '点击添加'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {toastMsg && <Toast message={toastMsg.message} duration={3000} />}
        </div>
      </div>

      {/* ★ 迷你进度条：仅播放器隐藏 & 歌词页未开时显示（歌词页有自己的进度条） */}
      {playerHidden && !lyricsVisible && (
        <div className="player-mini-progress" style={{ width: `${progressPct}%` }} />
      )}
    </>
  );
}
