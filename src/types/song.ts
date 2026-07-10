export interface Song {
  id: string;
  name: string;
  artists: string;
  album?: string;
  duration?: number;
  platform: 'netease' | 'qq' | 'kugou';
  cover: string;
  source?: string;
  vip?: boolean;
  mid?: string;
  hash?: string;
}

export interface PlaySource {
  url: string;
  expire?: number;
}
