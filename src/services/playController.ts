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

export function setCurrentAccount(account: Account | null): void {
  currentAccount = account;
}

export async function playSong(song: Song, options?: PlayOptions): Promise<PlayResult> {
  const permission = checkPlayPermission(song, currentAccount ?? undefined);
  console.log('[PLAY_TRACE] permission:', permission.type, 'reason:', permission.reason);

  if (permission.type === 'forbidden') {
    console.log('[PLAY_TRACE] emitting PERMISSION_DENIED');
    emitPlayEvent({
      type: PlayEventType.PERMISSION_DENIED,
      songId: song.id,
      platform: song.platform,
      reason: permission.reason as string,
      message: permission.reason ?? PermissionReason.SONG_UNAVAILABLE,
    });
    return { permission, source: null, started: false };
  }

  const result = await getPlayUrl(song, options);
  console.log('[PLAY_TRACE] getPlayUrl result:', result.success, 'error:', result.error);
  if (!result.success) {
    console.log('[PLAY_TRACE] emitting SOURCE_FAILED');
    emitPlayEvent({
      type: PlayEventType.SOURCE_FAILED,
      songId: song.id,
      platform: song.platform,
      reason: result.error,
      message: getErrorMessage(result.error),
    });
    return { permission, source: null, started: false };
  }

  console.log('[PLAY_TRACE] emitting PLAY_STARTED');
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
