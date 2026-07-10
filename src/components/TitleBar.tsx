interface ScrollInfo {
  firstVisibleSong: { name: string; artists: string } | null;
}

interface TitleBarProps {
  scrollInfo?: ScrollInfo;
}

export function TitleBar({ scrollInfo }: TitleBarProps) {
  return (
    <div className="app-region-drag flex items-center h-12 px-4 bg-transparent shrink-0">
      <div className="app-region-no-drag flex items-center gap-3">
        <img src="/logo.png" alt="IvyM" className="w-7 h-7 rounded-lg object-cover" />
        <span className="text-sm font-bold text-text-primary tracking-wide">
          {scrollInfo?.firstVisibleSong ? `${scrollInfo.firstVisibleSong.name} - ${scrollInfo.firstVisibleSong.artists}` : 'IvyM'}
        </span>
      </div>
    </div>
  );
}
