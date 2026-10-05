// UI guard for docs/DESIGN_GUIDELINES.md.
//
// Counts the patterns the guidelines forbid (or that the design system
// replaces) across src/, and FAILS when any count rises above the budget in
// ui-budget.json. Existing debt is allowed while the phased clean-up removes
// it; new code cannot add more. After a phase lowers a count, run
// `npm run check:ui -- --update` to tighten the budget.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, '..', 'src')
const budgetFile = join(here, 'ui-budget.json')

const RULES = {
  // §4 — sizes outside the 7-step scale (use text-caption … text-display).
  arbitraryTextSize: /\btext-\[\d+(?:\.\d+)?px\]/g,
  // §4/§17 — anything under the 13px floor.
  tinyText: /\btext-\[(?:[0-9]|1[0-2])(?:\.\d+)?px\]/g,
  // §6 — gradients and glass/glow effects.
  gradients: /\bbg-gradient-to-\w+|\bbg-brand-gradient\b|linear-gradient\(|radial-gradient\(/g,
  glass: /\b(?:glass(?:-tint|-strong|-card|-inset)?|seller-canvas)\b/g,
  // §10 — one-off shadows and the old metal effects.
  adHocEffects: /\bshadow-\[|\bmetal-(?:lift|chip|text)\b|\bbackdrop-blur\b/g,
  // §7/§9 — hand-made buttons instead of shared/ui/Button.
  rawButtons: /<button\b/g,
}

const files = []
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.tsx?$/.test(e.name) && !e.name.startsWith('zz-')) files.push(p)
  }
}
walk(src)

const counts = Object.fromEntries(Object.keys(RULES).map((k) => [k, 0]))
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  for (const [k, re] of Object.entries(RULES)) counts[k] += (text.match(re) ?? []).length
}

if (process.argv.includes('--update')) {
  writeFileSync(budgetFile, JSON.stringify(counts, null, 2) + '\n')
  console.log('UI budget updated:', counts)
  process.exit(0)
}

const budget = JSON.parse(readFileSync(budgetFile, 'utf8'))
let failed = false
for (const [k, n] of Object.entries(counts)) {
  const max = budget[k] ?? 0
  const mark = n > max ? 'OVER' : n < max ? 'down' : 'ok'
  if (n > max) failed = true
  console.log(`${mark.padEnd(4)}  ${k.padEnd(18)} ${String(n).padStart(4)} / ${max}`)
}
if (failed) {
  console.error('\nUI check failed: new code added patterns the design guidelines forbid (docs/DESIGN_GUIDELINES.md).')
  process.exit(1)
}
