import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import './ElasticSlider.css';

const MAX_OVERFLOW = 50;

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
  showValue?: boolean;
  vertical?: boolean;
}

export default function ElasticSlider({
  defaultValue = 0,
  startingValue = 0,
  maxValue = 100,
  className = '',
  isStepped = false,
  stepSize = 1,
  leftIcon = null,
  rightIcon = null,
  onChange,
  showValue = false,
  vertical = false,
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
      const { left, right, top, bottom } = sliderRef.current.getBoundingClientRect();
      let newestValue;

      if (vertical) {
        // latest 在竖直模式下实际存储的是 clientY
        if (latest < top) {
          setRegion('left');
          newestValue = top - latest;
        } else if (latest > bottom) {
          setRegion('right');
          newestValue = latest - bottom;
        } else {
          setRegion('middle');
          newestValue = 0;
        }
      } else {
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
      }

      overflow.jump(decay(newestValue, MAX_OVERFLOW));
    }
  });

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.buttons > 0 && sliderRef.current) {
      let newValue;
      if (vertical) {
        const { top, height } = sliderRef.current.getBoundingClientRect();
        newValue = startingValue + ((e.clientY - top) / height) * (maxValue - startingValue);
        newValue = maxValue - newValue;
      } else {
        const { left, width } = sliderRef.current.getBoundingClientRect();
        newValue = startingValue + ((e.clientX - left) / width) * (maxValue - startingValue);
      }

      if (isStepped) {
        newValue = Math.round(newValue / stepSize) * stepSize;
      }

      newValue = Math.min(Math.max(newValue, startingValue), maxValue);
      setValue(newValue);
      // 竖直模式用 clientY，水平模式用 clientX
      vertical ? clientX.jump(e.clientY) : clientX.jump(e.clientX);
      onChange?.(newValue);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    handlePointerMove(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = () => {
    animate(overflow, 0, { type: 'spring', bounce: 0.5 });
  };

  const getRangePercentage = () => {
    const totalRange = maxValue - startingValue;
    if (totalRange === 0) return 0;
    return ((value - startingValue) / totalRange) * 100;
  };

  return (
    <div className={`slider-container ${className} ${vertical ? 'vertical' : ''}`}>
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
                  if (vertical) {
                    const { top, height } = sliderRef.current.getBoundingClientRect();
                    return clientX.get() < top + height / 2 ? 'bottom' : 'top';
                  } else {
                    const { left, width } = sliderRef.current.getBoundingClientRect();
                    return clientX.get() < left + width / 2 ? 'right' : 'left';
                  }
                }
              }),
              height: useTransform(scale, [1, 1.2], [4, 8]),
              marginTop: useTransform(scale, [1, 1.2], [0, -2]),
              marginBottom: useTransform(scale, [1, 1.2], [0, -2]),
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
      {showValue && <p className="value-indicator">{Math.round(value)}</p>}
    </div>
  );
}

function decay(value: number, max: number) {
  if (max === 0) return 0;
  const entry = value / max;
  const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);
  return sigmoid * max;
}
