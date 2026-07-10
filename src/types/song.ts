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
  url?: string;  // 播放 URL（运行时附加，不持久化）
}
