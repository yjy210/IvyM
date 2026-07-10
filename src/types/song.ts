export interface Song {
  id: string;
  name: string;
  artists: string;
  album?: string;
  duration?: number;
  platform: 'netease' | 'qq' | 'kugou';
  cover: string;
  source?: string;
  requiresVip: boolean;
  mid?: string;
  hash?: string;
  url?: string;
}
