import { useRef, useEffect, useCallback } from 'react';
import { gsap } from 'gsap';

/**
 * ★ 播放器自动隐藏
 * - 默认显示；静止 IDLE_MS 后下滑隐藏（只露出迷你进度条）
 * - 触发显隐仅限屏幕底部 BOTTOM_ZONE 像素区域：
 *     移入底部 → 显示 + 重置隐藏倒计时
 *     屏幕上方/中部移动 → 完全不干扰播放器
 * - coverOpen(沉浸视图) 期间：保持显示，暂停隐藏计时
 *
 * 纯 gsap 动画 hook，不订阅 store——coverOpen 由调用方传入。
 */

const IDLE_MS = 2800;
const HIDDEN_Y = 105;   // % 藏到底部以下
const BOTTOM_ZONE = 80; // 离底部多少 px 才算"接近播放器"
const ANIM_SHOW = 0.4;
const ANIM_HIDE = 0.32;

export function useAutoHidePlayer(coverOpen: boolean, onHiddenChange?: (hidden: boolean) => void) {
  const gsapRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const hiddenRef = useRef(false);

  const emitHidden = useCallback((hidden: boolean) => {
    onHiddenChange?.(hidden);
  }, [onHiddenChange]);

  const show = useCallback(() => {
    if (!gsapRef.current || hiddenRef.current === false) return;
    hiddenRef.current = false;
    gsap.to(gsapRef.current, { y: 0, duration: ANIM_SHOW, ease: 'power3.out', overwrite: 'auto' });
  }, []);

  const hide = useCallback(() => {
    if (!gsapRef.current || hiddenRef.current === true) return;
    hiddenRef.current = true;
    emitHidden(true);
    gsap.to(gsapRef.current, { y: `${HIDDEN_Y}%`, duration: ANIM_HIDE, ease: 'power2.in', overwrite: 'auto' });
  }, [emitHidden]);

  // 沉浸视图：强制显示 + 切断隐藏计时
  useEffect(() => {
    if (coverOpen) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      show();
    }
  }, [coverOpen, show]);

  // 鼠标：仅底部区域触发
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (coverOpen) { show(); return; }
      const nearBottom = e.clientY >= window.innerHeight - BOTTOM_ZONE;
      if (!nearBottom) return;
      show();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(hide, IDLE_MS);
    };
    const onLeave = () => {
      if (coverOpen) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(hide, IDLE_MS);
    };
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    timerRef.current = window.setTimeout(hide, IDLE_MS * 1.5); // 初始倒计时
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      if (timerRef.current) clearTimeout(timerRef.current);
      gsap.killTweensOf(gsapRef.current);
    };
  }, [coverOpen, show, hide]);

  return { gsapRef, show, hide };
}
