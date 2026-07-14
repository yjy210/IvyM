import { useState, useRef, useEffect, useCallback } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
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

  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(70);
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState<'lyrics' | 'playlist' | 'save' | null>(null);
  const volumeBtnRef = useRef<HTMLButtonElement>(null);
  const prevVolumeRef = useRef(70);
  const [trialEndTime, setTrialEndTime] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<{ id: string; message: string } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const currentUrl = usePlayerStore(s => s.currentUrl);
  const toggleCover = usePlayerStore(s => s.toggleCover);
  const { gsapRef, visible } = useAutoHidePlayer();

  // 喜欢的歌曲
  const [likes, setLikes] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('ivym_likes') || '[]'); }
    catch { return []; }
  });

  // 歌单列表
  const [playlists, setPlaylists] = useState<{name: string, songs: Song[]}[]>(() => {
    try { return JSON.parse(localStorage.getItem('ivym_playlists') || '[]'); }
    catch { return [{name: '我喜欢的音乐', songs: []}]; }
  });

  const API_BASE = 'http://localhost:3001';

  // DEBUG: 测量播放器文字区域实际宽度
  useEffect(() => {
    if (!currentSong) return;
    const timer = setTimeout(() => {
      const main = document.querySelector('.player-main') as HTMLElement;
      const songInfo = document.querySelector('.player-song-info') as HTMLElement;
      const text = document.querySelector('.player-text') as HTMLElement;
      const name = document.querySelector('.player-song-name') as HTMLElement;
      const artist = document.querySelector('.player-song-artist') as HTMLElement;
      const log = (el: HTMLElement | null, label: string) => {
        if (!el) { console.log(`[${label}] NOT FOUND`); return; }
        const s = getComputedStyle(el);
        console.log(`[${label}] w=${el.offsetWidth}px display=${s.display} flex=${s.flex} grow=${s.flexGrow} shrink=${s.flexShrink} basis=${s.flexBasis} minW=${s.minWidth} maxW=${s.maxWidth}`);
      };
      console.log('===== 播放器文字区域测量 =====');
      log(main, 'player-main');
      log(songInfo, 'player-song-info');
      log(text, 'player-text');
      log(name, 'player-song-name');
      log(artist, 'player-song-artist');
    }, 500);
    return () => clearTimeout(timer);
  }, [currentSong]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying && currentUrl) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  const onTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
    // ★ 试听结束 → 暂停 + Toast + 自动下一首（走权限检查）
    if (trialEndTime && audioRef.current.currentTime >= trialEndTime) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      setIsPlaying(false);
      const finishedSong = currentSong;
      setTrialEndTime(null);
      // 试听结束 Toast（新歌开始前先显示）
      const trialMsg = finishedSong?.isVip
        ? '试听结束，开通会员畅听完整版'
        : `试听结束，${finishedSong?.trialRequiresMembership ? '该歌曲需要会员' : '30秒试听已结束'}`;
      setToastMsg({ id: `trial-end-${Date.now()}`, message: trialMsg });
      // 延迟后走权限检查再播下一首
      setTimeout(() => {
        autoPlayNext();
        // Toast 在新歌开始后才消失（3.5s 应已足够）
        setTimeout(() => setToastMsg(null), 3500);
      }, 800);
    }
  };

  // 点击播放按钮 → 预取 URL → 播放
  const handlePlay = useCallback(async () => {
    if (!currentSong) return;
    const result = await playSong(currentSong, { quality: currentQuality });
    if (result.started && result.source) {
      setTrialEndTime(result.source.playMode === 'trial' ? result.source.trialDuration : null);
      play(currentSong, result.source.url);
    }
  }, [currentSong, play, currentQuality]);

  // 监听播放事件 — Toast 带 ID，避免旧定时器清掉新 Toast
  useEffect(() => {
    const unsub = onPlayEvent(e => {
      if (e.type === 'PLAY_STARTED') {
        if (e.message?.startsWith('trial:')) {
          const duration = e.message.split(':')[1];
          setToastMsg({ id: e.id, message: '会员可畅听完整版' });
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          toastTimerRef.current = window.setTimeout(() => {
            setToastMsg(cur => (cur?.id === e.id ? null : cur));
          }, 3000);
        }
        return;
      }
      // 其他事件 → 直接显示
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
    // 优先使用搜索结果中的真实duration（毫秒转秒），fallback到audio元数据
    if (currentSong?.duration) {
      setDuration(currentSong.duration / 1000);
    } else if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const onEnded = () => {
    if (playMode === 'loop') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
      return;
    }
    // ★ 歌曲自然结束后，走权限检查再播下一首
    autoPlayNext();
  };

  /** 带权限检查的自动下一首：曲库循环播完时不触发，无下一首时不触发 */
  const autoPlayNext = useCallback(async () => {
    const { playlist, currentSongId, playMode } = usePlayerStore.getState();
    if (playlist.length === 0) return;
    const idx = playlist.findIndex(s => s.id === currentSongId);
    let nextIdx: number;
    if (playMode === 'shuffle') {
      nextIdx = Math.floor(Math.random() * playlist.length);
    } else {
      nextIdx = (idx + 1) % playlist.length;
    }
    const nextSong = playlist[nextIdx];
    if (!nextSong) return;

    try {
      const result = await playSong(nextSong, { quality: currentQuality });
      if (result.started && result.source) {
        setTrialEndTime(result.source.playMode === 'trial' ? result.source.trialDuration : null);
        play(nextSong, result.source.url);
      }
      // 失败事件由 playController 通过 emitPlayEvent 处理 → 前端 Toast
    } catch { /* ignore */ }
  }, [play, currentQuality]);


  const togglePlayMode = () => {
    const modes: Array<'sequence' | 'loop' | 'shuffle'> = ['sequence', 'loop', 'shuffle'];
    const idx = modes.indexOf(playMode);
    setPlayMode(modes[(idx + 1) % modes.length]);
  };

  const isLiked = currentSong ? likes.includes(`${currentSong.source}-${currentSong.id || currentSong.mid}`) : false;

  const toggleLike = () => {
    if (!currentSong) return;
    const key = `${currentSong.source}-${currentSong.id || currentSong.mid}`;
    let newLikes: string[];
    if (likes.includes(key)) {
      newLikes = likes.filter(k => k !== key);
    } else {
      newLikes = [...likes, key];
      // 同时添加到"我喜欢的音乐"歌单
      const newPlaylists = playlists.map(p => {
        if (p.name === '我喜欢的音乐' && !p.songs.find(s => `${s.source}-${s.id || s.mid}` === key)) {
          return { ...p, songs: [...p.songs, currentSong] };
        }
        return p;
      });
      setPlaylists(newPlaylists);
      localStorage.setItem('ivym_playlists', JSON.stringify(newPlaylists));
    }
    setLikes(newLikes);
    localStorage.setItem('ivym_likes', JSON.stringify(newLikes));
  };

  // 保存到歌单
  const saveToPlaylist = (playlistIdx: number) => {
    if (!currentSong || playlistIdx < 0) return;
    const key = `${currentSong.source}-${currentSong.id || currentSong.mid}`;
    const target = playlists[playlistIdx];
    if (target.songs.find(s => `${s.source}-${s.id || s.mid}` === key)) return; // 已在歌单
    const newPlaylists = playlists.map((p, i) => {
      if (i === playlistIdx) return { ...p, songs: [...p.songs, currentSong] };
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

  const onProgressChange = (v: number) => {
    if (audioRef.current && duration) {
      audioRef.current.currentTime = (v / 100) * duration;
    }
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

      {/* ★ 播放器自动隐藏：外层 wrapper 控制 translateY 动画 */}
      <div className="player-bar-anim-wrapper" ref={gsapRef}>
        <div className="player-bar">
          <GlassSurface
            width="100%"
            height="100%"
            borderRadius={20}
            brightness={85}
            opacity={0.35}
            blur={4}
            displace={4}
            distortionScale={-40}
            saturation={1.4}
            className="player-glass"
          >
            <div className="player-glass-inner" />
          </GlassSurface>

          <div className="player-content">
          {/* 进度条 */}
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

          {/* 主内容 */}
          <div className="player-main">
          {/* 歌曲信息 */}
          <div className="player-song-info">
            <div
              className="player-cover-hit"
              onClick={(e) => { e.stopPropagation(); toggleCover(); }}
              title="查看封面"
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

          {/* ★ 左侧：喜欢 + 歌词（紧跟歌曲信息） */}
          <div className="player-left-tools">
            <button className={`player-btn${isLiked ? ' liked' : ''}`} onClick={toggleLike} title="喜欢">
              <i className="iconfont icon-xihuan" />
            </button>
            <button className={`player-btn${popup === 'lyrics' ? ' active' : ''}`} data-popup-btn onClick={() => setPopup(p => p === 'lyrics' ? null : 'lyrics')} title="歌词">
              <i className="iconfont icon-bold icon-geci32" />
            </button>
          </div>

          {/* ★ 中间：播放控制（绝对居中于播放器，永不受其他元素宽度影响） */}
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
                <svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x1="14" y1="4" x2="14" y2="16"/></svg>
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

          {/* ★ 右侧：收藏 + 音量 */}
          <div className="player-right-tools">
            <button className="player-btn player-btn-save" data-popup-btn onClick={() => setPopup(p => p === 'save' ? null : 'save')} title="收藏到歌单">
              <img src="/icons/jiahaojilu.svg" alt="收藏" className="player-save-icon" />
            </button>
            <div className="player-volume-wrapper">
              <button
                ref={volumeBtnRef}
                className="player-btn"
                onClick={() => {
                  if (volume > 0) {
                    prevVolumeRef.current = volume;
                    setVolume(0);
                  } else {
                    setVolume(prevVolumeRef.current || 70);
                  }
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
        </div>{/* end player-content */}
      </div>

      {/* ── 弹出面板（始终渲染，CSS 控制显隐） ── */}

      <div className={`player-popup${popup === 'lyrics' ? ' active' : ''}`} data-popup="lyrics">
        <div className="player-popup-header">
          <span className="player-popup-title">歌词</span>
          <button className="player-popup-close" onClick={() => setPopup(null)}>×</button>
        </div>
        <div className="player-popup-body player-lyrics">
          <p>暂无歌词</p>
        </div>
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
              const key = currentSong ? `${currentSong.source}-${currentSong.id || currentSong.mid}` : '';
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

      {/* 播放权限 Toast（试听/VIP/失败） */}
      {toastMsg && <Toast message={toastMsg.message} duration={3000} />}
      </div>{/* ★ end player-bar-anim-wrapper */}

      {/* ★ 迷你进度条：纯黑色，仅播放器隐藏时显示 */}
      {!visible && (
        <div className="player-mini-progress" style={{ width: `${progressPct}%` }} />
      )}
    </>
  );
}
