import { useState, useEffect, useCallback } from 'react';
import './toast.css';

interface ToastProps {
  message: string | null;
  duration?: number;
  onHide?: () => void;
}

export default function Toast({ message, duration = 3000, onHide }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    if (message) {
      setText(message);
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onHide?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [message, duration, onHide]);

  if (!visible) return null;

  return (
    <div className="toast">
      <span>{text}</span>
    </div>
  );
}
