import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { usePlayerStore } from '../../stores/playerStore';
import './cover-transition.css';

// ★ GSAP MorphSVG 插件（只注册一次）
gsap.registerPlugin(MorphSVGPlugin);

/*
 * 曲线升起 —— 三个路径状态（viewBox 0..100）：
 *   start  : 贴底平直线，高度为 0（不可见）
 *   middle : 曲线拱起至画面中央
 *   end    : 铺满全屏，顶部水平
 */
const START = 'M 0 100 V 100 Q 50 100 100 100 V 100 Z';
const MIDDLE = 'M 0 100 V 50 Q 50 0 100 50 V 100 Z';
const END = 'M 0 100 V 0 Q 50 0 100 0 V 100 Z';

/**
 * ★ 沉浸封面背景
 * 从底部以 SVG 路径变形的方式曲线升起/下降，颜色取自封面主色。
 * 直接订阅 zustand store，无需 props。
 * 播放器栏 z-800 / 弹窗 z-850 → 本层 z-750，保证播放器始终浮于背景之上。
 */
export default function CoverTransition() {
  const pathRef = useRef<SVGPathElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const colorRef = useRef<string>('rgb(120, 70, 110)');

  const coverOpen = usePlayerStore(s => s.coverOpen);
  const coverColor = usePlayerStore(s => s.coverColor);

  // ① 构建 timeline（仅一次，StrictMode 下 cleanup 会 kill 重建的）
  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;

    const tl = gsap.timeline({ paused: true, reversed: true })
      .to(path, { morphSVG: MIDDLE, duration: 0.45, ease: 'power3.in' })
      .to(path, { morphSVG: END, duration: 0.55, ease: 'power3.out' }, '<0.02');
    tlRef.current = tl;

    return () => { tl.kill(); tlRef.current = null; };
  }, []);

  // ② 切 coverOpen → 播放 / 倒放
  useEffect(() => {
    const tl = tlRef.current;
    if (!tl) return;
    // reversed=true 对应收起（start），reversed=false 对应展开（end）
    if (coverOpen && tl.reversed()) tl.reversed(false);
    else if (!coverOpen && !tl.reversed()) tl.reversed(true);
  }, [coverOpen]);

  // ③ 颜色平滑过渡（切歌或首帧提取完成时）
  useEffect(() => {
    const path = pathRef.current;
    if (!path || coverColor === colorRef.current) return;
    colorRef.current = coverColor;
    gsap.to(path, { fill: coverColor, duration: 0.6, ease: 'power2.out', overwrite: true });
  }, [coverColor]);

  return (
    <svg
      className="cover-transition"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMin slice"
      aria-hidden
    >
      <path ref={pathRef} className="cover-transition-path" fill={coverColor} d={START} />
    </svg>
  );
}
