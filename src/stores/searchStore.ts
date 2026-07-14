import { create } from 'zustand';
import type { Song } from '../types';

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
}

const HISTORY_KEY = 'ivym_search_history';
const HISTORY_MAX = 9;
const SUGGEST_DELAY = 300;
const API_BASE = 'http://localhost:3001';

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function persistHistory(list: string[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
}

// 防抖定时器（模块级，避免塞进 React state）
let _sugTimer: ReturnType<typeof setTimeout> | null = null;

export type HotPlatform = 'netease' | 'qq';

interface HotData {
  platform: HotPlatform;
  items: string[];
}

interface SearchState {
  keyword: string;
  results: SearchResultData | null;
  history: string[];

  // ★ 封面下拉：搜索联想 + 热搜
  suggestions: string[];
  hotItems: Record<HotPlatform, string[]>;
  hotPlatform: HotPlatform;

  setKeyword: (kw: string) => void;
  search: (kw: string) => Promise<void>;
  loadMore: (platform: 'netease' | 'qq') => Promise<void>;
  addHistory: (kw: string) => void;
  removeHistory: (kw: string) => void;
  clearHistory: () => void;

  // ★ 搜索框下拉
  fetchSuggestions: (kw: string) => void;
  fetchHot: (platform?: HotPlatform) => Promise<void>;
  setHotPlatform: (p: HotPlatform) => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  keyword: '',
  results: null,
  history: loadHistory(),

  suggestions: [],
  hotItems: { netease: [], qq: [] },
  hotPlatform: 'netease',

  setKeyword: (kw) => set({ keyword: kw }),

  // 只在回车时调用一次
  search: async (kw) => {
    const trimmed = kw.trim();
    if (!trimmed) return;

    const [neteaseRes, qqRes] = await Promise.allSettled([
      fetch(`${API_BASE}/api/netease/search?keyword=${encodeURIComponent(trimmed)}&limit=30&page=1`),
      fetch(`${API_BASE}/api/qq/search?keyword=${encodeURIComponent(trimmed)}&limit=30&page=1`),
    ]);

    const netease = neteaseRes.status === 'fulfilled' ? await neteaseRes.value.json().catch(() => null) : null;
    const qq = qqRes.status === 'fulfilled' ? await qqRes.value.json().catch(() => null) : null;
    const limit = 30;

    set({
      keyword: trimmed,
      results: {
        keyword: trimmed,
        netease: { songs: netease?.code === 200 ? netease.data || [] : [], page: 1, hasMore: (netease?.total || 0) > limit, loading: false },
        qq: { songs: qq?.code === 200 ? qq.data || [] : [], page: 1, hasMore: (qq?.total || 0) > limit, loading: false },
      },
    });
  },

  loadMore: async (platform) => {
    const { results, keyword } = get();
    if (!results) return;
    const state = results[platform];
    if (!state.hasMore || state.loading) return;

    set({ results: { ...results, [platform]: { ...state, loading: true } } });

    try {
      const res = await fetch(`${API_BASE}/api/${platform}/search?keyword=${encodeURIComponent(keyword)}&limit=30&page=${state.page + 1}`);
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
    } catch {
      const current = get().results;
      if (current) set({ results: { ...current, [platform]: { ...current[platform], loading: false } } });
    }
  },

  // 去重复：已有的关键词移到最前面
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

  // ★ 搜索联想（300ms 防抖，输入停顿时请求）
  fetchSuggestions: (kw) => {
    const trimmed = kw.trim();
    if (_sugTimer) clearTimeout(_sugTimer);
    if (!trimmed) { set({ suggestions: [] }); return; }

    _sugTimer = setTimeout(async () => {
      const platform = get().hotPlatform;
      const url = `${API_BASE}/api/${platform}/search/suggest?keyword=${encodeURIComponent(trimmed)}`;
      try {
        const res = await fetch(url);
        const json = await res.json();
        let items: string[] = [];
        if (platform === 'netease') {
          items = (json?.result?.allMatch || []).map((m: any) => m.keyword);
        } else {
          items = Array.isArray(json?.data) ? json.data : [];
        }
        set({ suggestions: items });
      } catch { set({ suggestions: [] }); }
    }, SUGGEST_DELAY);
  },

  // ★ 热搜（落地时一次性拉取；platform 可选，默认当前平台）
  fetchHot: async (platform) => {
    const p = platform || get().hotPlatform;
    const url = `${API_BASE}/api/${p}/search/hot`;
    try {
      const res = await fetch(url);
      const json = await res.json();
      let items: string[] = [];
      if (p === 'netease') {
        items = (json?.result?.hots || []).map((h: any) => h.first);
      } else {
        items = Array.isArray(json?.data) ? json.data : [];
      }
      set(s => ({ hotItems: { ...s.hotItems, [p]: items } }));
    } catch { /* ignore */ }
  },

  // ★ 切热搜平台（并懒加载该平台的热搜）
  setHotPlatform: (p) => {
    set({ hotPlatform: p });
    if (get().hotItems[p].length === 0) get().fetchHot(p);
  },
}));
