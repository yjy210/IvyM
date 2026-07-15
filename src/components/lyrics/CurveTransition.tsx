import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin'

gsap.registerPlugin(MorphSVGPlugin)

interface Props {
  active: boolean
  color?: string
  onOpened?: () => void
  onClosed?: () => void
}

/**
 * Curve Swipe — 单 timeline + play()/reverse() 切换
 *  - MID → FULL (打开) / FULL → MID (关闭)
 *  - 空依赖创建, ref 持有回调避免重建
 */
const CurveTransition = ({ active, color = '#000', onOpened, onClosed }: Props) => {
  const pathRef = useRef<SVGPathElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tlRef = useRef<gsap.core.Timeline | null>(null)

  // ★ ref 持有最新回调, 避免 useEffect 因依赖变化重建 timeline
  const onOpenedRef = useRef(onOpened)
  const onClosedRef = useRef(onClosed)
  useEffect(() => { onOpenedRef.current = onOpened }, [onOpened])
  useEffect(() => { onClosedRef.current = onClosed }, [onClosed])

  const REST = 'M 0 100 V 100 Q 50 100 100 100 V 100 z'
  const MID  = 'M 0 100 V 50  Q 50 0   100 50  V 100 z'
  const FULL = 'M 0 100 V 0   Q 50 0   100 0   V 100 z'

  // ★ 只初始化一次 (空依赖)
  useEffect(() => {
    if (!pathRef.current) return
    tlRef.current = gsap
      .timeline({
        paused: true,
        onComplete: () => onOpenedRef.current?.(),
        onReverseComplete: () => onClosedRef.current?.(),
      })
      .to(pathRef.current, { duration: 0.42, morphSVG: MID, ease: 'power2.in' })
      .to(pathRef.current, { duration: 0.35, morphSVG: FULL, ease: 'power2.out' }, '>-0.05')
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
