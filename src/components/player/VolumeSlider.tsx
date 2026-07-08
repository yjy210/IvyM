import { useRef, useState, useEffect } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';
import './VolumeSlider.css';

interface Props {
  value: number;
  onChange: (v: number) => void;
}

export default function VolumeSlider({ value, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // 弹簧动画
  const spring = useSpring(value, { stiffness: 300, damping: 30 });
  const fillHeight = useTransform(spring, [0, 100], ['0%', '100%']);

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  const setFromEvent = (e: React.MouseEvent | MouseEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.min(100, Math.max(0, (1 - (e.clientY - rect.top) / rect.height) * 100));
    const rounded = Math.round(pct);
    spring.set(rounded);
    onChange(rounded);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setFromEvent(e);

    const onMouseMove = (ev: MouseEvent) => setFromEvent(ev);
    const onMouseUp = () => {
      setDragging(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // 弹性缩放效果
  const scaleY = useTransform(spring, [0, 100], [1, 1.05]);

  return (
    <div className="volume-slider">
      <div
        ref={trackRef}
        className="volume-track"
        onMouseDown={handleMouseDown}
      >
        <motion.div
          className="volume-fill"
          style={{
            height: fillHeight,
            scaleY: dragging ? scaleY : 1,
          }}
        />
      </div>
    </div>
  );
}
