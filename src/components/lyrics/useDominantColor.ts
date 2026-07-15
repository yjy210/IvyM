import { useEffect, useState } from 'react'

export interface Palette {
  background: string  // 完整 CSS 背景值
  text: string        // '#fff' 或 '#111'
}

export function useDominantColor(coverUrl?: string): Palette {
  const [palette, setPalette] = useState<Palette>({
    background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a2e 100%)',
    text: '#ffffff',
  })

  useEffect(() => {
    if (!coverUrl) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => extract(img).then(setPalette)
    img.onerror = () => {}
    img.src = coverUrl
  }, [coverUrl])

  return palette
}

async function extract(img: HTMLImageElement): Promise<Palette> {
  try {
    const SIZE = 32
    const canvas = document.createElement('canvas')
    canvas.width = SIZE; canvas.height = SIZE
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(img, 0, 0, SIZE, SIZE)
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE)

    // 量化桶
    const buckets = new Map<string, { r: number; g: number; b: number; n: number }>()
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
      if (a < 200) continue

      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      const diff = max - min

      // 过滤纯黑/纯白
      if (max < 18) continue                  // 近黑
      if (min > 235 && diff < 8) continue     // 近白

      const key = `${r >> 4}-${g >> 4}-${b >> 4}`
      const ex = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 }
      ex.r += r; ex.g += g; ex.b += b; ex.n += 1
      buckets.set(key, ex)
    }

    // 评分候选
    const candidates = [...buckets.values()].map(v => {
      const r = v.r / v.n, g = v.g / v.n, b = v.b / v.n
      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      const sat = max === 0 ? 0 : (max - min) / max
      // 过滤低饱和灰
      if (sat < 0.12 && lum < 60) return null
      if (sat < 0.08) return null
      // 亮度惩罚：过亮/过暗降权
      const lumScore = lum > 200 ? 0.3 : lum < 30 ? 0.4 : 1
      return { r, g, b, n: v.n, sat, lum, score: v.n * (0.5 + sat) * lumScore }
    }).filter(Boolean).sort((a, b) => b!.score - a!.score) as { r: number; g: number; b: number; n: number; sat: number; lum: number; score: number }[]

    if (!candidates.length) {
      return { background: 'linear-gradient(180deg, #0d0d0d 0%, #1a1a2e 100%)', text: '#ffffff' }
    }

    // 找主色（评分最高）
    const primary = candidates[0]
    // 找辅助色：与 primary 不同的次高评分
    let secondary = candidates.find(c => colorDist(primary, c) > 25) || candidates[1]
    if (!secondary) secondary = primary

    // 生成 Apple Music 风渐变
    const bg1 = `rgb(${primary.r|0}, ${primary.g|0}, ${primary.b|0})`
    const bg2 = `rgb(${Math.max(0, primary.r - 30)|0}, ${Math.max(0, primary.g - 30)|0}, ${Math.max(0, primary.b + 20)|0})`
    const bg3 = `rgb(${secondary.r|0}, ${secondary.g|0}, ${secondary.b|0})`

    const brightness = (primary.lum + (secondary?.lum ?? primary.lum)) / 2
    const text = brightness > 110 ? '#111111' : '#ffffff'

    return {
      background: `
        radial-gradient(130% 90% at 20% 10%, ${bg1} 0%, transparent 55%),
        radial-gradient(120% 80% at 75% 90%, ${bg3} 0%, transparent 55%),
        radial-gradient(100% 110% at 50% 50%, ${bg2}dd 0%, #06060a 100%)
      `,
      text,
    }
  } catch {
    return { background: 'linear-gradient(180deg, #1a1a2e 0%, #0d0d0d 100%)', text: '#ffffff' }
  }
}

function colorDist(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)
}
