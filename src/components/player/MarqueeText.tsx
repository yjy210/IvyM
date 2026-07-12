import { useRef, useEffect, useState, useCallback } from 'react';

interface MarqueeTextProps {
  text: string;
  className?: string;
  /** 两端停留毫秒，默认 2000 */
  pauseMs?: number;
  /** 滚动速度：像素/秒，默认 30 */
  speed?: number;
}

/**
 * 双向滚动文本 — 类似 Apple Music / 网易云桌面版
 *
 * 行为：
 *   - 文本短于容器：不滚动，静态显示
 *   - 文本长于容器：
 *     1. 停留 pauseMs（开头）
 *     2. 向左滚动到末尾（最后一个字可见）
 *     3. 停留 pauseMs
 *     4. 滚动回开头
 *     5. 循环
 */
export default function MarqueeText({
  text,
  className = '',
  pauseMs = 2000,
  speed = 30,
}: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [distance, setDistance] = useState(0);
  const rafRef = useRef<number | null>(null);

  // 测量是否需要滚动 + 计算超出距离
  const measure = useCallback(() => {
    const el = textRef.current;
    const c = containerRef.current;
    if (!el || !c) return;
    const textW = el.scrollWidth;
    const containerW = c.clientWidth;
    const diff = textW - containerW;
    setOverflow(diff > 2);
    setDistance(Math.max(0, diff));
  }, []);

  // 初始化 + ResizeObserver
  useEffect(() => {
    measure();
    const ro = new ResizeObserver(() => measure());
    if (containerRef.current) ro.observe(containerRef.current);
    if (textRef.current) ro.observe(textRef.current);
    return () => ro.disconnect();
  }, [measure, text]);

  // 往返动画循环
  useEffect(() => {
    if (!overflow || distance <= 0) return;

    // 清理上一帧
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    let cancelled = false;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = window.setTimeout(() => {
          if (!cancelled) resolve();
        }, ms);
        // 取消时清理
        const check = () => {
          if (cancelled) window.clearTimeout(id);
        };
        requestAnimationFrame(check);
      });

    const animate = (targetX: number, durationMs: number): Promise<void> => {
      return new Promise((resolve) => {
        const el = textRef.current;
        if (!el) { resolve(); return; }

        const startX = currentX;
        const delta = targetX - startX;
        const startTime = performance.now();

        const step = (now: number) => {
          if (cancelled) { resolve(); return; }
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / durationMs, 1);
          currentX = startX + delta * progress;
          el.style.transform = `translateX(${-currentX}px)`;
          if (progress < 1) {
            rafRef.current = requestAnimationFrame(step);
          } else {
            resolve();
          }
        };

        rafRef.current = requestAnimationFrame(step);
      });
    };

    let currentX = 0;
    const scrollDuration = (distance / speed) * 1000; // ms

    (async () => {
      while (!cancelled) {
        // 停留开头
        await sleep(pauseMs);
        if (cancelled) break;

        // 向左滚到末尾
        await animate(distance, scrollDuration);
        if (cancelled) break;

        // 停留末尾
        await sleep(pauseMs);
        if (cancelled) break;

        // 向右滚回开头
        await animate(0, scrollDuration);
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [overflow, distance, pauseMs, speed]);

  return (
    <div ref={containerRef} className={`marquee-container ${className}`}>
      <span
        ref={textRef}
        className="marquee-text"
        style={overflow ? { transform: 'translateX(0px)' } : undefined}
      >
        {text}
      </span>
    </div>
  );
}
