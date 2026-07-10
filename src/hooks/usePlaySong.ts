import { useCallback } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { playSong } from '../services/playController';
import type { Song } from '../types/song';

/**
 * 统一播放入口：自动注入当前音质偏好
 */
export function usePlaySong() {
  const play = usePlayerStore(s => s.play);
  const currentQuality = usePlayerStore(s => s.currentQuality);

  const handlePlay = useCallback(
    async (song: Song) => {
      const result = await playSong(song, { quality: currentQuality });
      if (result.started && result.source) {
        play(song, result.source.url);
      }
    },
    [play, currentQuality],
  );

  return { playSong: handlePlay };
}
