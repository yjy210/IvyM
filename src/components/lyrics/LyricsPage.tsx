import { useEffect, useMemo, useRef, useState } from 'react'
import { useLyricsStore } from '../../store/lyricsStore'
import { usePlayerStore } from '../../stores/playerStore'
import CurveTransition from './CurveTransition'
import { useDominantColor } from './useDominantColor'
import './lyrics-page.css'

const DUMMY_LYRICS = [
  { time: 0,  text: '第一行歌词（静态演示）' },
  { time: 2,  text: '第二行歌词' },
  { time: 4,  text: '第三行歌词' },
  { time: 6,  text: '第四行歌词' },
  { time: 8,  text: '第五行歌词' },
  { time: 10, text: '最后一行歌词' },
]

const LyricsPage = () => {
  const visible = useLyricsStore((s) => s.visible)
  const close   = useLyricsStore((s) => s.close)
  const currentSong = usePlayerStore((s) => s.currentSong)
  const currentTime = usePlayerStore((s) => s.currentTime)

  const [mounted, setMounted] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const cover = currentSong?.cover
  const palette = useDominantColor(cover)

  const activeIdx = useMemo(() => {
    if (!DUMMY_LYRICS.length) return -1
    let idx = 0
    for (let i = 0; i < DUMMY_LYRICS.length; i++) {
      if (currentTime >= DUMMY_LYRICS[i].time) idx = i
      else break
    }
    return idx
  }, [currentTime])

  const prev = activeIdx > 0 ? DUMMY_LYRICS[activeIdx - 1] : undefined
  const curr = activeIdx >= 0 ? DUMMY_LYRICS[activeIdx] : undefined
  const next = activeIdx < DUMMY_LYRICS.length - 1 ? DUMMY_LYRICS[activeIdx + 1] : undefined

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, close])

  useEffect(() => { if (visible) setMounted(true) }, [visible])
  if (!mounted) return null

  const title  = currentSong?.name || '未知歌曲'
  const artist = currentSong?.artists || '未知艺术家'

  return (
    <div className={`lyrics-page ${visible ? 'is-open' : 'is-closing'}`}>
      {/* ★ 专辑主色渐变背景（Apple Music / Spotify 风格） */}
      <div className="lyrics-bg" style={{ background: palette.background }} />

      {/* Curve Swipe 转场动画 */}
      <CurveTransition
        active={visible}
        onClosed={() => setMounted(false)}
      />

      <div ref={contentRef} className="lyrics-content" style={{ color: palette.text }}>
        <button className="lyrics-close" onClick={close} aria-label="关闭">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <section className="lyrics-left">
          {DUMMY_LYRICS.length === 0 ? (
            <div className="lyrics-empty">暂无歌词</div>
          ) : (
            <div className="lyrics-triplet">
              <div className="line prev"><div className="l1">{prev?.text || ' '}</div></div>
              <div className="line current"><div className="l1">{curr?.text || ' '}</div></div>
              <div className="line next"><div className="l1">{next?.text || ' '}</div></div>
            </div>
          )}
        </section>

        <section className="lyrics-right">
          {cover && <img className="lyrics-cover" src={cover} alt="" draggable={false} />}
          <div className="meta-title">{title}</div>
          <div className="meta-artist">{artist}</div>
        </section>
      </div>
    </div>
  )
}

export default LyricsPage
