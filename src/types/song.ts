export interface Song {
  id: string;
  name: string;
  artist: string;
  album?: string;
  duration?: number;
  platform: 'netease' | 'qq' | 'kugou';
  cover: string;
  source?: string;
  vip?: boolean;
  mid?: string;
  hash?: string;
  url?: string;
}
