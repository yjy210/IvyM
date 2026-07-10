import type { Song } from '../types/song';
import type { PlaySource, PlayOptions } from '../types/playSource';

const API_BASE = 'http://localhost:3001';

export async function getPlayUrl(song: Song, options?: PlayOptions): Promise<PlaySource | null> {
  if (!song) return null;

  const path = song.platform === 'netease' ? 'netease' : song.platform === 'qq' ? 'qq' : 'kugou';
  const param =
    song.platform === 'netease'
      ? `id=${song.id}`
      : song.platform === 'qq'
        ? `mid=${song.mid || song.id}`
        : `hash=${song.hash || song.id}`;

  const qs = options?.quality ? `${param}&quality=${options.quality}` : param;

  try {
    const res = await fetch(`${API_BASE}/api/${path}/url?${qs}`);
    const data = await res.json();
    if (data.code === 403 && data.reason === 'vip_required') return null;
    return data.data?.url ? { url: data.data.url } : null;
  } catch {
    return null;
  }
}
