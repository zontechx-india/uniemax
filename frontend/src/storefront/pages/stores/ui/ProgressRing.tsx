/**
 * "3 of 5" as a ring that fills with the brand as setup completes, and turns
 * green when it is all done. A shape a seller reads at a glance, before any
 * text — used on the My shops cards and the Dashboard's setup checklist.
 *
 * `label` writes "3/5" in the middle (for the larger sizes); the visible text
 * beside it should still say it in words, so the ring itself is decorative.
 */
export function ProgressRing({
  done,
  total,
  size = 40,
  label = false,
}: {
  done: number
  total: number
  size?: number
  label?: boolean
}) {
  const r = 16
  const c = 2 * Math.PI * r
  const ratio = total === 0 ? 0 : Math.min(done / total, 1)
  return (
    <span
      aria-hidden
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-fg/10" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          className={`transition-[stroke-dashoffset] duration-500 ${
            ratio === 1 ? 'stroke-success' : 'stroke-brand'
          }`}
        />
      </svg>
      {label && (
        <span className="relative text-xs font-bold text-fg">
          {done}/{total}
        </span>
      )}
    </span>
  )
}
