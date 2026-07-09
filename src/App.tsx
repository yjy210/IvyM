import { useState, useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { WindowControls } from './components/WindowControls';
import { LogoAnimation } from './components/splash/LogoAnimation';
import Grainient from './components/grainient/Grainient';
import LoginDropdown from './components/login-dropdown/LoginDropdown';
import SearchBar from './components/search/SearchBar';
import Player from './components/player/Player';
import Search from './pages/Search';
import BackToTop from './components/BackToTop';
import { usePlayerStore } from './stores/playerStore';
import { Home } from './pages/Home';
import './components/login-dropdown/login-dropdown.css';
import './components/search/search-bar.css';
import './components/player/player.css';
import './components/back-to-top.css';
import './pages/search-page.css';

export default function App() {
  const [entered, setEntered] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const currentView = usePlayerStore(s => s.currentView);
  const setCurrentView = usePlayerStore(s => s.setCurrentView);

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

        {/* 搜索框 - 顶部居中 GSAP 动画 */}
        <SearchBar />

        {/* 左上角 Logo — 点击返回主页 */}
        <button
          className="absolute top-3 left-4 z-50 px-3 h-8 flex items-center justify-center rounded-lg bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors"
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

        {/* 右上角控制 - 登录 + 窗口控制 */}
        <div className="absolute top-4 right-4 z-50 flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="login-btn-wrapper" onMouseEnter={() => setShowDropdown(true)}>
            <button className="px-4 py-2 rounded-full bg-black/60 backdrop-blur-sm text-white text-xs font-medium hover:bg-black/80 transition-colors">
              登录
            </button>
            {showDropdown && <LoginDropdown onClose={() => setShowDropdown(false)} />}
          </div>
          <WindowControls />
        </div>
      </div>
    </>
  );
}
