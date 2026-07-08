import { useState, useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { WindowControls } from './components/WindowControls';
import { LogoAnimation } from './components/splash/LogoAnimation';
import Grainient from './components/grainient/Grainient';
import { LoginModal } from './components/login-modal/LoginModal';

export default function App() {
  const [entered, setEntered] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

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

        <div className="flex-1 overflow-y-auto z-10">
          {/* 主内容 */}
        </div>

        {/* 底部控制条 - 登录 + 窗口控制 */}
        <div className="absolute bottom-4 right-4 z-50 flex items-center gap-3">
          <button
            className="px-4 py-2 rounded-full bg-black/60 backdrop-blur-sm text-white text-xs font-medium hover:bg-black/80 transition-colors"
            onClick={() => setShowLogin(true)}
          >
            登录
          </button>
          <WindowControls />
        </div>

        <LoginModal visible={showLogin} onClose={() => setShowLogin(false)} />
      </div>
    </>
  );
}
