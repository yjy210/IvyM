import { create } from 'zustand';
import type { PlayerState, Song, PlayMode } from '../types';
import type { AudioQuality } from '../types/playSource';

export const DEFAULT_QUALITY: AudioQuality = 'standard';

export type { ViewType } from '../types';

/**
 * ★ 播放器隐藏状态提升到全局：
 *   - Player 是唯一写入方（通过 setPlayerHidden）
 *   - LyricsPage / 其他组件订阅只读
 *   避免在多个组件里重复挂 useAutoHidePlayer 导致状态不一致 / 内容不显现。
 */
export const usePlayerStore = create<PlayerState & {
  playerHidden: boolean;
  setPlayerHidden: (hidden: boolean) => void;
}>((set, get) => ({
  currentSong: null,
  currentUrl: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.7,
  playMode: 'sequence',
  playlist: [],
  currentView: 'home',
  currentQuality: DEFAULT_QUALITY,

  coverOpen: false,
  coverColor: 'rgb(120, 70, 110)',

  // ★ 新增：全局播放器隐藏状态
  playerHidden: false,
  setPlayerHidden: (hidden: boolean) => set({ playerHidden: hidden }),

  play: (song, url) => set({ currentSong: song, isPlaying: true, currentTime: 0, currentUrl: url ?? null }),
  pause: () => set({ isPlaying: false }),
  resume: () => set({ isPlaying: true }),
  seek: (time) => set({ currentTime: time }),
  setVolume: (vol) => set({ volume: Math.max(0, Math.min(1, vol)) }),
  setPlayMode: (mode) => set({ playMode: mode }),
  setPlaylist: (songs) => set({ playlist: songs }),
  setCurrentView: (view) => set({ currentView: view }),
  setCurrentUrl: (url) => set({ currentUrl: url }),
  setCurrentQuality: (q: AudioQuality) => set({ currentQuality: q }),

  toggleCover: () => set(s => ({ coverOpen: !s.coverOpen })),
  setCoverOpen: (open: boolean) => set({ coverOpen: open }),
  setCoverColor: (color: string) => set({ coverColor: color }),

  playNext: () => {
    const { playlist, currentSong, playMode } = get();
    if (playlist.length === 0) return;
    const idx = playlist.findIndex(s => s.id === currentSong?.id);

    let nextIdx: number;
    if (playMode === 'shuffle') {
      nextIdx = Math.floor(Math.random() * playlist.length);
    } else if (playMode === 'loop') {
      nextIdx = idx;
    } else {
      nextIdx = (idx + 1) % playlist.length;
    }
    set({ currentSong: playlist[nextIdx], isPlaying: true, currentTime: 0 });
  },

  playPrev: () => {
    const { playlist, currentSong } = get();
    if (playlist.length === 0) return;
    const idx = playlist.findIndex(s => s.id === currentSong?.id);
    const prevIdx = (idx - 1 + playlist.length) % playlist.length;
    set({ currentSong: playlist[prevIdx], isPlaying: true, currentTime: 0 });
  },
}));
