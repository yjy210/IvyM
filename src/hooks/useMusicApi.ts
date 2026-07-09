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
      fetchJSON<{ code: number; data: Song[]; total?: number }>(`${API_BASE}/api/netease/search?keyword=${encodeURIComponent(keyword)}`),
      fetchJSON<{ code: number; data: Song[]; total?: number }>(`${API_BASE}/api/qq/search?keyword=${encodeURIComponent(keyword)}`),
    ]);

    const neteaseData = netease.status === 'fulfilled' && netease.value?.code === 200 ? netease.value : null;
    const qqData = qq.status === 'fulfilled' && qq.value?.code === 200 ? qq.value : null;
    const limit = 30;

    const result: SearchResult = {
      keyword,
      netease: { songs: neteaseData?.data || [], page: 1, hasMore: (neteaseData?.total || 0) > limit, loading: false },
      qq: { songs: qqData?.data || [], page: 1, hasMore: (qqData?.total || 0) > limit, loading: false },
      kugou: { songs: [], page: 1, hasMore: false, loading: false },
    };

    setSearchResults(result);

    // 合并所有结果作为播放列表
    const all = [...result.netease.songs, ...result.qq.songs];
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
