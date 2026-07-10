export type PlayEventType = 'PLAY_STARTED' | 'TRIAL_END' | 'VIP_REQUIRED' | 'PLAY_FAILED';

export interface PlayEvent {
  type: PlayEventType;
  message: string;
  songId?: string;
  platform?: string;
}

export type PlayEventListener = (event: PlayEvent) => void;
