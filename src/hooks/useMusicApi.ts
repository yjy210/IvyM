import { useCallback } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import type { Song, SearchResult } from '../types';

const API_BASE = 'http://localhost:3001';

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export function useMusicApi() {
  const { setSearchResults, setPlaylist } = usePlayerStore.getState();

  const searchAll = useCallback(async (keyword: string) => {
    if (!keyword.trim()) return;

    // 双源并行搜索（网易云 + QQ）
    const [netease, qq] = await Promise.allSettled([
      fetchJSON<{ code: number; data: Song[] }>(`${API_BASE}/api/netease/search?keyword=${encodeURIComponent(keyword)}`),
      fetchJSON<{ code: number; data: Song[] }>(`${API_BASE}/api/qq/search?keyword=${encodeURIComponent(keyword)}`),
    ]);

    const result: SearchResult = {
      netease: netease.status === 'fulfilled' && netease.value?.code === 200 ? netease.value.data : [],
      qq: qq.status === 'fulfilled' && qq.value?.code === 200 ? qq.value.data : [],
      keyword,
    };

    setSearchResults(result);

    // 合并所有结果作为播放列表
    const all = [...result.netease, ...result.qq];
    setPlaylist(all);

    return result;
  }, [setSearchResults, setPlaylist]);

  const getSongUrl = useCallback(async (song: Song): Promise<string | null> => {
    try {
      if (song.source === 'netease') {
        const res = await fetchJSON<{ code: number; data: { url: string } | null }>(
          `${API_BASE}/api/netease/url?id=${song.id}`
        );
        return res.data?.url || null;
      }
      if (song.source === 'qq') {
        const res = await fetchJSON<{ code: number; data: { url: string } | null }>(
          `${API_BASE}/api/qq/url?mid=${song.mid || song.id}`
        );
        return res.data?.url || null;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  return { searchAll, getSongUrl };
}
