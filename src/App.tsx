import { useState, useEffect } from 'react';
import { PlayerBar } from './components/PlayerBar';
import { WindowControls } from './components/WindowControls';
import { LogoAnimation } from './components/splash/LogoAnimation';

export default function App() {
  const [entered, setEntered] = useState(false);

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
      {/* 开场动画 — 用户点击后才进入主界面 */}
      {!entered && <LogoAnimation onEnter={() => setEntered(true)} />}

      <div className="w-full h-full flex flex-col bg-[#F5F5DC]">
        <div className="absolute top-3 right-3 z-50">
          <WindowControls />
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* router placeholder */}
        </div>

        <PlayerBar />
      </div>
    </>
  );
}
