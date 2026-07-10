import type { Song } from '../types/song';

const API_BASE = 'http://localhost:3001';

/**
 * 根据歌曲平台获取播放 URL
 * 仅负责 URL 获取，不涉及权限判断
 */
export async function getPlayUrl(song: Song): Promise<string | null> {
  if (!song) return null;

  const path = song.platform === 'netease' ? 'netease' : song.platform === 'qq' ? 'qq' : 'kugou';
  const param =
    song.platform === 'netease'
      ? `id=${song.id}`
      : song.platform === 'qq'
        ? `mid=${song.mid || song.id}`
        : `hash=${song.hash || song.id}`;

  try {
    const res = await fetch(`${API_BASE}/api/${path}/url?${param}`);
    const data = await res.json();
    if (data.code === 403 && data.reason === 'vip_required') return null;
    return data.data?.url || null;
  } catch {
    return null;
  }
}
