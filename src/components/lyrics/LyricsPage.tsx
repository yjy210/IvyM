import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { useLyricsStore } from '../../store/lyricsStore'
import { usePlayerStore } from '../../stores/playerStore'
import CurveTransition from './CurveTransition'
import { useDominantColor } from './useDominantColor'
import './lyrics-page.css'

interface LyricLine { time: number; text: string; tr?: string }

/** 极简 LRC 解析 */
function parseLrc(lrc?: string, tlrc?: string): LyricLine[] {
  if (!lrc) return []
  const parse = (raw: string) => {
    const out = new Map<number, string>()
    raw.split(/\r?\n/).forEach((line) => {
      const times = [...line.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)]
      const text = line.replace(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g, '').trim()
      if (!text || !times.length) return
      times.forEach((m) => {
        const min = +m[1], sec = +m[2]
        const rawMs = m[3] || '0'
        const ms = +rawMs / Math.pow(10, rawMs.length)
        const t = +(min * 60 + sec + ms).toFixed(3)
        out.set(t, text)
      })
    })
    return out
  }
  const a = parse(lrc)
  const b = tlrc ? parse(tlrc) : new Map<number, string>()
  return [...a.entries()].sort((x, y) => x[0] - y[0]).map(([time, text]) => ({ time, text, tr: b.get(time) }))
}

const DUMMY_LYRICS: LyricLine[] = [
  { time: 0,  text: 'Bad luck to talk on these rides', tr: '路上的对话不尽人意' },
  { time: 4,  text: 'Mind on the road, your dilated eyes', tr: '思绪在路上，你瞳孔放大的眼' },
  { time: 8,  text: "We'll let you guide us", tr: '我们让你引导我们' },
  { time: 12, text: "I'm sure to spoil you", tr: '我一定会宠坏你' },
]

const LyricsPage = () => {
  const visible = useLyricsStore((s) => s.visible)
  const close   = useLyricsStore((s) => s.close)

  const currentSong = usePlayerStore((s) => s.currentSong)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const lyric  = (usePlayerStore as any)?.getState?.().lyric  as string | undefined
  const tlyric = (usePlayerStore as any)?.getState?.().tlyric as string | undefined

  const cover  = currentSong?.cover
  const palette = useDominantColor(cover)

  const [mounted, setMounted] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const lineRef   = useRef<HTMLDivElement>(null)

  const lines = useMemo(() => {
    const parsed = parseLrc(lyric, tlyric)
    return parsed.length ? parsed : DUMMY_LYRICS
  }, [lyric, tlyric])

  const activeIdx = useMemo(() => {
    if (!lines.length) return 0
    let idx = 0
    for (let i = 0; i < lines.length; i++) {
      if (currentTime >= lines[i].time) idx = i
      else break
    }
    return idx
  }, [lines, currentTime])

  const curr = lines[activeIdx] || lines[0]

  // ★ 用 ref 持有最新回调, 避免 timeline 重建
  const onOpenedRef = useRef<() => void>()
  const onClosedRef = useRef<() => void>()
  onOpenedRef.current = () => setRevealed(true)
  onClosedRef.current = () => { setRevealed(false); setMounted(false) }

  useEffect(() => { if (visible) { setRevealed(false); setMounted(true) } }, [visible])

  // 内容淡入/淡出
  useEffect(() => {
    if (!mounted) return
    if (contentRef.current) {
      if (revealed) {
        gsap.fromTo(contentRef.current, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' })
      } else {
        gsap.to(contentRef.current, { opacity: 0, duration: 0.2 })
      }
    }
    if (lineRef.current) {
      gsap.fromTo(lineRef.current,
        { opacity: 0, y: 14, filter: 'blur(6px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.45, ease: 'power2.out' })
    }
  }, [revealed, mounted, activeIdx])

  if (!mounted) return null

  const title  = currentSong?.name || 'White Ferrari'
  const artist = currentSong?.artists || 'Frank Ocean'
  const album  = (currentSong as any)?.album || (currentSong as any)?.albumName || 'Blonde (2016)'

  const extras: Array<{ label: string; value: string }> = []
  const pushIf = (label: string, v?: string) => { if (v && v.trim()) extras.push({ label, value: v }) }
  pushIf('Produced by',  (currentSong as any)?.producer)
  pushIf('Lyrics by',    (currentSong as any)?.lyricist)
  pushIf('Composer',     (currentSong as any)?.composer)
  pushIf('Written by',   (currentSong as any)?.writer)
  pushIf('Visual Design',(currentSong as any)?.visualDesign)

  return (
    <div className="lyrics-page" style={{ color: palette.text }}>
      {/* 背景: Curve 完全打开后才显示 */}
      <div className={`lyrics-bg ${revealed ? 'show' : ''}`} style={{ background: palette.background }} />

      {/* Curve Swipe 揭幕层 */}
      <CurveTransition active={visible && !closing} color={palette.bgDark} />

      {/* 内容层 */}
      <div ref={contentRef} className="lyrics-content" style={{ opacity: 0 }}>
        <button className="lyrics-close" onClick={() => { setRevealed(false); close() }} aria-label="关闭" style={{ color: palette.text }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        <section className="lyrics-left">
          <div ref={lineRef} className="lyrics-single">
            <div className="lyric-en">{curr?.text || ' '}</div>
            {curr?.tr && <div className="lyric-cn">{curr.tr}</div>}
            <div className="lyric-verse" style={{ color: palette.textDim }}>(Verse I)</div>
          </div>
        </section>

        <section className="lyrics-right">
          <div className="lyrics-right-inner">
            <div className="song-head">
              <div className="song-title"><span className="song-title-dot">♪</span> {title}</div>
              <div className="song-artist">{artist}</div>
              <div className="song-album">{album}</div>
            </div>
            {cover && <img className="lyrics-cover" src={cover} alt="" draggable={false} />}
            {extras.length > 0 && (
              <div className="song-extra">
                {extras.map((e) => (
                  <div key={e.label} className="extra-block">
                    <div className="extra-label" style={{ color: palette.textDim }}>{e.label}</div>
                    <div className="extra-value">{e.value}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="song-label" style={{ color: palette.textDim }}>* 歌词演示 (Label)</div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default LyricsPage
