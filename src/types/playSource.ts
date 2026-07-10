export enum SourceReason {
  NETWORK_ERROR = 'NETWORK_ERROR',
  SONG_REMOVED = 'SONG_REMOVED',
  COOKIE_EXPIRED = 'COOKIE_EXPIRED',
  UNKNOWN = 'UNKNOWN',
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
