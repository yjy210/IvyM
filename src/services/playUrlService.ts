import type { Song } from '../types/song';
import type { PlayResult, PlayOptions } from '../types/playSource';

const API_BASE = 'http://localhost:3001';

/**
 * 获取播放 URL — 仅负责请求，不判断权限
 * 播放权限由后端返回的 playMode 决定
 */
export async function getPlayUrl(song: Song, options?: PlayOptions): Promise<PlayResult> {
  if (!song) return { success: false, error: 'no_song' };

  const path = song.platform === 'netease' ? 'netease' : song.platform === 'qq' ? 'qq' : 'kugou';
  const idParam =
    song.platform === 'netease'
      ? `id=${song.id}`
      : song.platform === 'qq'
        ? `mid=${song.mid || song.id}`
        : `hash=${song.hash || song.id}`;

  const qs = options?.quality ? `${idParam}&quality=${options.quality}` : idParam;

  try {
    const res = await fetch(`${API_BASE}/api/${path}/url?${qs}`);
    const data = await res.json();

    if (!data.data?.url) {
      return { success: false, error: data.reason || 'no_url' };
    }

    return {
      success: true,
      source: {
        url: data.data.url,
        playMode: data.data.playMode || 'full',
        trialDuration: data.data.trialDuration || null,
      },
    };
  } catch {
    return { success: false, error: 'network_error' };
  }
}
