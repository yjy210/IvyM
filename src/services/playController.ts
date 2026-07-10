import type { Song } from '../types/song';
import type { Account } from '../types/account';
import type { PlaySource, PlayOptions, PlaySourceResult } from '../types/playSource';
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

export function setCurrentAccount(account: Account | null): void {
  currentAccount = account;
}

export async function playSong(song: Song, options?: PlayOptions): Promise<PlayResult> {
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

  const result: PlaySourceResult = await getPlayUrl(song, options);
  if (!result.source) {
    emitPlayEvent({
      type: PlayEventType.SOURCE_FAILED,
      songId: song.id,
      platform: song.platform,
      reason: result.error ?? SourceReason.UNKNOWN,
      message: getErrorMessage(result.error ?? SourceReason.UNKNOWN),
    });
    return { permission, source: null, started: false };
  }

  emitPlayEvent({
    type: PlayEventType.PLAY_STARTED,
    songId: song.id,
    platform: song.platform,
    message: permission.type === 'trial' ? `trial:${permission.duration}` : '',
  });

  return { permission, source: result.source, started: true };
}

function getErrorMessage(reason: SourceReason): string {
  const messages: Record<SourceReason, string> = {
    [SourceReason.NETWORK_ERROR]: '网络错误，请检查网络连接',
    [SourceReason.SONG_REMOVED]: '歌曲已下架',
    [SourceReason.COOKIE_EXPIRED]: '登录已过期，请重新登录',
    [SourceReason.QUALITY_UNAVAILABLE]: '当前音质不可用',
    [SourceReason.LOGIN_REQUIRED]: '请先登录',
    [SourceReason.UNKNOWN]: '无法获取播放链接',
  };
  return messages[reason] || '播放失败';
}
