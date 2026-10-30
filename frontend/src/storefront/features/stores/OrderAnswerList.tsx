import type { OrderCustomAnswer } from './storesApi'

/**
 * Answers to a store's own checkout questions ("Post Office: Kalady") as a
 * compact label/value list — under the address on order pages. Renders
 * nothing when there are none.
 */
export function OrderAnswerList({
  answers,
  className = '',
}: {
  answers: OrderCustomAnswer[]
  /** Text size from the surrounding card. */
  className?: string
}) {
  if (answers.length === 0) return null
  return (
    <dl className={`mt-1.5 space-y-0.5 [overflow-wrap:anywhere] ${className}`}>
      {answers.map((answer) => (
        <div key={answer.id} className="flex flex-wrap gap-x-1.5">
          <dt className="text-muted">{answer.label}:</dt>
          <dd className="text-fg">{answer.value}</dd>
        </div>
      ))}
    </dl>
  )
}
