import { useCallback } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { playSong } from '../services/playController';
import type { Song } from '../types/song';

/**
 * 统一播放入口：自动注入当前音质偏好
 * 搜索页、播放列表、收藏等所有播放场景都应使用此 hook
 */
export function usePlaySong() {
  const play = usePlayerStore(s => s.play);
  const currentQuality = usePlayerStore(s => s.currentQuality);

  const handlePlay = useCallback(
    async (song: Song) => {
      console.log('[PLAY_DEBUG] usePlaySong called:', song.name, 'quality:', currentQuality);
      const result = await playSong(song, { quality: currentQuality });
      console.log('[PLAY_DEBUG] usePlaySong result:', JSON.stringify(result));
      if (result.started && result.source) {
        play(song, result.source.url);
      }
    },
    [play, currentQuality],
  );

  return { playSong: handlePlay };
}
