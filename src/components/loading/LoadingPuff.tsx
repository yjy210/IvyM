import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import './loading-puff.css';

/**
 * LoadingPuff — GSAP Keyframes 加载指示器
 *
 * 四个黑白灰渐变小方块，上下弹跳 + 旋转，依次错开，无限循环。
 * 参考 https://demos.gsap.com/demo/keyframes/ 的 Puff 效果。
 *
 * 使用场景：
 * - 搜索列表懒加载等待
 * - 图片加载等待
 * - 任何需要"轻量级 loading"的场景
 */
export default function LoadingPuff({ size = 18 }: { size?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const boxes = containerRef.current?.querySelectorAll('.puff-box');
    if (!boxes || boxes.length === 0) return;

    const tl = gsap.to(boxes, {
      keyframes: {
        y: [0, size * 2, -size * 0.25, size * 0.5, 0],
        ease: 'none',
        easeEach: 'power2.inOut',
      },
      rotate: 180,
      ease: 'elastic',
      duration: 2,
      stagger: 0.15,
      repeat: -1,
    });

    return () => { tl.kill(); };
  }, [size]);

  return (
    <div className="loading-puff" ref={containerRef} role="status" aria-label="加载中">
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          className="puff-box"
          style={{ width: size, height: size }}
        />
      ))}
    </div>
  );
}
