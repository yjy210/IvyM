import type { Song } from '../types/song';
import type { Account } from '../types/account';
import type { PlayPermission } from '../types/permission';
import { checkPlayPermission, REASON } from './playPermission';
import { getPlayUrl } from './playUrlService';
import { emitPlayEvent } from '../events/playEvents';

export interface PlayResult {
  permission: PlayPermission;
  url: string | null;
  started: boolean;
}

let currentAccount: Account | null = null;

export function setCurrentAccount(account: Account | null): void {
  currentAccount = account;
}

/**
 * 根据 forbidden 原因类型触发不同事件
 */
function emitForbiddenEvent(song: Song, reason: string): void {
  if (reason === REASON.VIP_ONLY) {
    emitPlayEvent({ type: 'VIP_REQUIRED', songId: song.id, platform: song.platform, message: reason });
  } else {
    // REGION_BLOCKED / COPYRIGHT_RESTRICTED / SONG_UNAVAILABLE
    emitPlayEvent({ type: 'PLAY_FAILED', songId: song.id, platform: song.platform, message: reason });
  }
}

export async function playSong(song: Song): Promise<PlayResult> {
  const permission = checkPlayPermission(song, currentAccount ?? undefined);

  if (permission.type === 'forbidden') {
    emitForbiddenEvent(song, permission.reason ?? REASON.SONG_UNAVAILABLE);
    return { permission, url: null, started: false };
  }

  const url = await getPlayUrl(song);
  if (!url) {
    emitForbiddenEvent(song, REASON.VIP_ONLY);
    return { permission, url: null, started: false };
  }

  emitPlayEvent({
    type: 'PLAY_STARTED',
    songId: song.id,
    platform: song.platform,
    message: permission.type === 'trial' ? `trial:${permission.duration}` : '',
  });

  return { permission, url, started: true };
}
