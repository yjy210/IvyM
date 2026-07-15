import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin'

gsap.registerPlugin(MorphSVGPlugin)

interface Props {
  active: boolean
  color?: string
  onClosed?: () => void
}

/**
 * Curve Swipe — 歌词页背景揭幕动画
 *  - REST(底线) → MID(弧拱) → FULL(全屏) — 让页面从底部升起
 *  - 反向 FULL→MID→REST = 收回
 */
const CurveTransition = ({ active, color = '#000', onClosed }: Props) => {
  const pathRef = useRef<SVGPathElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tlRef = useRef<gsap.core.Timeline | null>(null)
  const onClosedRef = useRef(onClosed)
  useEffect(() => { onClosedRef.current = onClosed }, [onClosed])

  const REST = 'M 0 100 V 100 Q 50 100 100 100 V 100 z'
  const MID  = 'M 0 100 V 50  Q 50 0   100 50  V 100 z'
  const FULL = 'M 0 100 V 0   Q 50 0   100 0   V 100 z'

  // ★ 只初始化一次 (空依赖)
  useEffect(() => {
    if (!pathRef.current || !svgRef.current) return
    tlRef.current = gsap
      .timeline({
        paused: true,
        onReverseComplete: () => onClosedRef.current?.(),
      })
      .to(pathRef.current, { duration: 0.65, morphSVG: MID, ease: 'power2.in' })
      .to(pathRef.current, { duration: 0.65, morphSVG: FULL, ease: 'power3.out' })
    return () => { tlRef.current?.kill(); tlRef.current = null }
  }, [])

  useEffect(() => {
    const tl = tlRef.current
    if (!tl) return
    if (active) tl.play()
    else tl.reverse()
  }, [active])

  return (
    <svg
      ref={svgRef}
      className="lyrics-curve"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMin slice"
      aria-hidden
    >
      <path ref={pathRef} d={REST} fill={color} />
    </svg>
  )
}

export default CurveTransition
