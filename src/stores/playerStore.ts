import { create } from 'zustand';
import type { PlayerState, Song, SearchResult, PlayMode } from '../types';

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSong: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.7,
  playMode: 'sequence',
  playlist: [],
  searchResults: null,
  searchKeyword: '',
  currentView: 'home',

  play: (song) => set({ currentSong: song, isPlaying: true, currentTime: 0 }),
  pause: () => set({ isPlaying: false }),
  resume: () => set({ isPlaying: true }),
  seek: (time) => set({ currentTime: time }),
  setVolume: (vol) => set({ volume: Math.max(0, Math.min(1, vol)) }),
  setPlayMode: (mode) => set({ playMode: mode }),
  setPlaylist: (songs) => set({ playlist: songs }),
  setSearchResults: (result) => set({ searchResults: result }),
  setSearchKeyword: (keyword) => set({ searchKeyword: keyword }),
  setCurrentView: (view) => set({ currentView: view }),

  /** 将更多歌曲追加到指定平台（无限滚动加载更多） */
  appendSearchResults: (platform, songs, hasMore) =>
    set(state => {
      if (!state.searchResults) return state;
      const existing = state.searchResults[platform];
      return {
        searchResults: {
          ...state.searchResults,
          [platform]: {
            ...existing,
            songs: [...existing.songs, ...songs],
            page: existing.page + 1,
            hasMore,
            loading: false,
          },
        },
      };
    }),

  /** 标记平台是否正在加载（防止重复请求） */
  setPlatformLoading: (platform, loading) =>
    set(state => {
      if (!state.searchResults) return state;
      return {
        searchResults: {
          ...state.searchResults,
          [platform]: { ...state.searchResults[platform], loading },
        },
      };
    }),

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
