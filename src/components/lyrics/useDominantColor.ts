import { useEffect, useState } from 'react'

export interface Palette {
  /** 主色 rgb(r,g,b) */
  primary: string
  /** 用于背景的深色（主色暗化 35%） */
  bgDark: string
  /** 亮度 Y（0-255） */
  luminance: number
  /** 是否深色背景 */
  isDark: boolean
  /** 主字色 */
  text: string
  /** 次字色（带透明度） */
  textDim: string
  /** 直接可用的 background 字符串（径向渐变，Apple Music 风） */
  background: string
}

const FALLBACK: Palette = {
  primary: 'rgb(60,60,60)',
  bgDark: 'rgb(30,30,30)',
  luminance: 60,
  isDark: true,
  text: '#ffffff',
  textDim: 'rgba(255,255,255,0.65)',
  background:
    'radial-gradient(120% 90% at 30% 20%, rgb(60,60,60) 0%, rgb(20,20,20) 60%, #0a0a0a 100%)',
}

function darken(r: number, g: number, b: number, ratio: number) {
  return {
    r: Math.max(0, Math.round(r * (1 - ratio))),
    g: Math.max(0, Math.round(g * (1 - ratio))),
    b: Math.max(0, Math.round(b * (1 - ratio))),
  }
}

/**
 * 提取封面平均主色（32x32 Canvas，过滤透明 / 纯白 / 纯黑，加权平均）
 */
export function useDominantColor(coverUrl?: string): Palette {
  const [palette, setPalette] = useState<Palette>(FALLBACK)

  useEffect(() => {
    if (!coverUrl) { setPalette(FALLBACK); return }

    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'no-referrer'
    img.src = coverUrl

    img.onload = () => {
      if (cancelled) return
      try {
        const S = 32
        const canvas = document.createElement('canvas')
        canvas.width = S; canvas.height = S
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(img, 0, 0, S, S)
        const { data } = ctx.getImageData(0, 0, S, S)

        let r = 0, g = 0, b = 0, count = 0
        for (let i = 0; i < data.length; i += 4) {
          const R = data[i], G = data[i + 1], B = data[i + 2], A = data[i + 3]
          if (A < 128) continue
          const brightness = (R + G + B) / 3
          if (brightness < 20 || brightness > 240) continue
          const max = Math.max(R, G, B), min = Math.min(R, G, B)
          if (max - min < 12 && brightness > 60 && brightness < 200) {
            r += R * 0.5; g += G * 0.5; b += B * 0.5; count += 0.5
            continue
          }
          r += R; g += G; b += B; count += 1
        }

        if (!count) { setPalette(FALLBACK); return }
        const Rr = Math.round(r / count)
        const Gg = Math.round(g / count)
        const Bb = Math.round(b / count)

        const Y = 0.299 * Rr + 0.587 * Gg + 0.114 * Bb
        const isDark = Y < 128
        const primary = `rgb(${Rr},${Gg},${Bb})`
        const dk = darken(Rr, Gg, Bb, 0.35)
        const dkStr = `rgb(${dk.r},${dk.g},${dk.b})`

        setPalette({
          primary,
          bgDark: dkStr,
          luminance: Y,
          isDark,
          text: isDark ? '#ffffff' : '#111111',
          textDim: isDark ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.55)',
          background: `radial-gradient(120% 90% at 30% 20%, ${primary} 0%, ${dkStr} 65%, ${dkStr} 100%)`,
        })
      } catch (e) {
        console.warn('[useDominantColor] extract failed:', e)
        setPalette(FALLBACK)
      }
    }
    img.onerror = () => setPalette(FALLBACK)
    return () => { cancelled = true }
  }, [coverUrl])

  return palette
}
