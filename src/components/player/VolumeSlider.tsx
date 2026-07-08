import { useEffect, useRef, useState } from 'react';
import './VolumeSlider.css';

interface VolumeSliderProps {
  value: number;
  onChange: (v: number) => void;
}

export default function VolumeSlider({ value, onChange }: VolumeSliderProps) {
  const [internal, setInternal] = useState(value);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInternal(value);
  }, [value]);

  const handleClick = (e: React.MouseEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = 1 - (e.clientY - rect.top) / rect.height; // 上面 = 高
    const newVal = Math.round(Math.min(100, Math.max(0, pct * 100)));
    setInternal(newVal);
    onChange(newVal);
  };

  const handleDrag = (e: React.MouseEvent) => {
    if (e.buttons !== 1) return;
    handleClick(e);
  };

  return (
    <div className="volume-slider">
      <div
        className="volume-track"
        ref={trackRef}
        onClick={handleClick}
        onMouseMove={handleDrag}
      >
        <div className="volume-fill" style={{ height: `${internal}%` }} />
        <div className="volume-thumb" style={{ bottom: `${internal}%` }} />
      </div>
    </div>
  );
}
