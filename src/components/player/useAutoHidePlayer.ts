import { useRef, useState, useEffect, useCallback } from 'react';
import { gsap } from 'gsap';
import { usePlayerStore } from '../../stores/playerStore';

/**
 * ★ 播放器自动隐藏
 * - 默认显示；静止 IDLE_MS 后下滑隐藏（只露出迷你进度条）
 * - 触发显隐的区域仅限"屏幕底部 BOTTOM_ZONE 像素"内才有响应：
 *     · 鼠标移入底部区域 → 显示 + 重置隐藏倒计时
 *     · 鼠标在屏幕上方/中部移动 → 完全不干扰播放器状态
 * - 封面/沉浸视图(coverOpen)下：保持显示、暂停自动隐藏
 */

const IDLE_MS = 2800;     // 多久没动静就收起
const HIDDEN_Y = 105;     // 完全藏入底部以下的百分比
const BOTTOM_ZONE = 80;   // 离底部多少像素才算"接近播放器"
const ANIM_SHOW = 0.4;    // 显示动画时长
const ANIM_HIDE = 0.32;   // 隐藏动画时长（比显示稍快，利落）

export function useAutoHidePlayer() {
  const gsapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<number | null>(null);
  const hiddenRef = useRef(false); // 防止重复 show/hide

  const coverOpen = useRef(false);

  // 订阅 coverOpen（不触发重渲染，只读 ref）；沉浸视图开启时立刻显示并停掉隐藏计时
  useEffect(() => {
    coverOpen.current = usePlayerStore.getState().coverOpen;
    const unsub = usePlayerStore.subscribe(s => {
      const wasOpen = coverOpen.current;
      coverOpen.current = s.coverOpen;
      if (s.coverOpen && !wasOpen) {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        show();
      }
    });
    // 初始若已开启，同步一次
    if (coverOpen.current && gsapRef.current) show();
    return unsub;
  }, [show]);

  const show = useCallback(() => {
    if (!gsapRef.current || hiddenRef.current === false) return;
    hiddenRef.current = false;
    setVisible(true);
    gsap.to(gsapRef.current, { y: 0, duration: ANIM_SHOW, ease: 'power3.out', overwrite: true });
  }, []);

  const hide = useCallback(() => {
    if (!gsapRef.current || hiddenRef.current === true) return;
    hiddenRef.current = true;
    setVisible(false);
    gsap.to(gsapRef.current, { y: `${HIDDEN_Y}%`, duration: ANIM_HIDE, ease: 'power2.in', overwrite: true });
  }, []);

  // 只有当鼠标位于屏幕底部区域时才触发
  const onMove = useCallback((e: MouseEvent) => {
    if (coverOpen.current) { show(); return; }
    const nearBottom = e.clientY >= window.innerHeight - BOTTOM_ZONE;
    if (!nearBottom) return; // 屏幕上方/中部移动 → 完全不理
    show();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(hide, IDLE_MS);
  }, [show, hide]);

  const onLeaveWindow = useCallback(() => {
    if (coverOpen.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(hide, IDLE_MS);
  }, [hide]);

  useEffect(() => {
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeaveWindow);
    // 启动首次隐藏倒计时
    timerRef.current = window.setTimeout(hide, IDLE_MS * 1.5);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeaveWindow);
      if (timerRef.current) clearTimeout(timerRef.current);
      gsap.killTweensOf(gsapRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { gsapRef, visible, show, hide };
}
