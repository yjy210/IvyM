import { useState } from 'react';
import './login-modal.css';

interface LoginModalProps {
  visible: boolean;
  onClose: () => void;
}

type Platform = 'netease' | 'qq' | 'kugou';

export function LoginModal({ visible, onClose }: LoginModalProps) {
  const [platform, setPlatform] = useState<Platform>('netease');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  const API_BASE = 'http://localhost:3001';

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      if (platform === 'netease') {
        const res = await fetch(`${API_BASE}/api/netease/login/qr`);
        const data = await res.json();
        if (data.code === 200) {
          setQrCode(data.data.qrimg);
        } else {
          setError(data.msg || '获取二维码失败');
        }
      } else if (platform === 'qq') {
        const res = await fetch(`${API_BASE}/api/qq/login/qr`);
        const data = await res.json();
        if (data.code === 200) {
          setQrCode(data.data.qrimg);
        } else {
          setError(data.msg || '获取二维码失败');
        }
      } else if (platform === 'kugou') {
        const res = await fetch(`${API_BASE}/api/kugou/login/qr`);
        const data = await res.json();
        if (data.code === 200) {
          setQrCode(data.data.qrimg);
        } else {
          setError(data.msg || '获取二维码失败');
        }
      }
    } catch {
      setError('网络错误，请检查 API 服务器是否启动');
    } finally {
      setLoading(false);
    }
  };

  const platforms: { id: Platform; name: string; icon: string }[] = [
    { id: 'netease', name: '网易云音乐', icon: '🎵' },
    { id: 'qq', name: 'QQ音乐', icon: '🎶' },
    { id: 'kugou', name: '酷狗音乐', icon: '🎧' },
  ];

  return (
    <div className="login-overlay" onClick={onClose}>
      <div className="login-modal" onClick={e => e.stopPropagation()}>
        <div className="login-header">
          <h3>登录账号</h3>
          <button className="login-close" onClick={onClose}>✕</button>
        </div>

        {/* 平台选择 */}
        <div className="login-tabs">
          {platforms.map(p => (
            <button
              key={p.id}
              className={`login-tab${platform === p.id ? ' active' : ''}`}
              onClick={() => { setPlatform(p.id); setQrCode(null); setError(null); }}
            >
              <span>{p.icon}</span>
              <span>{p.name}</span>
            </button>
          ))}
        </div>

        {/* 登录内容 */}
        <div className="login-body">
          {loading && <div className="login-loading">加载中...</div>}

          {error && <div className="login-error">{error}</div>}

          {qrCode ? (
            <div className="login-qr">
              <img src={qrCode} alt="登录二维码" />
              <p>请使用{platforms.find(p => p.id === platform)?.name}APP扫码登录</p>
            </div>
          ) : (
            <button className="login-btn" onClick={handleLogin} disabled={loading}>
              {loading ? '加载中...' : `使用${platforms.find(p => p.id === platform)?.name}扫码登录`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
