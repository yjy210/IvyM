import { useState, useRef, useEffect, useCallback } from 'react';
import './login-dropdown.css';
import { useMembershipStore } from '../../stores/membershipStore';

interface PlatformAccount {
  platform: 'netease' | 'qq' | 'kugou';
  nickname: string;
  avatar: string;
  userId: string;
  bindTime: number;
  membership: {
    status: 'vip' | 'normal' | 'unknown';
    provider?: 'qq' | 'netease' | 'kugou' | null;
    level: string | null;
    name: string | null;
    icon: string | null;
    type?: string | null;
    expireAt?: number;
  };
}

/**
 * ★ 保留后端给的真实 status（不下推、不错位），仅做字段清洗
 *   后端 membership.status === 'unknown' → 显示未知，不冒充 VIP
 */
function normalizeMembership(m?: PlatformAccount['membership']): PlatformAccount['membership'] {
  if (!m) return { status: 'unknown', provider: null, level: null, name: null, icon: null };
  // 脏数据降级：status=vip 但无 level 且无 icon → 不算 VIP，降级
  if (m.status === 'vip' && !m.level && !m.icon) {
    return { ...m, status: 'normal' };
  }
  return {
    status: m.status || 'unknown',
    provider: m.provider ?? null,
    level: m.level ?? null,
    name: m.name ?? null,
    icon: m.icon ?? null,
    ...(m.type ? { type: m.type } : {}),
    ...(m.expireAt ? { expireAt: m.expireAt } : {}),
  };
}

/** 兼容旧格式：{vip, vipName} → {membership: {status, level, name, icon}} */
function normalizeAccount(acc: any): PlatformAccount {
  if (acc.membership && acc.membership.level !== undefined) return { ...acc, membership: normalizeMembership(acc.membership) };
  let status = acc.membership?.status || (acc.vip ? 'vip' : 'unknown');
  // 脏数据降级：vip 但无 level+icon → normal
  if (status === 'vip' && !(acc.membership?.level) && !(acc.membership?.icon)) status = 'normal';
  return {
    platform: acc.platform,
    nickname: acc.nickname || '',
    avatar: acc.avatar || '',
    userId: acc.userId || '',
    bindTime: acc.bindTime || Date.now(),
    membership: normalizeMembership({
      status,
      provider: acc.membership?.provider || null,
      level: acc.membership?.level || null,
      name: acc.membership?.name || acc.vipName || null,
      icon: acc.membership?.icon || null,
    }),
  };
}

/**
 * 脏数据防护：真正的 VIP 必须有 level 或 icon，否则降级为 normal。
 * 部分旧代码曾写入 {status:'vip', level:null} 的脏数据。
 */
