import type { Song } from '../types/song';
import type { Account } from '../types/account';
import type { PlayPermission } from '../types/permission';
import { PermissionReason } from '../types/events';

export function checkPlayPermission(song: Song, account?: Account): PlayPermission {
  if (!account || account.platform !== song.platform) {
    return { type: 'forbidden', reason: PermissionReason.SONG_UNAVAILABLE };
  }

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
