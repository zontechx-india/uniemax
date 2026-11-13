import { useEffect, useState } from 'react'
import { storeFinanceApi } from '../../../../features/stores/storesApi'
import type { StorePlatformFee } from '../../../../features/stores/storesApi'
import { RupeeIcon, ShieldCheckIcon } from '../../../../layout/icons'

/**
 * The note under a product's price: UnieMax's platform fee and what the
 * seller receives. Sellers only — customers never see the fee (it is taken
 * from the seller's payout, not added to the price).
 *
 * The fee is on the product price only (shipping is never charged). The
 * worked example is integer paise maths, rounded half up like the server.
 */

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

function toPaise(value: string): bigint | null {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value.trim())
  return match ? BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0')) : null
}

function toBp(percent: string): bigint {
  const [whole, frac = ''] = percent.split('.')
  return BigInt(whole || '0') * 100n + BigInt(frac.padEnd(2, '0').slice(0, 2))
}

const rupees = (paise: bigint) => inr.format(Number(paise) / 100)
const pct = (percent: string) => `${Number(percent)}%`

export function PlatformFeeNote({ storeId, price }: { storeId: string; price?: string }) {
  const [fee, setFee] = useState<StorePlatformFee | null>(null)

  useEffect(() => {
    let live = true
    storeFinanceApi
      .platformFee(storeId)
      .then((value) => {
        if (live) setFee(value)
      })
      .catch(() => undefined) // a note, not a blocker — the form works without it
    return () => {
      live = false
    }
  }, [storeId])

  if (!fee) return null

  const bp = toBp(fee.percent)
  const paise = price ? toPaise(price) : null
  // What the seller keeps — the one number they care about.
  const youGet =
    paise !== null && paise > 0n
      ? `You get ${rupees(bp === 0n ? paise : paise - (paise * bp + 5000n) / 10000n)}`
      : bp === 0n
        ? 'You get the full price'
        : null
  const upcoming = fee.upcoming
    ? `${pct(fee.upcoming.percent)} from ${new Date(fee.upcoming.effectiveFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : null

  const gatewayBp = toBp(fee.gateway.percent)

  // Short facts, one per line, each with a mark: a seller scans it in a second.
  // The fee is on the product price only (never shipping), and customers never see it.
  return (
    <div className="mt-1.5 space-y-0.5 text-hint text-muted" role="note">
      <p className="flex items-center gap-1.5">
        <RupeeIcon className="h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="font-semibold text-fg">Platform fee {pct(fee.percent)}</span>
          {youGet && <> · {youGet}</>}
          {upcoming && <> · {upcoming}</>}
        </span>
      </p>
      {gatewayBp > 0n ? (
        <p className="flex items-center gap-1.5">
          <ShieldCheckIcon className="h-3.5 w-3.5 shrink-0" />
          {fee.gateway.bearer === 'PLATFORM' ? (
            <span className="font-semibold text-success">
              Online payment fee {pct(fee.gateway.percent)} paid by UnieMax
            </span>
          ) : (
            <span>
              <span className="font-semibold text-fg">Online payment fee {pct(fee.gateway.percent)}</span> · from
              your payout
            </span>
          )}
        </p>
      ) : null}
    </div>
  )
}
