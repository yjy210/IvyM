export enum PlayEventType {
  PLAY_STARTED = 'PLAY_STARTED',
  TRIAL_END = 'TRIAL_END',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  SOURCE_FAILED = 'SOURCE_FAILED',
}

export interface PlayEvent {
  type: PlayEventType;
  message: string;
  songId?: string;
  platform?: string;
  reason?: string;
}

export type PlayEventListener = (event: PlayEvent) => void;
