export type AudioQuality = 'standard' | 'higher' | 'lossless' | 'exhigh';

/** 播放源类型 — 后端返回 */
export interface PlaySource {
  url: string;
  playMode: 'full' | 'trial';
  trialDuration: number | null;
}

/** 播放请求结果 — 前端消费 */
export interface PlayResult {
  success: boolean;
  source?: PlaySource;
  error?: string;
}

/** 播放选项 */
export interface PlayOptions {
  quality?: AudioQuality;
}
