import type { Song } from '../types/song';
import type { PlaySourceResult, PlayOptions, SourceReason } from '../types/playSource';

const API_BASE = 'http://localhost:3001';

export async function getPlayUrl(song: Song, options?: PlayOptions): Promise<PlaySourceResult> {
  if (!song) return { success: false, error: SourceReason.UNKNOWN };

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
      if (data.code === 403 && data.reason === 'vip_required') {
        return { success: false, error: SourceReason.LOGIN_REQUIRED };
      }
      return { success: false, error: SourceReason.UNKNOWN };
    }

    return {
      success: true,
      source: {
        url: data.data.url,
        quality: options?.quality,
        bitrate: data.data.bitrate,
        format: data.data.format,
      },
    };
  } catch {
    return { success: false, error: SourceReason.NETWORK_ERROR };
  }
}
