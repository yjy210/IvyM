export interface Song {
  id: string;
  mid?: string;
  hash?: string;
  name: string;
  artists: string;
  album?: string;
  duration?: number;
  source: 'netease' | 'qq' | 'kugou';
  url?: string;
  cover?: string;
  lyric?: string;
  vip?: boolean;
}

export type PlayMode = 'sequence' | 'loop' | 'shuffle';

/** 当前显示的页面视图 */
export type ViewType = 'home' | 'search' | 'playlist' | 'favorite';

export interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playMode: PlayMode;
  playlist: Song[];
  currentView: ViewType;

  // actions
  play: (song: Song) => void;
  pause: () => void;
  resume: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  setPlayMode: (mode: PlayMode) => void;
  setPlaylist: (songs: Song[]) => void;
  playNext: () => void;
  playPrev: () => void;
  setCurrentView: (view: ViewType) => void;
}