function isRealVip(acc: PlatformAccount): boolean {
  if (acc.membership?.status !== 'vip') return false;
  return !!(acc.membership.level || acc.membership.icon);
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
  // QQ 启动时需要重新从后端拉取用户信息（VIP 等状态需在服务端判断）
  useEffect(() => {
    window.electronAPI?.getAccounts().then((stored: PlatformAccount[]) => {
      if (stored && stored.length > 0) {
        setAccounts(stored.map(normalizeAccount));
        const hasQQ = stored.some(a => a.platform === 'qq');
        const hasNetease = stored.some(a => a.platform === 'netease');
        // 启动时重新同步 QQ 用户信息（VIP 状态依赖服务端）
        if (hasQQ) {
          fetch('http://localhost:3001/api/qq/user')
            .then(r => r.json())
            .then(data => {
              if (data?.data) {
                const info = data.data;
                setAccounts(prev => {
                  const idx = prev.findIndex(a => a.platform === 'qq');
                  if (idx < 0) return prev;
                  const updated: PlatformAccount = {
                    ...prev[idx],
                    nickname: info.nickname || prev[idx].nickname,
                    avatar: info.avatar || prev[idx].avatar,
                    membership: normalizeMembership(info.membership),
                  };
                  window.electronAPI?.upsertAccount(updated);
                  return [...prev.filter(a => a.platform !== 'qq'), updated];
                });
              }
            })
            .catch(() => {});
        }
      }
    }).catch(() => {});
  }, []);

  // 解绑账号（清除 cookie + 通知主进程移除）
  const handleUnbind = useCallback((platform: 'netease' | 'qq' | 'kugou') => {
    window.electronAPI?.clearPlatformSession(platform);
    window.electronAPI?.removeAccount(platform);
    setAccounts(prev => prev.filter(a => a.platform !== platform));
  }, []);


  // Phase 2: QR 登录状态机
  // status: 'idle' | 'waiting'(等待扫码) | 'scanned'(已扫待确认) | 'failed'(失败)
  // 成功时静默关闭弹窗，不展示 "成功" 界面
  type QRStatus = 'idle' | 'waiting' | 'scanned' | 'failed';
  const [qrModal, setQrModal] = useState<{
    visible: boolean;
    qrImg: string | null;
    unikey: string | null;
    ptqrtoken: string | null;
    status: QRStatus;
    errorMsg: string;
  }>({
    visible: false,
    qrImg: null,
    unikey: null,
    ptqrtoken: null,
    status: 'idle',
    errorMsg: '',
  });
  // 用于清理轮询，避免竞态（连续快速点刷新时旧 timer 继续跑）
  const qrPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopQRPoll = useCallback(() => {
    if (qrPollTimerRef.current) {
      clearInterval(qrPollTimerRef.current);
      qrPollTimerRef.current = null;
    }
  }, []);

  // 打开平台登录（网易云/酷狗/QQ 均用官网 BrowserWindow）
  const handleBind = useCallback(async (platform: 'netease' | 'qq' | 'kugou') => {
    if (platform === 'netease') {
      try {
        const result = await window.electronAPI?.openPlatformLogin(platform);
        handleLoginResult({
          platform,
          success: result?.success ?? false,
          cookie: result?.cookie,
          user: result?.user,
          msg: result?.msg,
        });
      } catch (e: any) {
        setQrModal({ visible: true, qrImg: null, unikey: null, ptqrtoken: null, status: 'failed', errorMsg: e?.message || '登录失败' });
      }
      return;
    }
    if (platform === 'kugou') {
      // ★ 酷狗客户端 QR 登录 — 前端主动轮询驱动状态机
      //  电子端 generate QR 后在其 finish() 只在 check 被调用时评估 status，没有内部 polling。
      //  所以前端必须 setInterval 调 checkKugouQr(sigx) 推动流程。
      try {
        // ① 清理上一次 polling
        stopQRPoll();
        let savedSigx = '';
        setQrModal({ visible: true, qrImg: null, unikey: null, ptqrtoken: null, status: 'waiting', errorMsg: '' });

        // ② 启动 QR 登录
        window.electronAPI?.startKugouQrLogin();

        // ③ 监听 QR 图片 — 拿到后启动主动 polling
        const unsubImg = window.electronAPI?.onKugouQrImg(({ qrimg, sigx }) => {
          savedSigx = sigx;
          setQrModal(prev => ({ ...prev, qrImg: qrimg }));
          // ★ QR 就绪 → 启动前端 polling（每 1.5s 调一次 check）
          if (!qrPollTimerRef.current && sigx) {
            qrPollTimerRef.current = setInterval(async () => {
              try {
                const status = await window.electronAPI?.checkKugouQr(sigx);
                if (!status) return;
                if (status.status === 2) {
                  setQrModal(prev => ({ ...prev, status: 'scanned' }));
                } else if (status.status === 4) {
                  // 登录成功 — 由 onLoginResult 关闭弹窗；停止 polling
                  stopQRPoll();
                } else if (status.status === 0) {
                  // 过期
                  stopQRPoll();
                  setQrModal(prev => ({ ...prev, status: 'failed', errorMsg: '二维码已过期' }));
                }
              } catch { /* ignore */ }
            }, 1500);
          }
        });

        // ④ 监听状态同步（electron 推送的 scanned 状态）
        const unsubStatus = window.electronAPI?.onKugouQrStatus((s) => {
          if (s.status === 'scanned') setQrModal(prev => ({ ...prev, status: 'scanned' }));
        });

        // ⑤ 监听最终结果
        const cleanupResult = window.electronAPI?.onLoginResult((result) => {
          handleLoginResult(result);
          stopQRPoll();
          unsubImg?.();
          unsubStatus?.();
          setQrModal({ visible: false, qrImg: null, unikey: null, ptqrtoken: null, status: 'idle', errorMsg: '' });
        });

        // ⑥ 兜底 120s
        setTimeout(() => {
          stopQRPoll();
          unsubImg?.();
          unsubStatus?.();
          cleanupResult?.();
          setQrModal({ visible: false, qrImg: null, unikey: null, ptqrtoken: null, status: 'idle', errorMsg: '' });
        }, 120000);
      } catch (e: any) {
        stopQRPoll();
        setQrModal({ visible: true, qrImg: null, unikey: null, ptqrtoken: null, status: 'failed', errorMsg: e?.message || '登录失败' });
      }
      return;
    }
    if (platform === 'qq') {
      // ★ 第一阶段：QQ 走网页登录（y.qq.com 官方页面）
      // 旧 QR 路径（qq-music-api）已保留，后续作为 fallback
      try {
        const result = await window.electronAPI?.openPlatformLogin('qq');
        if (result?.success && result.cookie) {
          // 保存账号（server 端 openPlatformLogin 已自动 saveCookie）
          const nickname = result.user?.nickname || 'QQ用户';
          const avatar = result.user?.avatar || '';
          const userId = result.user?.userId || '';
          const vipBool = result.user?.vip || false;
          const qqMembership = result.user?.membership || null;
          const newAccount: PlatformAccount = {
            platform: 'qq',
            nickname, avatar, userId,
            bindTime: Date.now(),
            membership: qqMembership
              ? normalizeMembership(qqMembership)
              : { status: 'unknown', provider: 'qq', level: null, name: null, icon: null },
          };
          window.electronAPI?.upsertAccount(newAccount);
          setAccounts(prev => [...prev.filter(a => a.platform !== 'qq'), newAccount]);
          setActiveTab('bound');
          if (vipBool) {
            useMembershipStore.getState().setMembership('qq', {
              status: 'vip',
              type: qqMembership?.name || '豪华绿钻',
            });
          }
          // 没拿到完整 server side info,补拉一次
          if (!nickname || nickname === 'QQ用户' || !qqMembership) {
            fetch('http://localhost:3001/api/qq/user')
              .then(r => r.json())
              .then(data => {
                if (data?.data) {
                  const info = data.data;
                  const updatedMembership = normalizeMembership(info.membership);
                  const updated: PlatformAccount = {
                    ...newAccount,
                    nickname: info.nickname || nickname,
                    avatar: info.avatar || avatar,
                    membership: updatedMembership,
                  };
                  window.electronAPI?.upsertAccount(updated);
                  setAccounts(prev => [...prev.filter(a => a.platform !== 'qq'), updated]);
                  useMembershipStore.getState().setMembership('qq', {
                    status: 'vip',
                    type: updatedMembership.name || '豪华绿钻',
                  });
                }
              }).catch(() => {});
          }
        } else if (result?.msg) {
          console.warn('[QQ] web login failed:', result.msg);
        }
      } catch (e: any) {
        console.error('[QQ] web login error:', e.message);
      }
    }
  }, []);

  // 主进程返回登录结果后直接绑定（使用 setAccounts(prev) 避免闭包问题）
  const handleLoginResult = useCallback((result: {
    platform: string;
    success: boolean;
    msg?: string;
    user?: { platform: string; nickname: string; avatar: string; userId: string; vip: boolean; vipName: string; membership?: PlatformAccount['membership'] };
    cookie?: string;
  }) => {
    console.log('[LOGIN RESULT RECEIVED]', JSON.stringify({ platform: result.platform, success: result.success, hasUser: !!result.user, user: result.user }));
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
      membership: normalizeMembership(result.user.membership),
    };
    window.electronAPI?.upsertAccount(newAccount);
    setAccounts(prev => [...prev.filter(a => a.platform !== result.user!.platform), newAccount]);
    setActiveTab('bound');
    // ★ 通知 Sidebar 立即刷新
    window.dispatchEvent(new CustomEvent('login-success-{platform}'.replace('{platform}', result.user.platform)));
    window.dispatchEvent(new CustomEvent('login-success'));
  }, []);

  // 监听主进程登录结果 + 启动恢复（自动清理旧监听器）
  useEffect(() => {
    const cleanup = window.electronAPI?.onLoginResult(handleLoginResult);
    return cleanup;
  }, [handleLoginResult]);

  // ★ 关闭时主动通知 Sidebar 立即刷新（解决 login-success 不触达 Sidebar 的竞态）
  const closeWithRefresh = useCallback(() => {
    window.dispatchEvent(new CustomEvent('login-dropdown-closed'));
    onClose();
  }, [onClose]);

  // 点击外部关闭（QR 弹窗可见时不关闭）
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (qrModal.visible) return; // QR 弹窗打开时禁止 outside-close
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closeWithRefresh();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [closeWithRefresh, qrModal.visible]);

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
                          {isRealVip(acc) && (
                            acc.membership.icon ? (
                              <img src={acc.membership.icon} alt={acc.membership.name || 'VIP'}
                                className="bound-vip-icon" referrerPolicy="no-referrer"
                                onError={(e) => {
                                  // QQ 官方 CDN 失败时降级本地图标；网易云不降级（走文字 badge）
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
                      <span className="platform-vip-label">{account.platform === 'qq' ? '会员' : '会员'}：</span>
                      {isRealVip(account) ? (
                        account.membership.icon ? (
                          <img src={account.membership.icon} alt={account.membership.name || 'VIP'}
                            className="bound-vip-icon" referrerPolicy="no-referrer"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <span className={`bound-vip-inline is-${account.platform}`}>
                            <span className="vip-text-gradient">
                              {account.platform === 'qq'
                                ? (account.membership.level === 'super_vip' ? 'SVIP' : 'VIP')
                                : (account.membership.level === 'black_svip' ? 'SVIP' : 'VIP')}
                            </span>
                          </span>
                        )
                      ) : (
                        <span className="platform-vip-value">{account.membership?.status === 'unknown' ? '未知' : '无'}</span>
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

      {/* ===== QR 登录弹窗（状态机：waiting → success / failed） ===== */}
      {qrModal.visible && (() => {
        const isQQ = activeTab === 'qq';
        const platformName = PLATFORMS.find(p => p.id === activeTab)?.name || '音乐平台';
        const platformIcon = PLATFORMS.find(p => p.id === activeTab)?.icon || '/platform-icons/wyy.svg';
        const closeModal = () => {
          stopQRPoll();
          // ★ 关闭 QR 弹窗时通知后端清理 session，避免下次打开 QR 状态污染
          if (activeTab === 'kugou') {
            window.electronAPI?.cancelKugouQrLogin();
          }
          setQrModal({ visible: false, qrImg: null, unikey: null, ptqrtoken: null, status: 'idle', errorMsg: '' });
        };
        const statusText = {
          waiting: '请使用' + platformName + 'APP扫一扫',
          scanned: '扫码成功，请在手机上确认登录',
          failed: qrModal.errorMsg || '登录失败',
          idle: '',
        }[qrModal.status] || '';

        return (
          <div className="qr-overlay" onClick={closeModal}>
            <div className={`qr-modal${qrModal.status === 'scanned' ? ' qr-modal--scanned' : ''}${qrModal.status === 'failed' ? ' qr-modal--failed' : ''}`} onClick={e => e.stopPropagation()}>
              <div className="qr-header">
                <h3>
                  <img src={platformIcon} alt="" className="qr-platform-icon" />
                  扫码登录{platformName}
                </h3>
                <button className="qr-close" onClick={closeModal}>✕</button>
              </div>
              <div className="qr-body">
                {qrModal.qrImg && (qrModal.status === 'waiting' || qrModal.status === 'scanned') ? (
                  <>
                    <div className={`qr-img-wrap${qrModal.status === 'scanned' ? ' qr-img-wrap--scanned' : ''}`}>
                      <img src={qrModal.qrImg} alt="QR Code" className="qr-img" />
                      {qrModal.status === 'scanned' && (
                        <div className="qr-scanned-mask">
                          <span className="qr-scanned-text">扫码成功</span>
                        </div>
                      )}
                    </div>
                    <p className={`qr-status qr-status--${qrModal.status}`}>{statusText}</p>
                    {qrModal.status === 'waiting' && (
                      <button
                        className="qr-browser-login-btn"
                        onClick={() => {
                          stopQRPoll();
                          setQrModal({ visible: false, qrImg: null, unikey: null, ptqrtoken: null, status: 'idle', errorMsg: '' });
                          window.electronAPI?.openPlatformLogin(activeTab as 'netease' | 'qq' | 'kugou');
                        }}
                      >
                        网页登录
                      </button>
                    )}
                  </>
                ) : qrModal.status === 'failed' ? (
                  <>
                    <p className="qr-error">{statusText}</p>
                    <button className="qr-retry-btn" onClick={closeModal}>
                      重试
                    </button>
                    <button
                      className="qr-browser-login-btn"
                      onClick={() => {
                        setQrModal({ visible: false, qrImg: null, unikey: null, ptqrtoken: null, status: 'idle', errorMsg: '' });
                        onClose();
                      }}
                    >
                      取消
                    </button>
                  </>
                ) : (
                  <>
                    <p className="qr-error">加载中...</p>
                    <button className="qr-browser-login-btn" onClick={closeModal}>
                      取消
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
