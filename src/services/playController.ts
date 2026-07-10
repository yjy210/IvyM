import type { Song } from '../types/song';
import type { Account } from '../types/account';
import type { PlayPermission } from '../types/permission';
import { checkPlayPermission } from './playPermission';
import { emitPlayEvent } from '../events/playEvents';

export interface PlayResult {
  permission: PlayPermission;
  url: string | null;
  started: boolean;
}

let currentAccount: Account | null = null;
const API_BASE = 'http://localhost:3001';

export function setCurrentAccount(account: Account | null): void {
  currentAccount = account;
}

async function fetchSongUrl(song: Song): Promise<string | null> {
  if (!song) return null;
  const path = song.platform === 'netease' ? 'netease' : song.platform === 'qq' ? 'qq' : 'kugou';
  const param = song.platform === 'netease' ? `id=${song.id}` : song.platform === 'qq' ? `mid=${song.mid || song.id}` : `hash=${song.hash || song.id}`;
  const res = await fetch(`${API_BASE}/api/${path}/url?${param}`);
  const data = await res.json();
  if (data.code === 403 && data.reason === 'vip_required') return null;
  return data.data?.url || null;
}

export async function playSong(song: Song): Promise<PlayResult> {
  const permission = checkPlayPermission(song, currentAccount ?? undefined);

  if (permission.type === 'forbidden') {
    emitPlayEvent({ type: 'VIP_REQUIRED', songId: song.id, platform: song.platform, message: permission.reason ?? '暂不可播放' });
    return { permission, url: null, started: false };
  }

  const url = await fetchSongUrl(song);
  if (!url) {
    emitPlayEvent({ type: 'VIP_REQUIRED', songId: song.id, platform: song.platform, message: '无法获取播放链接' });
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
