import { useRef, useState, useEffect } from 'react';
import { motion, useSpring, useTransform, animate } from 'motion/react';
import './VolumeSlider.css';

interface Props {
  value: number;
  onChange: (v: number) => void;
}

export default function VolumeSlider({ value, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // 弹簧动画值
  const spring = useSpring(value, { stiffness: 300, damping: 30 });
  const fillHeight = useTransform(spring, [0, 100], ['0%', '100%']);
  const thumbBottom = useTransform(spring, [0, 100], ['0%', '100%']);

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

  return (
    <div className="volume-slider">
      <div
        ref={trackRef}
        className="volume-track"
        onMouseDown={handleMouseDown}
      >
        <motion.div
          className="volume-fill"
          style={{ height: fillHeight }}
        />
        <motion.div
          className="volume-thumb"
          style={{ bottom: thumbBottom }}
          animate={{ scale: dragging ? 1.3 : 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
        />
      </div>
    </div>
  );
}
