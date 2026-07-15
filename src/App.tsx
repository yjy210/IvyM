import { useState, useEffect, useRef } from 'react';
import { TitleBar } from './components/TitleBar';
import { LogoAnimation } from './components/splash/LogoAnimation';
import Grainient from './components/grainient/Grainient';
import LoginDropdown from './components/login-dropdown/LoginDropdown';
import SearchBar from './components/search/SearchBar';
import Player from './components/player/Player';
import LyricsPage from './components/lyrics/LyricsPage';
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

  useCoverColor();
  const setCoverOpen = usePlayerStore(s => s.setCoverOpen);
  const coverOpen = usePlayerStore(s => s.coverOpen);
  const currentSong = usePlayerStore(s => s.currentSong);
  const prevSongIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = currentSong ? `${currentSong.source}-${currentSong.id || (currentSong as any).mid}` : null;
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

  useEffect(() => {
    const shield = document.getElementById('boot-shield');
    if (!shield) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        shield.classList.add('fade-out');
        setTimeout(() => shield.remove(), 600);
      });
    });
  }, []);

  return (
    <>
      {!entered && <LogoAnimation onEnter={() => setEntered(true)} />}

      <div
        className="w-full h-full flex flex-col relative overflow-hidden"
        style={{ visibility: entered ? 'visible' : 'hidden' }}
        aria-hidden={!entered}
      >
        <div className="absolute inset-0 z-0">
          <Grainient
            color1="#ffffff" color2="#f5f5dc" color3="#766A5E"
            timeSpeed={0.25} warpStrength={1.0} warpFrequency={5.0} warpSpeed={2.0}
            warpAmplitude={50.0} rotationAmount={500.0} noiseScale={2.0} grainAmount={0.1}
            grainScale={2.0} contrast={1.5} gamma={1.0} saturation={1.0} zoom={0.9}
          />
        </div>

        {/* ★ TitleBar 里已包含 IvyM 胶囊 —— 不再在 App 中重复渲染 */}
        <TitleBar />

        <div className={coverOpen ? 'hidden' : ''}>
          <SearchBar />
        </div>

        {/* ★ 主内容区 —— 唯一滚动容器 */}
        <div
          className="flex-1 overflow-y-auto z-10 px-6"
          style={{ paddingTop: 8, paddingBottom: 24 }}
        >
          {currentView === 'search' && <Search />}
          {currentView === 'home' && <Home />}
          <div className="h-24 shrink-0" aria-hidden />
        </div>

        <BackToTop />

        <Player />

        <CoverTransition />

        <LyricsPage />

        <div
          className="absolute top-1.5 right-4 z-50 flex items-center gap-3"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="login-btn-wrapper" onMouseEnter={() => setShowDropdown(true)}>
            <button className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-xs font-medium hover:bg-black/80 transition-colors">
              登录
            </button>
            {showDropdown && <LoginDropdown onClose={() => setShowDropdown(false)} />}
          </div>
        </div>
      </div>
    </>
  );
}
