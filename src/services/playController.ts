import type { Song } from '../types/song';
import type { PlaySource, PlayOptions } from '../types/playSource';
import { getPlayUrl } from './playUrlService';
import { emitPlayEvent } from '../events/playEvents';
import { PlayEventType } from '../types';

export interface PlayResult {
  source: PlaySource | null;
  started: boolean;
}

export async function playSong(song: Song, options?: PlayOptions): PlayResult {
  // 直接获取播放源，权限由后端决定
  const result = await getPlayUrl(song, options);

  if (!result.success || !result.source) {
    emitPlayEvent({
      id: makeEventId(),
      type: PlayEventType.SOURCE_FAILED,
      songId: song.id,
      platform: song.platform,
      reason: result.error || 'unknown',
      message: getErrorMessage(result.error),
    });
    return { source: null, started: false };
  }

  // 播放开始 — 通知 UI 当前播放模式
  emitPlayEvent({
    id: makeEventId(),
    type: PlayEventType.PLAY_STARTED,
    songId: song.id,
    platform: song.platform,
    message: result.source.playMode === 'trial' ? `trial:${result.source.trialDuration}` : '',
  });

  return { source: result.source, started: true };
}

function makeEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getErrorMessage(error?: string): string {
  const messages: Record<string, string> = {
    no_url: '无法获取播放链接',
    network_error: '网络错误，请检查连接',
    unavailable: '歌曲暂不可用',
    vip_required: '请先登录',
  };
  return messages[error || ''] || '播放失败';
}
