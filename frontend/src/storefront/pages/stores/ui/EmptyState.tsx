import type { ComponentType, ReactNode } from 'react'

/**
 * What a seller sees where a list will be — no products yet, no orders yet.
 *
 * An empty screen is the moment a new seller is most likely to give up, so
 * it always says what goes here, in one sentence, and offers the ONE action
 * that fills it. Optional `steps` show the road ahead as numbered pictures
 * ("Add a photo → Set a price → Share"), for sellers who follow pictures
 * more easily than paragraphs.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  steps,
}: {
  icon: ComponentType<{ className?: string }>
  title: ReactNode
  description: ReactNode
  /** A `Button` or `buttonClass` link. */
  action?: ReactNode
  steps?: { icon: ComponentType<{ className?: string }>; label: string }[]
}) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center sm:py-14">
      <span className="relative flex h-20 w-20 items-center justify-center">
        <span aria-hidden className="absolute inset-0 rounded-[28px] bg-brand-gradient opacity-15 blur-md" />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-[22px] bg-brand-gradient text-brand-contrast shadow-[0_10px_28px_-10px_var(--cta-glow)]">
          <Icon className="h-8 w-8" />
        </span>
      </span>
      <h3 className="mt-5 font-heading text-[20px] font-bold text-fg">{title}</h3>
      <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted">{description}</p>

      {steps && steps.length > 0 && (
        <ol className="mt-6 flex w-full max-w-md items-start justify-center gap-2">
          {steps.map(({ icon: StepIcon, label }, index) => (
            <li key={label} className="flex flex-1 flex-col items-center gap-2">
              <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                <StepIcon className="h-5 w-5" />
                <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-brand-contrast">
                  {index + 1}
                </span>
              </span>
              <span className="text-hint font-medium text-fg">{label}</span>
            </li>
          ))}
        </ol>
      )}

      {action && <div className="mt-7 flex w-full justify-center [&>*]:w-full sm:[&>*]:w-auto">{action}</div>}
    </div>
  )
}
