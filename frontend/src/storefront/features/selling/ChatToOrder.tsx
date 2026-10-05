import { buttonClass } from '../../../shared/ui/Button'
import { ChatIcon, CheckIcon, ChevronRightIcon } from '../../layout/icons'
import { Reveal } from './Reveal'

/**
 * Before / after for the seller who sells over WhatsApp or Instagram today —
 * most of the people a Facebook or Instagram ad reaches. Left: the order as a
 * conversation. Right: the same order as it reaches a UnieMax seller, with
 * the details a chat has to drag out one message at a time.
 *
 * Illustration only (both panels are single images to assistive tech). The
 * order panel mirrors the real one: the `UM-…` order-number format, a store's
 * statuses, Cash on Delivery, a pincode-checked delivery address.
 */
export function ChatToOrder() {
  return (
    <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-8">
      <Reveal>
        <Panel tone="before" caption="Every order is a conversation — price, size, photos, address, one message at a time.">
          <div role="img" aria-label="A chat where a customer asks price, size and photos before ordering" className="space-y-2.5">
            <Bubble from="them" time="10:02">Hi! Price of the blue kurta?</Bubble>
            <Bubble from="you" time="10:15">₹1,299</Bubble>
            <Bubble from="them" time="10:16">Size M available?</Bubble>
            <Bubble from="you" time="10:41">Let me check 🙏</Bubble>
            <Bubble from="them" time="10:42">Can you send other colours?</Bubble>
            <Bubble from="them" time="11:30">Hello??</Bubble>
          </div>
        </Panel>
      </Reveal>

      <div aria-hidden="true" className="flex justify-center">
        <span className="flex h-11 w-11 rotate-90 items-center justify-center rounded-full border border-line bg-surface text-brand shadow-floating lg:rotate-0">
          <ChevronRightIcon className="h-5 w-5" />
        </span>
      </div>

      <Reveal delay={120}>
        <Panel tone="after" caption="Customers pick the size, check delivery to their pincode and order. You just confirm.">
          <div role="img" aria-label="The same order as a UnieMax order card: item, size, delivery pincode and Cash on Delivery">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-muted">UM-MG7K2QX4-R8TP</span>
              <span className="rounded-pill bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning">
                Pending
              </span>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-xl border border-line p-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-alt text-2xl">
                👗
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-fg">Cotton kurta</span>
                <span className="block text-xs text-muted">Blue · M · Qty 1</span>
              </span>
              <span className="text-sm font-bold text-fg">₹1,299</span>
            </div>

            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Deliver to" value="Priya S. · 560034" />
              <Row label="Payment" value="Cash on Delivery" />
              <Row label="Shipping" value="Free" />
              <div className="flex justify-between border-t border-line pt-2 font-bold text-fg">
                <dt>Total</dt>
                <dd>₹1,299</dd>
              </div>
            </dl>

            <span className={buttonClass({ size: 'md', full: true, className: 'pointer-events-none mt-5' })}>
              <CheckIcon className="h-4 w-4" />
              Confirm order
            </span>
          </div>
        </Panel>
      </Reveal>
    </div>
  )
}

function Panel({
  tone,
  caption,
  children,
}: {
  tone: 'before' | 'after'
  caption: string
  children: React.ReactNode
}) {
  const after = tone === 'after'
  return (
    <figure
      className={`h-full rounded-2xl border bg-surface p-5 sm:p-6 ${
        after ? 'border-brand/30 shadow-[0_24px_48px_-28px_rgb(108_62_244/0.45)]' : 'border-line'
      }`}
    >
      <div className="mb-5 flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full ${
            after ? 'bg-brand text-brand-contrast' : 'bg-surface-alt text-muted'
          }`}
        >
          {after ? <CheckIcon className="h-4 w-4" /> : <ChatIcon className="h-4 w-4" />}
        </span>
        <span className={`text-sm font-semibold ${after ? 'text-fg' : 'text-muted'}`}>
          {after ? 'With your UnieMax store' : 'Selling in chats'}
        </span>
      </div>
      {children}
      <figcaption className="mt-5 border-t border-line pt-4 text-sm text-muted">{caption}</figcaption>
    </figure>
  )
}

function Bubble({
  from,
  time,
  children,
}: {
  from: 'them' | 'you'
  time: string
  children: React.ReactNode
}) {
  const you = from === 'you'
  return (
    <div className={`flex ${you ? 'justify-end' : 'justify-start'}`}>
      <p
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
          you ? 'rounded-br-md bg-brand-soft text-fg' : 'rounded-bl-md bg-surface-alt text-fg'
        }`}
      >
        {children}
        <span className="ml-2 align-bottom text-xs text-muted">{time}</span>
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-fg">{value}</dd>
    </div>
  )
}
