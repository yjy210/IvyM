import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin'

gsap.registerPlugin(MorphSVGPlugin)

interface Props {
  active: boolean
  onClosed?: () => void
}

const CurveTransition = ({ active, onClosed }: Props) => {
  const pathRef = useRef<SVGPathElement>(null)
  const tlRef = useRef<gsap.core.Timeline | null>(null)

  const REST = 'M 0 100 V 100 Q 50 100 100 100 V 100 z'
  const MID  = 'M 0 100 V 50  Q 50 0   100 50  V 100 z'
  const FULL = 'M 0 100 V 0   Q 50 0   100 0   V 100 z'

  useEffect(() => {
    if (!pathRef.current) return
    gsap.set(pathRef.current, { attr: { d: REST } })
    const tl = gsap.timeline({
      paused: true,
      onReverseComplete: () => onClosed?.(),
    })
      .to(pathRef.current, { duration: 0.45, morphSVG: MID, ease: 'power2.in' })
      .to(pathRef.current, { duration: 0.5, morphSVG: FULL, ease: 'power2.out' })
    tlRef.current = tl
    return () => { tl.kill(); tlRef.current = null }
  }, [])

  useEffect(() => {
    const tl = tlRef.current
    if (!tl) return
    if (active) tl.play()
    else tl.reverse()
  }, [active])

  return (
    <svg className="lyrics-curve" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <path ref={pathRef} d={REST} fill="rgba(255,255,255,0.08)" />
    </svg>
  )
}

export default CurveTransition
