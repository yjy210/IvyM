import { useCallback } from 'react';
import type { Song } from '../types';

const API_BASE = 'http://localhost:3001';

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export function useMusicApi() {
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

  return { getSongUrl };
}
