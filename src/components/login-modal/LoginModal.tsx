import { useState, useEffect, useRef } from 'react';
import './login-modal.css';

interface LoginModalProps {
  visible: boolean;
  platform: 'netease' | 'qq';
  onClose: () => void;
  onLoginSuccess?: (info: {
    nickname: string;
    avatar: string;
    userId: string;
    cookie: string;
    membership: { status: 'vip' | 'normal' | 'unknown'; type: string | null; expireAt?: number };
  }) => void;
}

type Platform = 'netease' | 'qq';

export function LoginModal({ visible, platform, onClose, onLoginSuccess }: LoginModalProps) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setQrCode(null);
      setError(null);
      setStatus(null);
    }
  }, [visible]);

  if (!visible) return null;

  const API_BASE = 'http://localhost:3001';

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/${platform}/login/qr`);
      const data = await res.json();
      if (data.code === 200) {
        setQrCode(data.data.qrimg);
        setStatus('请使用APP扫码登录');
        const key = data.data.unikey || data.data.sigx || data.data.sig || '';
        startPolling(key);
      } else {
        setError(data.msg || '获取二维码失败');
      }
    } catch {
      setError('网络错误，请检查 API 服务器是否启动');
    } finally {
      setLoading(false);
    }
  };

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = (key: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/${platform}/login/check?key=${key}`);
        const data = await res.json();
        if (data.code === 200 || data.code === 803) {
          clearInterval(interval);
          setStatus('登录成功！');
          onLoginSuccess?.({
            nickname: data.nickname || '用户',
            avatar: data.avatar || '',
            userId: data.userId || data.uin || '',
            cookie: data.cookie || '',
            membership: { status: data.vip ? 'vip' : 'unknown', type: data.vip ? data.vipName || 'netease_vip' : null },
          });
        } else if (data.code === 800) {
          setStatus('二维码已过期，请刷新');
          clearInterval(interval);
        }
      } catch {}
    }, 2000);
    pollingRef.current = interval;
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const platformNames: Record<Platform, string> = {
    netease: '网易云音乐',
    qq: 'QQ音乐',
  };

  return (
    <div className="login-overlay" onClick={onClose}>
      <div className="login-modal" onClick={e => e.stopPropagation()}>
        <div className="login-header">
          <h3>绑定{platformNames[platform]}</h3>
          <button className="login-close" onClick={onClose}>✕</button>
        </div>

        <div className="login-body">
          {loading && <div className="login-loading">加载中...</div>}
          {error && <div className="login-error">{error}</div>}
          {status && !error && <div className="login-status">{status}</div>}

          {qrCode ? (
            <div className="login-qr">
              <img src={qrCode} alt="登录二维码" />
              <p>请使用{platformNames[platform]}APP扫码登录</p>
            </div>
          ) : (
            <button className="login-btn" onClick={handleLogin} disabled={loading}>
              {loading ? '加载中...' : `获取${platformNames[platform]}登录二维码`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoginModal;
