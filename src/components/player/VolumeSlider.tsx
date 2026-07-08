import { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import './VolumeSlider.css';

interface VolumeSliderProps {
  value: number;
  onChange: (v: number) => void;
}

export default function VolumeSlider({ value, onChange }: VolumeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [internal, setInternal] = useState(value);
  const [dragging, setDragging] = useState(false);
  const fillMotion = useMotionValue(internal);
  const scaleMotion = useMotionValue(1);

  useEffect(() => {
    setInternal(value);
    fillMotion.set(value);
  }, [value, fillMotion]);

  const handleMove = (e: React.MouseEvent | MouseEvent) => {
    if (!trackRef.current) return;
    if (e.buttons !== 1 && !dragging) return;

    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.min(100, Math.max(0, (1 - (e.clientY - rect.top) / rect.height) * 100));
    const rounded = Math.round(pct);
    setInternal(rounded);
    fillMotion.set(rounded);
    onChange(rounded);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    handleMove(e);

    const onMouseMove = (ev: MouseEvent) => handleMove(ev);
    const onMouseUp = () => {
      setDragging(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div className="volume-slider-wrapper">
      <motion.div
        className="volume-percent"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {internal}%
      </motion.div>
      <motion.div
        className="volume-slider"
        onHoverStart={() => animate(scaleMotion, 1.2)}
        onHoverEnd={() => animate(scaleMotion, 1)}
        style={{
          scale: scaleMotion,
        }}
      >
        <div
          ref={trackRef}
          className="volume-track"
          onMouseDown={handleMouseDown}
        >
          <motion.div
            className="volume-fill"
            style={{
              height: useTransform(fillMotion, v => `${v}%`),
              scaleX: useTransform(scaleMotion, s => 1 + (s - 1) * 0.3),
            }}
          />
          <motion.div
            className="volume-thumb"
            style={{
              bottom: useTransform(fillMotion, v => `calc(${v}% - 7px)`),
              scale: useTransform(scaleMotion, s => s),
            }}
          />
        </div>
      </motion.div>
    </div>
  );
}
