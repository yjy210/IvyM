import type { Song } from './song';
import type { Account } from './account';

export enum PermissionReason {
  VIP_ONLY = 'VIP_ONLY',
  REGION_BLOCKED = 'REGION_BLOCKED',
  COPYRIGHT_RESTRICTED = 'COPYRIGHT_RESTRICTED',
  SONG_UNAVAILABLE = 'SONG_UNAVAILABLE',
}

export interface PlayPermission {
  type: 'full' | 'trial' | 'forbidden';
  duration?: number;
  reason?: PermissionReason | string;
}

export function checkPlayPermission(song: Song, account?: Account): PlayPermission {
  // 不需要VIP的歌曲 → 直接允许
  if (!song.requiresVip) return { type: 'full' };

  // 需要VIP但未登录 → 试听
  if (!account) return { type: 'trial', duration: 30, reason: PermissionReason.VIP_ONLY };

  // 需要VIP且已登录 → 检查会员状态
  const { membership } = account;
  if (membership.status === 'vip') return { type: 'full' };

  // 需要VIP但非会员 → 试听
  return { type: 'trial', duration: 30, reason: PermissionReason.VIP_ONLY };
}
