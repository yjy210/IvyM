import { useState, useEffect, useCallback } from 'react';

const navItems = [
  { id: 'home', label: '首页', icon: 'home' },
  { id: 'search', label: '搜索', icon: 'search' },
  { id: 'playlist', label: '歌单', icon: 'playlist' },
  { id: 'favorite', label: '收藏', icon: 'heart' },
];

const icons: Record<string, React.ReactNode> = {
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  search: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
      <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  playlist: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  heart: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

interface PlatformAccount {
  platform: 'netease' | 'qq' | 'kugou';
  nickname: string;
  avatar: string;
  userId: string;
  vip: boolean;
  vipName: string;
  membership?: {
    status: 'vip' | 'normal' | 'unknown';
    level: string | null;
    name: string | null;
    icon: string | null;
  };
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);

  // 启动时读取已保存账号
  useEffect(() => {
    window.electronAPI?.getAccounts().then(stored => {
      if (stored?.length) setAccounts(stored as PlatformAccount[]);
    }).catch(() => {});
  }, []);

  // 刷新账号列表
  const refreshAccounts = useCallback(() => {
    window.electronAPI?.getAccounts().then(stored => {
      setAccounts((stored as PlatformAccount[]) || []);
    }).catch(() => {});
  }, []);

  // 启动时读取
  useEffect(() => { refreshAccounts(); }, [refreshAccounts]);

  // 监听登录成功事件 + 定期刷新
  useEffect(() => {
    // 监听前端 login-dropdown 发来的登录成功事件
    const onLoginSuccess = () => refreshAccounts();
    window.addEventListener('login-success', onLoginSuccess);
    // Electron IPC 登录结果事件(兼容)
    const cleanup = window.electronAPI?.onLoginResult(onLoginSuccess);
    // 兜底 3s 轮询
    const timer = setInterval(refreshAccounts, 3000);
    return () => {
      window.removeEventListener('login-success', onLoginSuccess);
      cleanup?.();
      clearInterval(timer);
    };
  }, [refreshAccounts]);

  // 关闭下拉框时主动刷新(触发重新渲染)
  useEffect(() => {
    const handler = () => refreshAccounts();
    window.addEventListener('login-dropdown-closed', handler);
    return () => window.removeEventListener('login-dropdown-closed', handler);
  }, [refreshAccounts]);

  return (
    <aside className="w-52 bg-white/50 backdrop-blur-xl border-r border-black/5 flex flex-col py-4 shrink-0">
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              currentPage === item.id
                ? 'bg-primary/10 text-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-black/5'
            }`}
          >
            {icons[item.icon]}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* 账号列表 */}
      {accounts.length > 0 && (
        <div className="px-3 py-2 space-y-1.5 border-t border-black/5 mt-2">
          {accounts.map(acc => {
            const colors: Record<string, string> = { netease: '#ec4141', qq: '#31c27c', kugou: '#1a7dc9' };
            const icons: Record<string, string> = { netease: '网易', qq: 'QQ', kugou: 'KG' };
            return (
              <div key={acc.platform} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-black/5 transition-colors">
                {acc.avatar ? (
                  <img src={acc.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: colors[acc.platform] }}>
                    {icons[acc.platform]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-text-primary truncate">{acc.nickname}</div>
                </div>
                {/* 会员图标：有 icon（QQ）用 img，否则用文字 badge；VIP 必须有 level/icon 才显示 */}
                {acc.membership?.status === 'vip' && (acc.membership.level || acc.membership.icon) && (
                  acc.membership.icon ? (
                    <img src={acc.membership.icon} alt={acc.membership.name || 'VIP'}
                      className="bound-vip-icon" referrerPolicy="no-referrer"
                      onError={(e) => {
                        // QQ 失败降级本地图标；网易云无本地图标直接隐藏
                        if (acc.platform === 'qq') (e.currentTarget as HTMLImageElement).src = '/icons/vip-qq.svg';
                        else (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }} />
                  ) : (
                    <span className={`bound-vip-inline is-${acc.platform}`}>
                      <span className="vip-text-gradient">
                        {acc.platform === 'qq'
                          ? (acc.membership.level === 'super_vip' ? 'SVIP' : 'VIP')
                          : (acc.membership.level === 'black_svip' ? 'SVIP' : 'VIP')}
                      </span>
                    </span>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="px-4 py-3 border-t border-black/5">
        <p className="text-xs text-text-muted">IvyM Music v0.1</p>
        <p className="text-xs text-text-muted/60 mt-0.5">网易云 · QQ音乐</p>
      </div>
    </aside>
  );
}
