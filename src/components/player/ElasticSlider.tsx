import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import './ElasticSlider.css';

const MAX_OVERFLOW = 20; // 弱弹性

interface ElasticSliderProps {
  defaultValue?: number;
  startingValue?: number;
  maxValue?: number;
  className?: string;
  isStepped?: boolean;
  stepSize?: number;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onChange?: (value: number) => void;
}

export default function ElasticSlider({
  defaultValue = 50,
  startingValue = 0,
  maxValue = 100,
  className = '',
  isStepped = false,
  stepSize = 1,
  leftIcon = null,
  rightIcon = null,
  onChange,
}: ElasticSliderProps) {
  const [value, setValue] = useState(defaultValue);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [region, setRegion] = useState('middle');
  const clientX = useMotionValue(0);
  const overflow = useMotionValue(0);
  const scale = useMotionValue(1);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  useMotionValueEvent(clientX, 'change', (latest) => {
    if (sliderRef.current) {
      const { left, right } = sliderRef.current.getBoundingClientRect();
      let newestValue;

      if (latest < left) {
        setRegion('left');
        newestValue = left - latest;
      } else if (latest > right) {
        setRegion('right');
        newestValue = latest - right;
      } else {
        setRegion('middle');
        newestValue = 0;
      }

      overflow.jump(decay(newestValue, MAX_OVERFLOW));
    }
  });

  // 点击或拖动都设置值
  const setFromEvent = (e: React.PointerEvent) => {
    if (!sliderRef.current) return;
    const { left, width } = sliderRef.current.getBoundingClientRect();
    let newValue = startingValue + ((e.clientX - left) / width) * (maxValue - startingValue);
    if (isStepped) newValue = Math.round(newValue / stepSize) * stepSize;
    newValue = Math.min(Math.max(newValue, startingValue), maxValue);
    setValue(newValue);
    clientX.jump(e.clientX);
    onChange?.(Math.round(newValue));
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.buttons > 0) setFromEvent(e);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setFromEvent(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = () => {
    animate(overflow, 0, { type: 'spring', bounce: 0.3 });
  };

  const getRangePercentage = () => {
    const totalRange = maxValue - startingValue;
    if (totalRange === 0) return 0;
    return ((value - startingValue) / totalRange) * 100;
  };

  return (
    <div className={`slider-container ${className}`}>
      <div className="value-indicator" style={{ left: `${getRangePercentage()}%` }}>
        {Math.round(value)}%
      </div>

      <motion.div
        onHoverStart={() => animate(scale, 1.2)}
        onHoverEnd={() => animate(scale, 1)}
        onTouchStart={() => animate(scale, 1.2)}
        onTouchEnd={() => animate(scale, 1)}
        style={{
          scale,
          opacity: useTransform(scale, [1, 1.2], [0.7, 1]),
        }}
        className="slider-wrapper"
      >
        {leftIcon && (
          <motion.div
            animate={{
              scale: region === 'left' ? [1, 1.4, 1] : 1,
              transition: { duration: 0.25 },
            }}
            style={{
              x: useTransform(() => (region === 'left' ? -overflow.get() / scale.get() : 0)),
            }}
          >
            {leftIcon}
          </motion.div>
        )}

        <div
          ref={sliderRef}
          className="slider-root"
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onLostPointerCapture={handlePointerUp}
        >
          <motion.div
            style={{
              scaleX: useTransform(() => {
                if (sliderRef.current) {
                  const { width } = sliderRef.current.getBoundingClientRect();
                  return 1 + overflow.get() / width;
                }
              }),
              scaleY: useTransform(overflow, [0, MAX_OVERFLOW], [1, 0.8]),
              transformOrigin: useTransform(() => {
                if (sliderRef.current) {
                  const { left, width } = sliderRef.current.getBoundingClientRect();
                  return clientX.get() < left + width / 2 ? 'right' : 'left';
                }
              }),
              height: useTransform(scale, [1, 1.2], [6, 12]),
              marginTop: useTransform(scale, [1, 1.2], [0, -3]),
              marginBottom: useTransform(scale, [1, 1.2], [0, -3]),
            }}
            className="slider-track-wrapper"
          >
            <div className="slider-track">
              <div className="slider-range" style={{ width: `${getRangePercentage()}%` }} />
            </div>
          </motion.div>
        </div>

        {rightIcon && (
          <motion.div
            animate={{
              scale: region === 'right' ? [1, 1.4, 1] : 1,
              transition: { duration: 0.25 },
            }}
            style={{
              x: useTransform(() => (region === 'right' ? overflow.get() / scale.get() : 0)),
            }}
          >
            {rightIcon}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

function decay(value: number, max: number) {
  if (max === 0) return 0;
  const entry = value / max;
  const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);
  return sigmoid * max;
}
