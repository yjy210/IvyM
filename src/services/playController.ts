import type { Song } from '../types/song';
import type { Account } from '../types/account';
import type { PlayPermission } from '../types/permission';
import { checkPlayPermission } from './playPermission';
import { getPlayUrl } from './playUrlService';
import { emitPlayEvent } from '../events/playEvents';
import { PlayEventType, PermissionReason, SourceReason } from '../types/events';

export interface PlayResult {
  permission: PlayPermission;
  url: string | null;
  started: boolean;
}

let currentAccount: Account | null = null;

export function setCurrentAccount(account: Account | null): void {
  currentAccount = account;
}

export async function playSong(song: Song): Promise<PlayResult> {
  const permission = checkPlayPermission(song, currentAccount ?? undefined);

  if (permission.type === 'forbidden') {
    emitPlayEvent({
      type: PlayEventType.PERMISSION_DENIED,
      songId: song.id,
      platform: song.platform,
      reason: permission.reason,
      message: permission.reason ?? PermissionReason.SONG_UNAVAILABLE,
    });
    return { permission, url: null, started: false };
  }

  const url = await getPlayUrl(song);
  if (!url) {
    emitPlayEvent({
      type: PlayEventType.SOURCE_FAILED,
      songId: song.id,
      platform: song.platform,
      reason: SourceReason.UNKNOWN,
      message: '无法获取播放链接',
    });
    return { permission, url: null, started: false };
  }

  emitPlayEvent({
    type: PlayEventType.PLAY_STARTED,
    songId: song.id,
    platform: song.platform,
    message: permission.type === 'trial' ? `trial:${permission.duration}` : '',
  });

  return { permission, url, started: true };
}
