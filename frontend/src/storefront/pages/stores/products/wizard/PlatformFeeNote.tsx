import { useEffect, useState } from 'react'
import { storeFinanceApi } from '../../../../features/stores/storesApi'
import type { StorePlatformFee } from '../../../../features/stores/storesApi'

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
  const example =
    paise !== null && paise > 0n
      ? bp === 0n
        ? ` You receive the full ${rupees(paise)}.`
        : ` On ${rupees(paise)} you receive ${rupees(paise - (paise * bp + 5000n) / 10000n)}.`
      : bp === 0n
        ? ' You receive the full price.'
        : ''
  const upcoming = fee.upcoming
    ? ` From ${new Date(fee.upcoming.effectiveFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} it becomes ${pct(fee.upcoming.percent)}.`
    : ''

  const gatewayBp = toBp(fee.gateway.percent)

  return (
    <div className="mt-2 space-y-1 rounded-md bg-fg/5 px-3 py-2 text-hint text-muted" role="note">
      <p>
        <span className="font-semibold text-fg">UnieMax platform fee: {pct(fee.percent)}</span> of the product
        price (not shipping).{example}{upcoming} Customers don’t see this fee.
      </p>
      {gatewayBp > 0n ? (
        fee.gateway.bearer === 'PLATFORM' ? (
          <p>
            <span className="font-semibold text-success">
              Payment gateway fee {pct(fee.gateway.percent)} — paid by UnieMax
            </span>{' '}
            on online payments, as our discount to you. It is not taken from your money.
          </p>
        ) : (
          <p>
            <span className="font-semibold text-fg">Payment gateway fee: {pct(fee.gateway.percent)}</span> of
            online payments, taken from your payout.
          </p>
        )
      ) : null}
    </div>
  )
}
