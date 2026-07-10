import { create } from 'zustand';

export interface MembershipInfo {
  status: 'vip' | 'normal' | 'unknown';
  type: string | null;
  expireAt?: number;
}

interface MembershipState {
  memberships: Record<string, MembershipInfo>;

  setMembership: (platform: string, info: MembershipInfo) => void;
  getMembership: (platform: string) => MembershipInfo;
  clearMembership: (platform: string) => void;
  clearAll: () => void;
}

const defaultMembership: MembershipInfo = { status: 'unknown', type: null };

export const useMembershipStore = create<MembershipState>((set, get) => ({
  memberships: {},

  setMembership: (platform, info) =>
    set(state => ({ memberships: { ...state.memberships, [platform]: info } })),

  getMembership: (platform) => get().memberships[platform] ?? defaultMembership,

  clearMembership: (platform) =>
    set(state => {
      const next = { ...state.memberships };
      delete next[platform];
      return { memberships: next };
    }),

  clearAll: () => set({ memberships: {} }),
}));
