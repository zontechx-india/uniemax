/**
 * Generates the install (PWA / home-screen) icons from `public/app_logo.png`.
 *
 *   node frontend/scripts/make-app-icons.mjs
 *
 * Prod icons: the bag mark on white. Dev icons: the same plus a badge
 * ("DEV" for the storefront, "A-DEV" for the admin console) so a phone with
 * both dev and prod installed can tell them apart. Which set a page uses is
 * decided at runtime by the host check in `index.html` / `admin.html`.
 */
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '../public')
const LOGO = resolve(PUBLIC, 'app_logo.png')
const BG = '#ffffff'

const BADGES = {
  dev: { text: 'DEV', fill: '#EA580C' },
  'admin-dev': { text: 'A-DEV', fill: '#0F766E' },
}

/** A pill with white text, drawn as SVG at the 512 design size. */
function badgeSvg({ text, fill }) {
  const h = 104
  const w = 84 + text.length * 62
  const x = (512 - w) / 2
  const y = 512 - h - 30
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"
        fill="${fill}" stroke="#ffffff" stroke-width="8"/>
  <text x="256" y="${y + h / 2 + 25}" text-anchor="middle"
        font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900"
        font-size="70" fill="#ffffff">${text}</text>
</svg>`)
}

/** The 512 "any" design: bag on white, optional badge over its base. */
async function design(badge) {
  const bagH = badge ? 380 : 420
  const bag = await sharp(LOGO).resize({ height: bagH }).toBuffer()
  const top = badge ? 40 : (512 - bagH) / 2
  const meta = await sharp(bag).metadata()
  const layers = [{ input: bag, top: Math.round(top), left: Math.round((512 - meta.width) / 2) }]
  if (badge) layers.push({ input: badgeSvg(badge), top: 0, left: 0 })
  return sharp({ create: { width: 512, height: 512, channels: 3, background: BG } })
    .composite(layers)
    .png()
    .toBuffer()
}

/** Maskable: the whole design shrunk to 72% so Android's circle crop keeps it. */
async function maskable(any) {
  const inner = await sharp(any).resize(368).toBuffer()
  return sharp({ create: { width: 512, height: 512, channels: 3, background: BG } })
    .composite([{ input: inner, top: 72, left: 72 }])
    .png()
    .toBuffer()
}

async function writeSet(prefix, badge) {
  const any = await design(badge)
  const out = (name) => resolve(PUBLIC, name)
  await sharp(any).png({ compressionLevel: 9 }).toFile(out(`${prefix}-512.png`))
  await sharp(any).resize(192).png({ compressionLevel: 9 }).toFile(out(`${prefix}-192.png`))
  await sharp(await maskable(any)).png({ compressionLevel: 9 }).toFile(out(`${prefix}-maskable-512.png`))
  const touch = prefix === 'pwa' ? 'apple-touch-icon.png' : `apple-touch-icon-${prefix.slice(4)}.png`
  await sharp(any).resize(180).png({ compressionLevel: 9 }).toFile(out(touch))
}

await writeSet('pwa', null)
await writeSet('pwa-dev', BADGES.dev)
await writeSet('pwa-admin-dev', BADGES['admin-dev'])
console.log('icons written to', PUBLIC)
