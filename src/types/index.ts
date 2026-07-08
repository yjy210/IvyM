export interface Song {
  id: string;
  mid?: string;
  hash?: string;
  name: string;
  artists: string;
  album: string;
  duration: number;
  source: 'netease' | 'qq';
  url?: string;
  cover?: string;
  lyric?: string;
}

export interface SearchResult {
  netease: Song[];
  qq: Song[];
  keyword: string;
}

export type PlayMode = 'sequence' | 'loop' | 'shuffle';

export interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playMode: PlayMode;
  playlist: Song[];
  searchResults: SearchResult | null;
  searchKeyword: string;

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
  setSearchResults: (result: SearchResult | null) => void;
  setSearchKeyword: (keyword: string) => void;
}
