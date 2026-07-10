export enum SourceReason {
  NETWORK_ERROR = 'NETWORK_ERROR',
  SONG_REMOVED = 'SONG_REMOVED',
  COOKIE_EXPIRED = 'COOKIE_EXPIRED',
  QUALITY_UNAVAILABLE = 'QUALITY_UNAVAILABLE',
  LOGIN_REQUIRED = 'LOGIN_REQUIRED',
  UNKNOWN = 'UNKNOWN',
}

export interface PlaySourceResult {
  source: PlaySource | null;
  error?: SourceReason;
}

export type AudioQuality = 'standard' | 'higher' | 'lossless' | 'exhigh';

export interface PlaySource {
  url: string;
  expire?: number;
  quality?: AudioQuality;
  bitrate?: number;
  format?: string;
}

export interface PlayOptions {
  quality?: AudioQuality;
}
