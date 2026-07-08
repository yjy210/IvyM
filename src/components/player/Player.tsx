import { useState, useRef, useEffect, useCallback } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import ElasticSlider from './ElasticSlider';
import Folder from './Folder';
import './player.css';
import './ElasticSlider.css';
import './Folder.css';

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
  const searchResults = usePlayerStore(s => s.searchResults);
  const play = usePlayerStore(s => s.play);
  const pause = usePlayerStore(s => s.pause);
  const playNext = usePlayerStore(s => s.playNext);
  const playPrev = usePlayerStore(s => s.playPrev);
  const setPlayMode = usePlayerStore(s => s.setPlayMode);
  const setPlaylist = usePlayerStore(s => s.setPlaylist);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(70);
  const [songUrl, setSongUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showSaveToPlaylist, setShowSaveToPlaylist] = useState(false);
  const [commentTab, setCommentTab] = useState<'netease' | 'qq'>('netease');

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

  useEffect(() => {
    if (currentSong) {
      fetchSongUrl(currentSong);
    } else {
      setSongUrl(null);
    }
  }, [currentSong, fetchSongUrl]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying && songUrl) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, songUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  const onTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
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

  // 点击外部关闭弹窗
  useEffect(() => {
    if (!showVolume && !showPlaylist && !showLyrics && !showComments && !showSaveToPlaylist) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const popups = document.querySelectorAll('.player-popup, .player-volume-popup');
      const btns = document.querySelectorAll('[data-popup-btn]');
      let shouldClose = true;
      popups.forEach(p => { if (p.contains(target)) shouldClose = false; });
      btns.forEach(b => { if (b.contains(target)) shouldClose = false; });
      if (shouldClose) {
        setShowVolume(false);
        setShowPlaylist(false);
        setShowLyrics(false);
        setShowComments(false);
        setShowSaveToPlaylist(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showVolume, showPlaylist, showLyrics, showComments, showSaveToPlaylist]);

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

  const progressPct = duration ? (currentTime / duration) * 100 : 0;

  // 是否有两个平台的评论
  const hasBothPlatforms = currentSong && searchResults &&
    searchResults.netease.some((n: Song) => n.name === currentSong.name && n.artists === currentSong.artists) &&
    searchResults.qq.some((q: Song) => q.name === currentSong.name && q.artists === currentSong.artists);

  return (
    <>
      <audio
        ref={audioRef}
        src={songUrl || undefined}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
      />

      <div className="player-bar">
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

          {/* 控制按钮 */}
          <div className="player-controls">
            <button className={`player-btn${isLiked ? ' liked' : ''}`} onClick={toggleLike} title="喜欢">
              <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>

            <button className="player-btn" data-popup-btn onClick={() => setShowComments(!showComments)} title="评论">
              <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>

            <button className={`player-btn${playMode !== 'sequence' ? ' active' : ''}`} onClick={togglePlayMode} title={playMode === 'sequence' ? '顺序播放' : playMode === 'loop' ? '单曲循环' : '随机播放'}>
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

            <button className="player-btn" data-popup-btn onClick={() => setShowPlaylist(!showPlaylist)} title="播放列表">
              <svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>

            <button className="player-btn" data-popup-btn onClick={() => setShowLyrics(!showLyrics)} title="歌词">
              <svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </button>

            <div className="player-volume-wrapper">
              <button
                className="player-btn"
                data-popup-btn
                onClick={() => setShowVolume(!showVolume)}
                title="音量"
              >
                {volume >= 50 ? (
                  <svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                )}
              </button>
            </div>

            <div className="player-save-btn">
              <Folder size={0.35} items={[]} />
            </div>
          </div>
        </div>
      </div>

      {/* ── 弹出面板 ── */}

      {/* 歌词 */}
      {showLyrics && (
        <div className="player-popup">
          <div className="player-popup-header">
            <span className="player-popup-title">歌词</span>
            <button className="player-popup-close" onClick={() => setShowLyrics(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="player-popup-body player-lyrics">
            <p>暂无歌词</p>
          </div>
        </div>
      )}

      {/* 播放列表 */}
      {showPlaylist && (
        <div className="player-popup">
          <div className="player-popup-header">
            <span className="player-popup-title">当前播放 ({playlist.length})</span>
            <button className="player-popup-close" onClick={() => setShowPlaylist(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
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
                    <div className="playlist-item-cover" />
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
      )}

      {/* 评论区 */}
      {showComments && (
        <div className="player-popup">
          <div className="player-popup-header">
            <span className="player-popup-title">评论</span>
            <button className="player-popup-close" onClick={() => setShowComments(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="player-popup-body">
            {hasBothPlatforms && (
              <div className="comment-tabs">
                <button className={`comment-tab${commentTab === 'netease' ? ' active' : ''}`} onClick={() => setCommentTab('netease')}>网易云音乐</button>
                <button className={`comment-tab${commentTab === 'qq' ? ' active' : ''}`} onClick={() => setCommentTab('qq')}>QQ音乐</button>
              </div>
            )}
            <div className="comment-empty">暂无评论</div>
          </div>
        </div>
      )}

      {/* 收藏到歌单 */}
      {showSaveToPlaylist && (
        <div className="player-popup">
          <div className="player-popup-header">
            <span className="player-popup-title">收藏到歌单</span>
            <button className="player-popup-close" onClick={() => setShowSaveToPlaylist(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
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
      )}
    </>
  );
}
