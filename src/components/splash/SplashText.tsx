import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

interface Props {
  active?: boolean;
  onComplete?: () => void;
}

export default function SplashText({ active, onComplete }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const chars = ref.current?.querySelectorAll('.split-char');
    if (!chars) return;

    gsap.fromTo(chars,
      { opacity: 0, y: 40, rotateX: -90 },
      { opacity: 1, y: 0, rotateX: 0, duration: 0.8, stagger: 0.08, ease: 'power3.out',
        onComplete }
    );
  }, [active, onComplete]);

  return (
    <div ref={ref}>
      {'Ivy·Music'.split('').map((char, i) => (
        <span className="split-char" key={i}>{char}</span>
      ))}
    </div>
  );
}
