export interface SongVipBadge {
  vip: boolean;       // 仅用于UI显示VIP图标
  name?: string;      // 如"豪华绿钻"、"黑胶VIP"
}

export interface SongAvailability {
  trial: boolean;     // 是否允许试听
  full: boolean;      // 是否允许完整播放
}

export interface Song {
  id: string;
  name: string;
  artists: string;
  album?: string;
  duration?: number;
  platform: 'netease' | 'qq' | 'kugou';
  cover: string;
  source?: string;
  mid?: string;
  hash?: string;
  url?: string;
  badge: SongVipBadge;
  availability: SongAvailability;
}
