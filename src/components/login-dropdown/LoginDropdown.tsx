import { useState, useRef, useEffect, useCallback } from 'react';
import LoginModal from '../login-modal/LoginModal';
import './login-dropdown.css';

interface PlatformAccount {
  platform: 'netease' | 'qq' | 'kugou';
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
  { id: 'netease' as const, name: '网易云音乐', icon: '🎵', color: '#ec4141' },
  { id: 'qq' as const, name: 'QQ音乐', icon: '🎶', color: '#31c27c' },
  { id: 'kugou' as const, name: '酷狗音乐', icon: '🎧', color: '#2fa0f4' },
];

export default function LoginDropdown({ onClose }: LoginDropdownProps) {
  const [activeTab, setActiveTab] = useState<'bound' | 'netease' | 'qq' | 'kugou'>('bound');
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [showQR, setShowQR] = useState<'netease' | 'qq' | 'kugou' | null>(null);
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

  // 解绑账号
  const handleUnbind = useCallback((platform: 'netease' | 'qq' | 'kugou') => {
    const filtered = accounts.filter(a => a.platform !== platform);
    saveAccounts(filtered);
  }, [accounts, saveAccounts]);

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

  const boundPlatforms = accounts.map(a => a.platform);

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
              <span className="tab-icon-emoji" style={{ color: p.color }}>{p.icon}</span>
              {hoveredPlatform === p.id && <span className="tab-tooltip">{p.name}</span>}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div className="login-dropdown-body">
          {activeTab === 'bound' && (
            <div className="bound-list">
              {accounts.length === 0 ? (
                <div className="bound-empty">暂未绑定任何平台账号</div>
              ) : (
                accounts.map(acc => {
                  const platform = PLATFORMS.find(p => p.id === acc.platform)!;
                  return (
                    <div key={acc.platform} className="bound-item">
                      <img src={acc.avatar || '/logo.png'} alt="" className="bound-avatar" />
                      <div className="bound-info">
                        <div className="bound-name-row">
                          <span className="bound-nickname">{acc.nickname}</span>
                          {acc.vip && <span className="bound-vip">{acc.vipName || `${platform.name}会员`}</span>}
                        </div>
                        <div className="bound-platform" style={{ color: platform.color }}>
                          {platform.icon} {platform.name} · ID: {acc.userId}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab !== 'bound' && (
            <div className="platform-detail">
              {(() => {
                const account = accounts.find(a => a.platform === activeTab);
                const platform = PLATFORMS.find(p => p.id === activeTab)!;
                if (!account) {
                  return (
                    <div className="platform-unbound">
                      <span className="platform-icon-large" style={{ color: platform.color }}>{platform.icon}</span>
                      <p>尚未绑定{platform.name}账号</p>
                      <button className="platform-bind-btn" onClick={() => setShowQR(activeTab)}>
                        扫码绑定
                      </button>
                    </div>
                  );
                }
                return (
                  <div className="platform-bound">
                    <div className="platform-header">
                      <img src={account.avatar || '/logo.png'} alt="" className="platform-avatar" />
                      <div>
                        <div className="platform-nickname">{account.nickname}</div>
                        {account.vip && <span className="bound-vip">{account.vipName || `${platform.name}会员`}</span>}
                      </div>
                    </div>
                    <div className="platform-userid">
                      {activeTab === 'netease' && `网易云音乐 ID: ${account.userId}`}
                      {activeTab === 'qq' && `QQ号: ${account.userId}`}
                      {activeTab === 'kugou' && `酷狗音乐 ID: ${account.userId}`}
                    </div>
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

      {showQR && (
        <LoginModal
          visible={true}
          platform={showQR}
          onClose={() => setShowQR(null)}
          onLoginSuccess={(info) => {
            const newAccount: PlatformAccount = {
              platform: showQR!,
              nickname: info.nickname || `${PLATFORMS.find(p => p.id === showQR)!.name}用户`,
              avatar: info.avatar || '',
              vip: info.vip || false,
              vipName: info.vipName || '',
              userId: info.userId || '',
              cookie: info.cookie || '',
              bindTime: Date.now(),
            };
            const filtered = accounts.filter(a => a.platform !== showQR);
            saveAccounts([...filtered, newAccount]);
            setShowQR(null);
            setActiveTab('bound');
          }}
        />
      )}
    </>
  );
}
