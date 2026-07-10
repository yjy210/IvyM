export enum PlayEventType {
  PLAY_STARTED = 'PLAY_STARTED',
  TRIAL_END = 'TRIAL_END',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  SOURCE_FAILED = 'SOURCE_FAILED',
}

export enum PermissionReason {
  VIP_ONLY = 'VIP_ONLY',
  REGION_BLOCKED = 'REGION_BLOCKED',
  COPYRIGHT_RESTRICTED = 'COPYRIGHT_RESTRICTED',
  SONG_UNAVAILABLE = 'SONG_UNAVAILABLE',
}

export enum SourceReason {
  NETWORK_ERROR = 'NETWORK_ERROR',
  SONG_REMOVED = 'SONG_REMOVED',
  COOKIE_EXPIRED = 'COOKIE_EXPIRED',
  UNKNOWN = 'UNKNOWN',
}

export interface PlayEvent {
  type: PlayEventType;
  message: string;
  songId?: string;
  platform?: string;
  reason?: string;
}

export type PlayEventListener = (event: PlayEvent) => void;
