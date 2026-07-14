import { useRef, useState, useEffect, useCallback } from 'react';
import { gsap } from 'gsap';

/**
 * ★ 播放器自动隐藏
 * 外层组件把 gsapRef 挂到 player-bar-anim-wrapper 上，该 hook 用 gsap 控制其 translateY。
 * 静止 IDLE_MS 后下沉隐藏（露出迷你进度条），鼠标移动时召回。
 */

const IDLE_MS = 4000;
const HIDDEN_Y = 100; // % — 完全藏入底部以下

export function useAutoHidePlayer() {
  const gsapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<number | null>(null);

  const show = useCallback(() => {
    if (!gsapRef.current) return;
    setVisible(true);
    gsap.killTweensOf(gsapRef.current);
    gsap.to(gsapRef.current, {
      y: 0,
      duration: 0.45,
      ease: 'power3.out',
      overwrite: true,
    });
  }, []);

  const hide = useCallback(() => {
    if (!gsapRef.current) return;
    setVisible(false);
    gsap.killTweensOf(gsapRef.current);
    gsap.to(gsapRef.current, {
      y: `${HIDDEN_Y}%`,
      duration: 0.5,
      ease: 'power3.in',
      overwrite: true,
    });
  }, []);

  const resetTimer = useCallback(() => {
    show();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(hide, IDLE_MS);
  }, [show, hide]);

  useEffect(() => {
    // 鼠标移动 → 召回 + 重置计时
    const onMove = () => resetTimer();
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (timerRef.current) clearTimeout(timerRef.current);
      gsap.killTweensOf(gsapRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { gsapRef, visible, show, hide };
}
