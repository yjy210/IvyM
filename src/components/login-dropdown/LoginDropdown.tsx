import { useState, useRef, useEffect, useCallback } from 'react';
import './login-dropdown.css';

interface PlatformAccount {
  platform: 'netease' | 'qq';
  nickname: string;
  avatar: string;
  vip?: boolean;
  vipName?: string;
  userId: string;
  cookie: string;
  bindTime: number;
}

interface LoginDropdownProps {
  onClose: () => void;
}

const PLATFORMS = [
  { id: 'netease' as const, name: '网易云音乐', icon: '/platform-icons/wyy.webp', color: '#ec4141' },
  { id: 'qq' as const, name: 'QQ音乐', icon: '/platform-icons/qq.webp', color: '#31c27c' },
];

export default function LoginDropdown({ onClose }: LoginDropdownProps) {
  const [activeTab, setActiveTab] = useState<'bound' | 'netease' | 'qq'>('bound');
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [hoveredPlatform, setHoveredPlatform] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 从 localStorage 加载已绑定账号
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ivym_accounts');
      if (saved) setAccounts(JSON.parse(saved));
    } catch {}
  }, []);

  // 保存账号到 localStorage
  const saveAccounts = useCallback((accs: PlatformAccount[]) => {
    setAccounts(accs);
    localStorage.setItem('ivym_accounts', JSON.stringify(accs));
  }, []);

  // 解绑账号（同时清除该平台 partition 的 cookie）
  const handleUnbind = useCallback((platform: 'netease' | 'qq') => {
    window.electronAPI?.clearPlatformSession(platform);
    const filtered = accounts.filter(a => a.platform !== platform);
    saveAccounts(filtered);
  }, [accounts, saveAccounts]);

  // 打开平台官方登录页
  const handleBind = useCallback((platform: 'netease' | 'qq') => {
    window.electronAPI?.openPlatformLogin(platform);
  }, []);

  // 主进程返回登录结果后直接绑定
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
      platform: result.user.platform as 'netease' | 'qq',
      nickname: result.user.nickname,
      avatar: result.user.avatar || '',
      vip: result.user.vip || false,
      vipName: result.user.vipName || '',
      userId: result.user.userId || '',
      cookie: result.cookie || '',
      bindTime: Date.now(),
    };
    setAccounts(prev => {
      const filtered = prev.filter(a => a.platform !== result.user!.platform);
      const updated = [...filtered, newAccount];
      localStorage.setItem('ivym_accounts', JSON.stringify(updated));
      return updated;
    });
    setActiveTab('bound');
  }, []);

  // 监听主进程登录结果
  useEffect(() => {
    window.electronAPI?.onLoginResult(handleLoginResult);
  }, [handleLoginResult]);

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // 获取会员显示文本
  const getVipLabel = (platform: 'netease' | 'qq', vip?: boolean, vipName?: string) => {
    if (!vip) return '无';
    if (vipName) return vipName;
    return platform === 'netease' ? '黑胶VIP' : '豪华绿钻';
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
                          {acc.vip && (
                            <span className="bound-vip-inline">
                              {acc.platform === 'netease' ? '黑胶VIP' : '豪华绿钻'}
                            </span>
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
                      <span className="platform-vip-label">
                        {account.platform === 'netease' ? '黑胶会员：' : '豪华绿钻：'}
                      </span>
                      {account.vip ? (
                        <span className={`platform-vip-value ${account.platform === 'netease' ? 'is-gold' : 'is-green'}`}>
                          {account.platform === 'netease' ? '黑胶VIP' : '豪华绿钻'}
                        </span>
                      ) : (
                        <span className="platform-vip-value">无</span>
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
    </>
  );
}
