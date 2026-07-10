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
  // 未登录用户允许播放（由后端返回 403 时再提示登录）
  if (!account) return { type: 'full' };

  const { membership } = account;

  if (song.platform === 'netease') {
    if (!song.vip) return { type: 'full' };
    if (membership.status === 'vip') return { type: 'full' };
    return { type: 'trial', duration: 30, reason: PermissionReason.VIP_ONLY };
  }

  if (song.platform === 'qq') {
    if (!song.vip) return { type: 'full' };
    if (membership.status === 'vip') return { type: 'full' };
    return { type: 'trial', duration: 30, reason: PermissionReason.VIP_ONLY };
  }

  if (song.platform === 'kugou') {
    if (!song.vip) return { type: 'full' };
    if (membership.status === 'vip') return { type: 'full' };
    return { type: 'trial', duration: 30, reason: PermissionReason.VIP_ONLY };
  }

  return { type: 'full' };
}
