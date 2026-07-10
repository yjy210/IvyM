export enum SourceReason {
  NETWORK_ERROR = 'NETWORK_ERROR',
  SONG_REMOVED = 'SONG_REMOVED',
  COOKIE_EXPIRED = 'COOKIE_EXPIRED',
  UNKNOWN = 'UNKNOWN',
}

export interface PlaySource {
  url: string;
  expire?: number;
  quality?: string;
}
