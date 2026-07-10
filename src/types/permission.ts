import type { Song } from './song';
import type { Account } from './account';

export interface PlayPermission {
  type: 'full' | 'trial' | 'forbidden';
  duration?: number;
  reason?: string;
}

export function checkPlayPermission(song: Song, account?: Account): PlayPermission {
  // 歌曲本身不需要VIP → 直接允许
  if (!song.badge.vip) return { type: 'full' };

  // 需要VIP但未登录 → 试听
  if (!account) return { type: 'trial', duration: 30, reason: 'VIP_ONLY' };

  // 需要VIP且已登录 → 检查会员状态
  if (account.membership.status === 'vip') return { type: 'full' };

  // 需要VIP但非会员 → 试听
  return { type: 'trial', duration: 30, reason: 'VIP_ONLY' };
}
