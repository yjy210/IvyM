/** 歌曲类型 — 只负责显示，不参与权限判断 */
export interface Song {
  id: string;
  name: string;
  artists: string;
  album?: string;
  duration?: number;
  platform: 'netease' | 'qq';
  cover: string;
  source?: string;
  mid?: string;
  hash?: string;
  url?: string;
  badge: { vip: boolean; name?: string };  // 仅用于UI显示VIP图标
}
