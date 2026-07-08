import { useEffect, useRef, useState } from 'react';
import './toast.css';

interface ToastProps {
  message: string | null;
  duration?: number;
}

export default function Toast({ message, duration = 4000 }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (message) {
      setVisible(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVisible(false), duration);
    } else {
      setVisible(false);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [message, duration]);

  if (!visible || !message) return null;

  return (
    <div className="toast">
      <span>{message}</span>
    </div>
  );
}
