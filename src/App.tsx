import { useState, useEffect } from 'react';
import { WindowControls } from './components/WindowControls';
import { LogoAnimation } from './components/splash/LogoAnimation';
import Grainient from './components/grainient/Grainient';

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

      <div className="w-full h-full flex flex-col" style={{ background: '#F5F5DC' }}>
        {/* Grainient 流动背景 */}
        <div className="app-bg">
          <Grainient
            color1="#ffffff" color2="#f5f5dc" color3="#766A5E"
            timeSpeed={0.25} warpStrength={1.0} warpFrequency={5.0} warpSpeed={2.0}
            warpAmplitude={50.0} rotationAmount={500.0} noiseScale={2.0} grainAmount={0.1}
            grainScale={2.0} contrast={1.5} gamma={1.0} saturation={1.0} zoom={0.9}
          />
        </div>

        <div className="absolute top-3 right-3 z-50">
          <WindowControls />
        </div>

        <div className="flex-1 overflow-y-auto z-10">
          {/* router placeholder */}
        </div>
      </div>
    </>
  );
}
