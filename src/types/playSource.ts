export enum SourceReason {
  NETWORK_ERROR = 'NETWORK_ERROR',
  SONG_REMOVED = 'SONG_REMOVED',
  COOKIE_EXPIRED = 'COOKIE_EXPIRED',
  QUALITY_UNAVAILABLE = 'QUALITY_UNAVAILABLE',
  LOGIN_REQUIRED = 'LOGIN_REQUIRED',
  UNKNOWN = 'UNKNOWN',
}

export type PlaySourceResult =
  | { success: true; source: PlaySource }
  | { success: false; error: SourceReason };

export type AudioQuality = 'standard' | 'higher' | 'lossless' | 'exhigh';

export interface PlaySourceRestriction {
  type: 'trial' | 'full';
  duration?: number;  // trial时长（秒）
}

export interface PlaySource {
  url: string;
  expire?: number;
  quality?: AudioQuality;
  bitrate?: number;
  format?: string;
  restriction: PlaySourceRestriction;
}

export interface PlayOptions {
  quality?: AudioQuality;
}
