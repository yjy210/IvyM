import { create } from 'zustand';
import type { Song } from '../types';

export type SearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface PlatformResults {
  songs: Song[];
  page: number;
  hasMore: boolean;
  loading: boolean;
}

export interface SearchResultData {
  keyword: string;
  netease: PlatformResults;
  qq: PlatformResults;
  kugou: PlatformResults;
}

const HISTORY_KEY = 'ivym_search_history';
const HISTORY_MAX = 10;
const API_BASE = 'http://localhost:3001';

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function persistHistory(list: string[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
}

interface SearchState {
  status: SearchStatus;
  keyword: string;
  results: SearchResultData | null;
  searchedKeyword: string; // 当前结果对应的关键词（用于避免重复请求）
  history: string[];
  activeRequests: AbortController | null;

  // actions
  setKeyword: (kw: string) => void;
  search: (kw: string) => Promise<void>;
  loadMore: (platform: 'netease' | 'qq' | 'kugou') => Promise<void>;
  addHistory: (kw: string) => void;
  removeHistory: (kw: string) => void;
  clearHistory: () => void;
  clearResults: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  status: 'idle',
  keyword: '',
  results: null,
  searchedKeyword: '',
  history: loadHistory(),
  activeRequests: null,

  setKeyword: (kw) => set({ keyword: kw }),

  search: async (kw) => {
    const trimmed = kw.trim();
    if (!trimmed) { set({ status: 'idle', results: null }); return; }

    // 已有该关键词的结果且非加载中 → 直接复用，不发重复请求
    const { searchedKeyword, results, status: curStatus } = get();
    if (searchedKeyword === trimmed && results && curStatus !== 'loading') return;

    // 取消上一个请求
    get().activeRequests?.abort();
    const controller = new AbortController();

    set({ status: 'loading', keyword: trimmed, activeRequests: controller });

    try {
      const [neteaseRes, qqRes, kugouRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/netease/search?keyword=${encodeURIComponent(trimmed)}&limit=30&page=1`, { signal: controller.signal }),
        fetch(`${API_BASE}/api/qq/search?keyword=${encodeURIComponent(trimmed)}&limit=30&page=1`, { signal: controller.signal }),
        fetch(`${API_BASE}/api/kugou/search?keyword=${encodeURIComponent(trimmed)}&limit=30&page=1`, { signal: controller.signal }),
      ]);

      if (controller.signal.aborted) return;

      const netease = neteaseRes.status === 'fulfilled' ? await neteaseRes.value.json().catch(() => null) : null;
      const qq = qqRes.status === 'fulfilled' ? await qqRes.value.json().catch(() => null) : null;
      const kugou = kugouRes.status === 'fulfilled' ? await kugouRes.value.json().catch(() => null) : null;
      const limit = 30;

      const result: SearchResultData = {
        keyword: trimmed,
        netease: { songs: netease?.code === 200 ? netease.data || [] : [], page: 1, hasMore: (netease?.total || 0) > limit, loading: false },
        qq: { songs: qq?.code === 200 ? qq.data || [] : [], page: 1, hasMore: (qq?.total || 0) > limit, loading: false },
        kugou: { songs: kugou?.code === 200 ? kugou.data || [] : [], page: 1, hasMore: (kugou?.total || 0) > limit, loading: false },
      };

      const totalSongs = result.netease.songs.length + result.qq.songs.length + result.kugou.songs.length;
      set({ status: totalSongs > 0 ? 'success' : 'empty', results: result, searchedKeyword: trimmed });
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) return;
      set({ status: 'error', results: null });
    }
  },

  loadMore: async (platform) => {
    const { results, keyword, activeRequests } = get();
    if (!results) return;
    const state = results[platform];
    if (!state.hasMore || state.loading) return;

    activeRequests?.abort();
    const controller = new AbortController();

    set({ results: { ...results, [platform]: { ...state, loading: true } }, activeRequests: controller });

    try {
      const res = await fetch(
        `${API_BASE}/api/${platform}/search?keyword=${encodeURIComponent(keyword)}&limit=30&page=${state.page + 1}`,
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      const json = await res.json();

      const current = get().results;
      if (!current) return;
      const prev = current[platform];
      set({
        results: {
          ...current,
          [platform]: {
            songs: [...prev.songs, ...(json.data || [])],
            page: prev.page + 1,
            hasMore: (prev.page + 1) * 30 < (json.total || 0),
            loading: false,
          },
        },
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) return;
      const current = get().results;
      if (!current) return;
      set({ results: { ...current, [platform]: { ...current[platform], loading: false } } });
    }
  },

  addHistory: (kw) => {
    const trimmed = kw.trim();
    if (!trimmed) return;
    const list = loadHistory().filter(h => h !== trimmed);
    list.unshift(trimmed);
    persistHistory(list);
    set({ history: list });
  },

  removeHistory: (kw) => {
    const list = loadHistory().filter(h => h !== kw);
    persistHistory(list);
    set({ history: list });
  },

  clearHistory: () => {
    persistHistory([]);
    set({ history: [] });
  },

  clearResults: () => set({ results: null, status: 'idle' }),
}));
