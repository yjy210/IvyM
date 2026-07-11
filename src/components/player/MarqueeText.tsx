import { useState, useRef, useEffect, useCallback } from 'react';

interface MarqueeTextProps {
  text: string;
  className?: string;
}

/**
 * 自动滚动文本 — 文本溢出时水平往返滚动，类似 QQ 音乐标题
 */
export default function MarqueeText({ text, className = '' }: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [paused, setPaused] = useState(false);

  const checkOverflow = useCallback(() => {
    if (!containerRef.current || !textRef.current) return;
    const isOverflowing = textRef.current.scrollWidth > containerRef.current.clientWidth;
    setOverflow(isOverflowing);
  }, []);

  useEffect(() => {
    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [checkOverflow, text]);

  return (
    <div
      ref={containerRef}
      className={`marquee-container ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span
        ref={textRef}
        className={`marquee-text ${overflow ? 'animate' : ''} ${paused ? 'paused' : ''}`}
      >
        {text}
      </span>
      {overflow && (
        <span className="marquee-text clone">{text}</span>
      )}
    </div>
  );
}
