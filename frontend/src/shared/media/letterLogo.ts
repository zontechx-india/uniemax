/**
 * A simple square logo made from a shop's name — the first letter of its
 * first two words on a colour picked from the name. For sellers who have no
 * logo (most first-time shop owners): the platform needs one for every
 * store, so instead of blocking them we make a clean one they can replace
 * later from Store Details.
 */
const PALETTE = ['#7c3aed', '#db2777', '#ea580c', '#0891b2', '#059669', '#4f46e5', '#b45309', '#be123c']

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  // Array.from keeps a Devanagari/Tamil letter or emoji whole.
  const letters = words.slice(0, 2).map((w) => Array.from(w)[0] ?? '')
  return letters.join('').toUpperCase() || '?'
}

export function colourFor(name: string): string {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
  return PALETTE[hash % PALETTE.length]!
}

export function makeLetterLogo(name: string, size = 512): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Could not draw a logo on this device'))
  ctx.fillStyle = colourFor(name)
  ctx.fillRect(0, 0, size, size)
  const text = initialsOf(name)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${Math.round(size * (text.length > 1 ? 0.38 : 0.5))}px system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif`
  ctx.fillText(text, size / 2, size / 2 + size * 0.02)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not make a logo'))), 'image/png'),
  )
}
