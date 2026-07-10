import type { Song } from '../types/song';
import type { Account } from '../types/account';
import type { PlaySource, PlayOptions } from '../types/playSource';
import type { PlayPermission } from '../types/permission';
import { checkPlayPermission } from '../types/permission';
import { getPlayUrl } from './playUrlService';
import { emitPlayEvent } from '../events/playEvents';
import { PlayEventType, PermissionReason, SourceReason } from '../types';

export interface PlayResult {
  permission: PlayPermission;
  source: PlaySource | null;
  started: boolean;
}

let currentAccount: Account | null = null;
let currentOptions: PlayOptions = {};

export function setCurrentAccount(account: Account | null): void {
  currentAccount = account;
}

export function setPlayOptions(options: PlayOptions): void {
  currentOptions = options;
}

export async function playSong(song: Song): Promise<PlayResult> {
  const permission = checkPlayPermission(song, currentAccount ?? undefined);

  if (permission.type === 'forbidden') {
    emitPlayEvent({
      type: PlayEventType.PERMISSION_DENIED,
      songId: song.id,
      platform: song.platform,
      reason: permission.reason as string,
      message: permission.reason ?? PermissionReason.SONG_UNAVAILABLE,
    });
    return { permission, source: null, started: false };
  }

  const source = await getPlayUrl(song, currentOptions);
  if (!source) {
    emitPlayEvent({
      type: PlayEventType.SOURCE_FAILED,
      songId: song.id,
      platform: song.platform,
      reason: SourceReason.UNKNOWN,
      message: '无法获取播放链接',
    });
    return { permission, source: null, started: false };
  }

  emitPlayEvent({
    type: PlayEventType.PLAY_STARTED,
    songId: song.id,
    platform: song.platform,
    message: permission.type === 'trial' ? `trial:${permission.duration}` : '',
  });

  return { permission, source, started: true };
}
