/* ══════════════════════════════════════════════════════════════
   效果2: FadeContent — logo 淡入动画
   ══════════════════════════════════════════════════════════════
   文件: src/components/fade-content/FadeContent.tsx
   使用: src/components/splash/LogoAnimation.tsx

   作用:
     - blur: 10px → 0 (模糊到清晰)
     - opacity: initialOpacity → 1
     - duration: 默认 1000ms (splash 中设为 2000ms)
     - onComplete: 回调 → 触发 logo 左移 + 文字渐入

   修复: 去掉了 ScrollTrigger 依赖，改为 useEffect 直接播放
   ══════════════════════════════════════════════════════════════ */

import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';

interface FadeContentProps {
  children: React.ReactNode;
  blur?: boolean;
  duration?: number;
  ease?: string;
  delay?: number;
  initialOpacity?: number;
  onComplete?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const FadeContent = ({
  children,
  blur = false,
  duration = 1000,
  ease = 'power2.out',
  delay = 0,
  initialOpacity = 0,
  onComplete,
  className = '',
  style,
  ...props
}: FadeContentProps) => {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const getSeconds = (val: number) => (val > 10 ? val / 1000 : val);

    // 初始状态: 透明 + 模糊
    gsap.set(el, {
      autoAlpha: initialOpacity,
      filter: blur ? 'blur(10px)' : 'blur(0px)',
      willChange: 'opacity, filter, transform'
    });

    // 动画: → 不透明 + 清晰
    gsap.to(el, {
      autoAlpha: 1,
      filter: 'blur(0px)',
      duration: getSeconds(duration),
      ease,
      delay: getSeconds(delay),
      onComplete: () => onComplete?.()
    });
  }, []);

  return (
    <div ref={ref} className={className} style={style} {...props}>
      {children}
    </div>
  );
};

export default FadeContent;
