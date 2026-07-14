import { useEffect } from 'react';
import { usePlayerStore } from '../../stores/playerStore';

/**
 * ★ 封面主色提取
 * 监听 currentSong.cover，用 canvas 采样得到主色调，写入 playerStore.coverColor。
 * Electron 下远程图片可能触发 canvas 污染（tainted），此时静默 fallback 到默认色。
 */

// 默认色：与播放器深紫蓝(#1a1a2e) 协调的深色调
const FALLBACK = 'rgb(120, 70, 110)';

/** 从一个已加载的 <img> 中采样主色：统计色频，排除过暗/过亮，取最饱和的代表色 */
function sampleDominant(img: HTMLImageElement): string {
  const SIZE = 40; // 降采样到 40x40 足够提取主色
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return FALLBACK;

  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, SIZE, SIZE).data;
  } catch {
    return FALLBACK; // tainted canvas
  }

  // 色频桶（每通道 4 bit 量化 → 4096 桶）
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 200) continue; // 跳过透明像素
    const lum = (r * 299 + g * 587 + b * 114) / 1000;
    if (lum < 25 || lum > 235) continue; // 排除接近纯黑/纯白
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const ex = buckets.get(key);
    if (ex) { ex.r += r; ex.g += g; ex.b += b; ex.n++; }
    else buckets.set(key, { r, g, b, n: 1 });
  }

  // 取出现次数最多的桶，用饱和度加权
  let bestKey = -1;
  let bestScore = -1;
  for (const [key, v] of buckets) {
    const max = Math.max(v.r, v.g, v.b), min = Math.min(v.r, v.g, v.b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const score = v.n * (0.5 + sat); // 频次 × 饱和度
    if (score > bestScore) { bestScore = score; bestKey = key; }
  }

  if (bestKey === -1) return FALLBACK;
  const v = buckets.get(bestKey)!;
  return `rgb(${Math.round(v.r / v.n)}, ${Math.round(v.g / v.n)}, ${Math.round(v.b / v.n)})`;
}

export function useCoverColor() {
  const currentSong = usePlayerStore(s => s.currentSong);
  const setCoverColor = usePlayerStore(s => s.setCoverColor);

  useEffect(() => {
    const url = currentSong?.cover;
    if (!url) { setCoverColor(FALLBACK); return; }

    const img = new Image();
    img.crossOrigin = 'anonymous'; // 允许干净 canvas
    img.onload = () => setCoverColor(sampleDominant(img));
    img.onerror = () => setCoverColor(FALLBACK);
    img.src = url;
    // 缓存命中时 onload 可能已触发，补一次
    if (img.complete && img.naturalWidth) setCoverColor(sampleDominant(img));
  }, [currentSong?.cover, setCoverColor]);
}
