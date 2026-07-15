import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { useLyricsStore } from '../../store/lyricsStore'
import { usePlayerStore } from '../../stores/playerStore'
import CurveTransition from './CurveTransition'
import { useDominantColor } from './useDominantColor'
import './lyrics-page.css'

interface LyricLine {
    time: number
    text: string
    tr?: string
}

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
    return [...a.entries()]
        .sort((x, y) => x[0] - y[0])
        .map(([time, text]) => ({ time, text, tr: b.get(time) }))
}

const DUMMY_LYRICS: LyricLine[] = [
    { time: 0, text: 'Bad luck to talk on these rides', tr: '路上的对话不尽人意' },
    { time: 4, text: 'Mind on the road, your dilated eyes', tr: '思绪在路上，你瞳孔放大的眼' },
    { time: 8, text: "We'll let you guide us", tr: '我们让你引导我们' },
    { time: 12, text: "I'm sure to spoil you", tr: '我一定会宠坏你' },
]

const LyricsPage = () => {
    const visible = useLyricsStore((s) => s.visible)
    const close = useLyricsStore((s) => s.close)

    const currentSong = usePlayerStore((s) => s.currentSong)
    const currentTime = usePlayerStore((s) => s.currentTime)
    const duration = usePlayerStore((s) => s.duration)
    const playerHidden = usePlayerStore((s) => s.playerHidden)

    const lyric = (usePlayerStore as any)((s: any) => s.lyric) as string | undefined
    const tlyric = (usePlayerStore as any)((s: any) => s.tlyric) as string | undefined

    const cover = currentSong?.cover
    const palette = useDominantColor(cover)

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

    const [mounted, setMounted] = useState(false)
    const [curveDone, setCurveDone] = useState(false)
    const contentRef = useRef<HTMLDivElement>(null)
    const lineRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (visible) {
            setMounted(true)
            setCurveDone(false)
        }
    }, [visible])

    useEffect(() => {
        if (!contentRef.current) return
        if (visible) {
            gsap.set(contentRef.current, { opacity: 0, y: 24 })
            gsap.to(contentRef.current, {
                opacity: 1,
                y: 0,
                duration: 0.55,
                delay: 0.75,
                ease: 'power2.out',
                onStart: () => setCurveDone(true),
            })
        } else {
            gsap.to(contentRef.current, {
                opacity: 0, y: 12, duration: 0.32, ease: 'power2.in',
                onComplete: () => setCurveDone(false),
            })
        }
    }, [visible, mounted])

    useEffect(() => {
        if (!lineRef.current) return
        gsap.fromTo(lineRef.current,
            { opacity: 0, y: 14, filter: 'blur(6px)' },
            { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.5, ease: 'power2.out' })
    }, [activeIdx])

    useEffect(() => {
        if (!visible) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [visible, close])

    if (!mounted) return null

    const title = currentSong?.name || '未选择歌曲'
    const artist = currentSong?.artists || '未知艺术家'
    const album = (currentSong as any)?.album || (currentSong as any)?.albumName || ''

    const extras: Array<{ label: string; value: string }> = []
    const pushIf = (label: string, v?: string) => { if (v && v.trim()) extras.push({ label, value: v }) }
    pushIf('Produced by', (currentSong as any)?.producer)
    pushIf('Lyrics by', (currentSong as any)?.lyricist)
    pushIf('Composer', (currentSong as any)?.composer)
    pushIf('Written by', (currentSong as any)?.writer)
    pushIf('Visual Design', (currentSong as any)?.visualDesign)

    const progressPct = duration && duration > 0
        ? Math.min((currentTime / duration) * 100, 100)
        : 0

    return (
        <div
            className={`lyrics-page ${visible ? 'is-open' : 'is-closing'} ${curveDone ? 'curve-done' : ''}`}
            style={{ color: palette.text }}
        >
            {/* ★ 顶部拖动条——让 Electron 能拖动窗口 */}
            <div className="lyrics-drag-strip" aria-hidden />

            {/* ★ Curve = 唯一背景 + 揭幕动画 */}
            <CurveTransition
                active={visible}
                color={palette.bgDark}
                onClosed={() => setMounted(false)}
            />

            <div ref={contentRef} className="lyrics-content" style={{ color: palette.text }}>
                <section className="lyrics-left">
                    <div ref={lineRef} className="lyrics-single">
                        <div className="lyric-en" style={{ color: palette.text }}>{curr?.text || ' '}</div>
                        {curr?.tr && <div className="lyric-cn" style={{ color: palette.text }}>{curr.tr}</div>}
                        {/* ★ 已删除 (Verse I) 提示 */}
                    </div>
                </section>

                <section className="lyrics-right">
                    <div className="lyrics-right-inner">
                        <div className="song-head">
                            <div className="song-title" style={{ color: palette.text }}>
                                <span className="song-title-dot">♪</span> {title}
                            </div>
                            <div className="song-artist" style={{ color: palette.text }}>{artist}</div>
                            {album && <div className="song-album" style={{ color: palette.text }}>{album}</div>}
                        </div>

                        {cover && <img className="lyrics-cover" src={cover} alt="" draggable={false} />}

                        {extras.length > 0 && (
                            <div className="song-extra">
                                {extras.map((e) => (
                                    <div key={e.label} className="extra-block">
                                        <div className="extra-label" style={{ color: palette.textDim }}>{e.label}</div>
                                        <div className="extra-value" style={{ color: palette.text }}>{e.value}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ★ 已删除 * 歌词页（演示）标签 */}
                    </div>
                </section>
            </div>

            {/* ★ 底部迷你进度条——仅播放器隐藏时显示；颜色随字色变化 */}
            {playerHidden && (
                <div
                    className="lyrics-mini-progress"
                    style={{ width: `${progressPct}%`, background: palette.text }}
                />
            )}
        </div>
    )
}

export default LyricsPage
