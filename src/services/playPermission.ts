import type { Song } from '../types/song';
import type { Account } from '../types/account';
import type { PlayPermission } from '../types/permission';

const REASON = {
  VIP_ONLY: '该歌曲需要VIP会员',
  REGION_BLOCKED: '该歌曲在当前地区不可用',
  COPYRIGHT_RESTRICTED: '版权限制，暂不可播放',
  SONG_UNAVAILABLE: '歌曲暂不可播放',
} as const;

export function checkPlayPermission(song: Song, account?: Account): PlayPermission {
  if (!account || account.platform !== song.platform) {
    return { type: 'forbidden', reason: REASON.SONG_UNAVAILABLE };
  }

  const { membership } = account;

  if (song.platform === 'netease') {
    if (!song.vip) return { type: 'full' };
    if (membership.status === 'vip') return { type: 'full' };
    return { type: 'trial', duration: 30, reason: REASON.VIP_ONLY };
  }

  if (song.platform === 'qq') {
    if (!song.vip) return { type: 'full' };
    if (membership.status === 'vip') return { type: 'full' };
    return { type: 'trial', duration: 30, reason: REASON.VIP_ONLY };
  }

  if (song.platform === 'kugou') {
    if (!song.vip) return { type: 'full' };
    if (membership.status === 'vip') return { type: 'full' };
    return { type: 'trial', duration: 30, reason: REASON.VIP_ONLY };
  }

  return { type: 'full' };
}
