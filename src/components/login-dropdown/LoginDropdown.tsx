import { useState, useRef, useEffect, useCallback } from 'react';
import './login-dropdown.css';

interface PlatformAccount {
  platform: 'netease' | 'qq' | 'kugou';
  nickname: string;
  avatar: string;
  userId: string;
  bindTime: number;
  membership: {
    status: 'vip' | 'normal' | 'unknown';
    type: string | null;
    expireAt?: number;
  };
}

/** 兼容旧格式：{vip, vipName} → {membership: {status, type}} */
function normalizeAccount(acc: any): PlatformAccount {
  if (acc.membership) return acc as PlatformAccount;
  return {
    platform: acc.platform,
    nickname: acc.nickname || '',
    avatar: acc.avatar || '',
    userId: acc.userId || '',
    bindTime: acc.bindTime || Date.now(),
    membership: { status: acc.vip ? 'vip' : 'unknown', type: acc.vipName || null },
  };
}

interface LoginDropdownProps {
  onClose: () => void;
}

const PLATFORMS = [
  { id: 'netease' as const, name: '网易云音乐', icon: '/platform-icons/wyy.svg', color: '#ec4141' },
  { id: 'qq' as const, name: 'QQ音乐', icon: '/platform-icons/qq.svg', color: '#31c27c' },
  { id: 'kugou' as const, name: '酷狗音乐', icon: '/platform-icons/kg.svg', color: '#1a7dc9' },
];

