import { create } from 'zustand'

interface LyricsState {
  visible: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

export const useLyricsStore = create<LyricsState>((set) => ({
  visible: false,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
  toggle: () => set((s) => ({ visible: !s.visible })),
}))
