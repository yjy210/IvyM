export interface Membership {
  status: 'vip' | 'normal' | 'unknown';
  expire?: string;
}

export interface Account {
  platform: 'netease' | 'qq' | 'kugou';
  nickname: string;
  avatar: string;
  userId: string;
  membership: Membership;
}
