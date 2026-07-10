export type { Song } from './song';
export type { Account, Membership } from './account';
export type { PlaySource, PlayResult, PlayOptions } from './playSource';
export type { PlayEvent, PlayEventListener } from './playEvent';

export { PlayEventType } from './playEvent';
export type { AudioQuality } from './playSource';

export type PlayMode = 'sequence' | 'loop' | 'shuffle';
export type ViewType = 'home' | 'search' | 'playlist' | 'favorite';

export interface PlayerState {
  currentSong: Song | null;
  currentUrl: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playMode: PlayMode;
  playlist: Song[];
  currentView: ViewType;
  currentQuality: string;

  play: (song: Song, url?: string) => void;
  pause: () => void;
  resume: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  setPlayMode: (mode: PlayMode) => void;
  setPlaylist: (songs: Song[]) => void;
  playNext: () => void;
  playPrev: () => void;
  setCurrentView: (view: ViewType) => void;
  setCurrentUrl: (url: string | null) => void;
  setCurrentQuality: (q: string) => void;
}
