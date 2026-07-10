export type PlayEventType = 'TRIAL_END' | 'VIP_REQUIRED' | 'PLAY_FAILED' | 'PLAY_STARTED';

export interface PlayEvent {
  type: PlayEventType;
  message: string;
  songId?: string;
  platform?: string;
}

export type PlayEventListener = (event: PlayEvent) => void;
