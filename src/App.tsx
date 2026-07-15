import { useState, useEffect, useRef } from 'react';
import { TitleBar } from './components/TitleBar';
import { LogoAnimation } from './components/splash/LogoAnimation';
import Grainient from './components/grainient/Grainient';
import LoginDropdown from './components/login-dropdown/LoginDropdown';
import SearchBar from './components/search/SearchBar';
import Player from './components/player/Player';
import CoverTransition from './components/player/CoverTransition';
import { useCoverColor } from './components/player/useCoverColor';
import Search from './pages/Search';
import BackToTop from './components/BackToTop';
import { usePlayerStore } from './stores/playerStore';
import { Home } from './pages/Home';
import './components/login-dropdown/login-dropdown.css';
import './components/search/search-bar.css';
import './components/player/player.css';
import './components/player/cover-transition.css';
import './components/back-to-top.css';
import './pages/search-page.css';

export default function App() {
  const [entered, setEntered] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const currentView = usePlayerStore(s => s.currentView);
  const setCurrentView = usePlayerStore(s => s.setCurrentView);

  // ★ Electron 拖拽失焦桥: 窗口拖拽开始/结束时由 preload IPC 广播, 这里 blur 搜索框
  useEffect(() => {
    if (!window.electronAPI?.onWindowDragStart) return;
    const offStart = window.electronAPI.onWindowDragStart(() => {
      const el = document.activeElement as HTMLElement | null;
      if (el && el.classList && el.classList.contains('s-input')) el.blur();
    });
    const offEnd = window.electronAPI.onWindowDragEnd(() => {});
    return () => { offStart?.(); offEnd?.(); };
  }, []);

  // ★ 封面主色提取（监听 currentSong.cover）
  useCoverColor();
  const setCoverOpen = usePlayerStore(s => s.setCoverOpen);
  const coverOpen = usePlayerStore(s => s.coverOpen);
  const currentSong = usePlayerStore(s => s.currentSong);
  // ★ 切歌时收回封面（用 ref 跟踪上一首 id，避免首帧误触发）
  const prevSongIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = currentSong ? `${currentSong.source}-${currentSong.id || currentSong.mid}` : null;
    const prev = prevSongIdRef.current;
    prevSongIdRef.current = id;
    if (prev !== null && id !== prev) setCoverOpen(false);
  }, [currentSong, setCoverOpen]);

  useEffect(() => {
    const updateMax = async () => {
      if (window.electronAPI) {
        const max = await window.electronAPI.isMaximized();
        document.body.classList.toggle('maximized', max);
      }
    };
    updateMax();
    window.electronAPI?.onMaximize(() => document.body.classList.add('maximized'));
    window.electronAPI?.onUnmaximize(() => document.body.classList.remove('maximized'));
  }, []);

  return (
    <>
      {!entered && <LogoAnimation onEnter={() => setEntered(true)} />}

      <div className="w-full h-full flex flex-col relative overflow-hidden">
        {/* Grainient 流动背景 - 全屏 */}
        <div className="absolute inset-0 z-0">
          <Grainient
            color1="#ffffff" color2="#f5f5dc" color3="#766A5E"
            timeSpeed={0.25} warpStrength={1.0} warpFrequency={5.0} warpSpeed={2.0}
            warpAmplitude={50.0} rotationAmount={500.0} noiseScale={2.0} grainAmount={0.1}
            grainScale={2.0} contrast={1.5} gamma={1.0} saturation={1.0} zoom={0.9}
          />
        </div>

        <TitleBar />

        {/* 搜索框 - 常驻；封面升起时隐藏，避免浮在彩色背景之上 */}
        <div className={coverOpen ? 'hidden' : ''}>
          <SearchBar />
        </div>

        {/* 左上角 Logo — 点击返回主页；封面升起时隐藏 */}
        <button
          className={`absolute top-3 left-4 z-50 px-3 h-8 flex items-center justify-center rounded-lg bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors${coverOpen ? ' hidden' : ''}`}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={() => setCurrentView('home')}
          title="返回主页"
        >
          <span className="text-white text-sm font-bold tracking-wide">IvyM</span>
        </button>

        <div className="flex-1 overflow-y-auto z-10 px-6 pt-2">
          {currentView === 'search' && <Search />}
          {currentView === 'home' && <Home />}
          {/* 底部留白 — 播放器高86px+底边距12px，确保内容不被遮挡 */}
          <div className="h-28 shrink-0" />
        </div>

        {/* 返回顶部按钮 */}
        <BackToTop />

        {/* 播放控制栏 */}
        <Player />

        {/* ★ 沉浸封面背景 —— 曲线升起层（z-750，播放器保持在它之上） */}
        <CoverTransition />

        {/* ★ 右上角登录按钮 — 窗口控制已迁入 TitleBar（保留右上角登录入口） */}
        <div className="absolute top-4 right-4 z-50 flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="login-btn-wrapper" onMouseEnter={() => setShowDropdown(true)}>
            <button className="px-4 py-2 rounded-full bg-black/60 backdrop-blur-sm text-white text-xs font-medium hover:bg-black/80 transition-colors">
              登录
            </button>
            {showDropdown && <LoginDropdown onClose={() => setShowDropdown(false)} />}
          </div>
        </div>
      </div>
    </>
  );
}