export default function LoginDropdown({ onClose }: LoginDropdownProps) {
  const [activeTab, setActiveTab] = useState<'bound' | 'netease' | 'qq' | 'kugou'>('bound');
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [hoveredPlatform, setHoveredPlatform] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 启动时：通过 account:get 主动读取已保存账号
  useEffect(() => {
    window.electronAPI?.getAccounts().then((stored: PlatformAccount[]) => {
      if (stored && stored.length > 0) {
        setAccounts(stored.map(normalizeAccount));
      }
    }).catch(() => {});
  }, []);

  // 解绑账号（清除 cookie + 通知主进程移除）
  const handleUnbind = useCallback((platform: 'netease' | 'qq' | 'kugou') => {
    window.electronAPI?.clearPlatformSession(platform);
    window.electronAPI?.removeAccount(platform);
    setAccounts(prev => prev.filter(a => a.platform !== platform));
  }, []);


  // Phase 2: QR 登录状态
  const [qrModal, setQrModal] = useState<{ visible: boolean; qrImg: string | null; unikey: string | null; status: string }>({
    visible: false,
    qrImg: null,
    unikey: null,
    status: '',
  });

  // 打开平台登录（网易云/酷狗用 QR，QQ 用网页）
  const handleBind = useCallback(async (platform: 'netease' | 'qq' | 'kugou') => {
    if (platform === 'netease') {
      const result = await window.electronAPI?.getQRKey();
      if (result?.code === 200) {
        setQrModal({ visible: true, qrImg: result.data.qrimg, unikey: result.data.unikey, status: '请使用APP扫码' });
        startQRPolling(result.data.unikey);
      } else {
        setQrModal({ visible: true, qrImg: null, unikey: null, status: result?.msg || '获取二维码失败' });
      }
    } else if (platform === 'kugou') {
      const result = await window.electronAPI?.getKuGouQRKey();
      if (result?.code === 200) {
        setQrModal({ visible: true, qrImg: result.data.qrimg, unikey: result.data.sigx, status: '请使用APP扫码' });
        startKuGouQRPolling(result.data.sigx);
      } else {
        setQrModal({ visible: true, qrImg: null, unikey: null, status: result?.msg || '获取二维码失败' });
      }
    } else if (platform === 'qq') {
      // QQ扫码登录（qq-music-api）
      const result = await window.electronAPI?.getQQQRKey();
      if (result?.code === 200 && result.data?.img) {
        setQrModal({ visible: true, qrImg: result.data.img, unikey: result.data.qrsig, status: '请使用QQ音乐APP扫码' });
        startQQQRPolling(result.data.qrsig, result.data.ptqrtoken);
      } else {
        setQrModal({ visible: true, qrImg: null, unikey: null, status: result?.msg || '获取二维码失败' });
      }
    }
  }, []);

  // 网易云 QR 轮询
  const startQRPolling = useCallback((unikey: string) => {
    const timer = setInterval(async () => {
      try {
        const res = await window.electronAPI?.checkQRStatus(unikey);
        if (res?.code === 803) {
          clearInterval(timer);
          setQrModal(prev => ({ ...prev, status: '登录成功！' }));
          const userRes = await window.electronAPI?.getQRUserInfo();
          if (userRes?.code === 200 && userRes.data) {
            const info = userRes.data;
            const newAccount: PlatformAccount = {
              platform: 'netease',
              nickname: info.nickname || '网易云用户',
              avatar: info.avatar || '',
              userId: String(info.userId || ''),
              bindTime: Date.now(),
              membership: { status: info.vip ? 'vip' : 'unknown', type: info.vip ? info.vipName || 'netease_vip' : null },
            };
            window.electronAPI?.upsertAccount(newAccount);
            setAccounts(prev => [...prev.filter(a => a.platform !== 'netease'), newAccount]);
            setActiveTab('bound');
          }
          setTimeout(() => setQrModal({ visible: false, qrImg: null, unikey: null, status: '' }), 1000);
        } else if (res?.code === 802) {
          setQrModal(prev => ({ ...prev, status: '已扫码，请在手机上确认' }));
        } else if (res?.code === 800) {
          setQrModal(prev => ({ ...prev, status: '二维码已过期' }));
          clearInterval(timer);
        }
      } catch { /* ignore */ }
    }, 2000);
  }, []);

  // 酷狗 QR 轮询
  const startKuGouQRPolling = useCallback((sigx: string) => {
    const timer = setInterval(async () => {
      try {
        const res = await window.electronAPI?.checkKuGouQRStatus(sigx);
        if (res?.code === 0) {
          clearInterval(timer);
          setQrModal(prev => ({ ...prev, status: '登录成功！' }));
          const newAccount: PlatformAccount = {
            platform: 'kugou',
            nickname: '酷狗用户',
            avatar: '',
            userId: String(res.userid || ''),
            bindTime: Date.now(),
            membership: { status: 'unknown', type: null },
          };
          window.electronAPI?.upsertAccount(newAccount);
          setAccounts(prev => [...prev.filter(a => a.platform !== 'kugou'), newAccount]);
          setActiveTab('bound');
          setTimeout(() => setQrModal({ visible: false, qrImg: null, unikey: null, status: '' }), 1000);
        } else if (res?.code === 2) {
          setQrModal(prev => ({ ...prev, status: '已扫码，请在手机上确认' }));
        } else if (res?.code === -1) {
          setQrModal(prev => ({ ...prev, status: '二维码已过期' }));
          clearInterval(timer);
        }
      } catch { /* ignore */ }
    }, 2000);
  }, []);

  // QQ扫码轮询（qq-music-api）
  const startQQQRPolling = useCallback((qrsig: string, ptqrtoken?: string) => {
    const timer = setInterval(async () => {
      try {
        const res = await window.electronAPI?.checkQQQRStatus({ qrsig, ptqrtoken });
        if (res?.code === 0 && res.session?.cookie) {
          clearInterval(timer);
          setQrModal(prev => ({ ...prev, status: '登录成功！' }));
          const newAccount: PlatformAccount = {
            platform: 'qq',
            nickname: res.session.cookieObject?.nick || 'QQ用户',
            avatar: '',
            userId: res.session.cookieObject?.uin || '',
            bindTime: Date.now(),
            membership: { status: 'unknown', type: null },
          };
          window.electronAPI?.upsertAccount(newAccount);
          setAccounts(prev => [...prev.filter(a => a.platform !== 'qq'), newAccount]);
          setActiveTab('bound');
          setTimeout(() => setQrModal({ visible: false, qrImg: null, unikey: null, status: '' }), 1000);
        } else if (res?.code === 'wait') {
          setQrModal(prev => ({ ...prev, status: '已扫码，请在手机上确认' }));
        } else if (res?.code === 'expired' || res?.code === 'timeout') {
          setQrModal(prev => ({ ...prev, status: '二维码已过期' }));
          clearInterval(timer);
        } else if (res?.code === 'invalid') {
          setQrModal(prev => ({ ...prev, status: '扫码失败，请重试' }));
          clearInterval(timer);
        }
      } catch { /* ignore */ }
    }, 2000);
  }, []);

  // 主进程返回登录结果后直接绑定（使用 setAccounts(prev) 避免闭包问题）
  const handleLoginResult = useCallback((result: {
    platform: string;
    success: boolean;
    msg?: string;
    user?: { platform: string; nickname: string; avatar: string; userId: string; vip: boolean; vipName: string };
    cookie?: string;
  }) => {
    if (!result.success || !result.user) {
      console.warn('登录失败:', result.msg);
      return;
    }
    const newAccount: PlatformAccount = {
      platform: result.user.platform as 'netease' | 'qq' | 'kugou',
      nickname: result.user.nickname,
      avatar: result.user.avatar || '',
      userId: result.user.userId || '',
      bindTime: Date.now(),
      membership: { status: result.user.vip ? 'vip' : 'unknown', type: result.user.vip ? result.user.vipName || null : null },
    };
    window.electronAPI?.upsertAccount(newAccount);
    setAccounts(prev => [...prev.filter(a => a.platform !== result.user!.platform), newAccount]);
    setActiveTab('bound');
  }, []);

  // 监听主进程登录结果 + 启动恢复（自动清理旧监听器）
  useEffect(() => {
    const cleanup = window.electronAPI?.onLoginResult(handleLoginResult);
    return cleanup;
  }, [handleLoginResult]);

  // 点击外部关闭（QR 弹窗可见时不关闭）
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (qrModal.visible) return; // QR 弹窗打开时禁止 outside-close
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, qrModal.visible]);

  // 获取会员显示文本
  const getVipLabel = (membership: PlatformAccount['membership']) => {
    if (membership.status !== 'vip') return '无';
    if (membership.type) return membership.type;
    return 'VIP';
  };

  return (
    <>
      <div className="login-dropdown" ref={dropdownRef}>
        {/* 顶部 Tab 栏 */}
        <div className="login-tabs">
          <button
            className={`login-tab-btn${activeTab === 'bound' ? ' active' : ''}`}
            onClick={() => setActiveTab('bound')}
            onMouseEnter={() => setHoveredPlatform('bound')}
            onMouseLeave={() => setHoveredPlatform(null)}
          >
            <img src="/logo.png" alt="IvyM" className="tab-icon" />
            {hoveredPlatform === 'bound' && <span className="tab-tooltip">已绑定</span>}
          </button>

          {PLATFORMS.map(p => (
            <button
              key={p.id}
              className={`login-tab-btn${activeTab === p.id ? ' active' : ''}`}
              onClick={() => setActiveTab(p.id)}
              onMouseEnter={() => setHoveredPlatform(p.id)}
              onMouseLeave={() => setHoveredPlatform(null)}
            >
              <img src={p.icon} alt={p.name} className="tab-icon" />
              {hoveredPlatform === p.id && <span className="tab-tooltip">{p.name}</span>}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div className="login-dropdown-body">
          {/* ===== 已绑定 ===== */}
          {activeTab === 'bound' && (
            <div className="bound-list">
              {accounts.length === 0 ? (
                <div className="bound-empty">暂未绑定任何平台账号</div>
              ) : (
                accounts.map(acc => {
                  const platform = PLATFORMS.find(p => p.id === acc.platform)!;
                  return (
                    <div key={acc.platform} className="bound-item">
                      {acc.avatar ? (
                        <img src={acc.avatar} alt="" className="bound-avatar" />
                      ) : (
                        <div className="bound-avatar bound-avatar-placeholder">{acc.nickname?.[0] || '?'}</div>
                      )}
                      <div className="bound-info">
                        <div className="bound-name-row">
                          <span className="bound-nickname">{acc.nickname || '用户' + acc.userId}</span>
                          {acc.membership.status === 'vip' && (
                            <img
                              src={acc.platform === 'qq' ? '/icons/vip-qq.svg' : '/icons/vip-netease.svg'}
                              alt={acc.membership.type || 'VIP'}
                              className="bound-vip-icon"
                            />
                          )}
                        </div>
                        <div className="bound-platform" style={{ color: platform.color }}>
                          {platform.icon && <img src={platform.icon} alt="" className="bound-platform-icon" />}
                          {platform.name} · ID: {acc.userId}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ===== 平台详情 ===== */}
          {activeTab !== 'bound' && (
            <div className="platform-detail">
              {(() => {
                const account = accounts.find(a => a.platform === activeTab);
                const platform = PLATFORMS.find(p => p.id === activeTab)!;
                if (!account) {
                  return (
                    <div className="platform-unbound">
                      <img
                        src={platform.icon}
                        alt={platform.name}
                        className="platform-icon-large clickable-icon"
                        onClick={() => handleBind(activeTab)}
                        title="点击登录"
                      />
                      <p>尚未绑定{platform.name}账号</p>
                      <span className="platform-hint">点击图标登录</span>
                    </div>
                  );
                }
                return (
                  <div className="platform-bound">
                    <div className="platform-user-row">
                      {account.avatar ? (
                        <img src={account.avatar} alt="" className="platform-avatar" />
                      ) : (
                        <div className="platform-avatar platform-avatar-placeholder">{account.nickname?.[0] || '?'}</div>
                      )}
                      <span className="platform-nickname">{account.nickname || '用户' + account.userId}</span>
                    </div>
                    <div className="platform-vip-row">
                      <span className="platform-vip-label">会员：</span>
                      {account.membership.status === 'vip' ? (
                        <img
                          src={account.platform === 'qq' ? '/icons/vip-qq.svg' : '/icons/vip-netease.svg'}
                          alt={account.membership.type || 'VIP'}
                          className="platform-vip-svg"
                        />
                      ) : (
                        <span className="platform-vip-value">{account.membership.status === 'unknown' ? '未知' : '无'}</span>
                      )}
                    </div>
                    <div className="platform-userid">ID：{account.userId}</div>
                    <button className="platform-unbind-btn" onClick={() => handleUnbind(activeTab)}>
                      解绑账号
                    </button>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* ===== QR 登录弹窗 ===== */}
      {qrModal.visible && (
        <div className="qr-overlay" onClick={() => setQrModal({ visible: false, qrImg: null, unikey: null, status: '' })}>
          <div className="qr-modal" onClick={e => e.stopPropagation()}>
            <div className="qr-header">
              <h3>
                <img src="/platform-icons/wyy.svg" alt="" className="qr-platform-icon" />
                扫码登录
              </h3>
              <button className="qr-close" onClick={() => setQrModal({ visible: false, qrImg: null, unikey: null, status: '' })}>✕</button>
            </div>
            <div className="qr-body">
              {qrModal.qrImg ? (
                <>
                  <img src={qrModal.qrImg} alt="QR Code" className="qr-img" />
                  <p className="qr-status">{qrModal.status}</p>
                  <button
                    className="qr-browser-login-btn is-netease"
                    onClick={() => {
                      setQrModal({ visible: false, qrImg: null, unikey: null, status: '' });
                      window.electronAPI?.openPlatformLogin('netease');
                    }}
                  >
                    网页登录（扫码失败点此）
                  </button>
                </>
              ) : (
                <>
                  <p className="qr-error">{qrModal.status || '加载中...'}</p>
                  <button
                    className="qr-browser-login-btn is-netease"
                    onClick={() => {
                      setQrModal({ visible: false, qrImg: null, unikey: null, status: '' });
                      window.electronAPI?.openPlatformLogin('netease');
                    }}
                  >
                    网页登录
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
