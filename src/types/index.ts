export type { Song, PlaySource } from './song';
export type { Account, Membership } from './account';
export type { PlayPermission } from './permission';
export type { PlayEvent, PlayEventListener } from './playEvent';

export { PermissionReason } from './permission';
export { SourceReason } from './playSource';
export { PlayEventType } from './playEvent';
export { checkPlayPermission } from './permission';
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
  currentQuality: import('./playSource').AudioQuality;

  // actions
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
  setCurrentQuality: (q: import('./playSource').AudioQuality) => void;
}
