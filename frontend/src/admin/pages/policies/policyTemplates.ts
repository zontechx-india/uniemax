import type { PolicySettings } from '../../../shared/policy/policyWording'

/**
 * Starting points the policy editor offers ("Use the approved wording") when
 * a draft is empty. PYO-001 is the version-1 wording approved on 28 Nov 2026
 * (docs/policyhub/README.md §4 — keep the two the same). An admin still
 * reviews it and a super admin publishes it; nothing here is published on
 * its own.
 */
/** Who a policy is for — the API's `audience` values the console offers. */
export const AUDIENCES = [
  { value: 'seller', label: 'Sellers' },
  { value: 'customer', label: 'Customers' },
  { value: 'supplier', label: 'Suppliers' },
]

export const audienceLabel = (value: string) => AUDIENCES.find((a) => a.value === value)?.label ?? value

export interface PolicyTemplate {
  name: string
  audience: string
  body: string
  settings: PolicySettings | null
}

export const POLICY_TEMPLATES: Record<string, PolicyTemplate> = {
  'PYO-001': {
    name: 'Seller Payout Policy',
    audience: 'seller',
    settings: { cutoff: '18:00', windowStart: '18:00', windowEnd: '22:00', timezone: 'Asia/Kolkata' },
    body: `**When we pay you**
- Orders marked **delivered before {{cutoff}} {{tz}}** are paid the **same day**. We start the bank transfer between **{{windowStart}} and {{windowEnd}} {{tz}}**.
- Orders marked delivered **at {{cutoff}} {{tz}} or later** are paid the **next day** in the same window.
- We pay **every day**, including Sundays and bank holidays.
- "Paid" means we have **started the transfer**. The time money reaches your account depends on your bank. On bank holidays it can take until the next working day.

**What is paid**
- Online-paid orders, after delivery, minus the platform fee shown on your Earnings page.
- Cash on delivery orders and bills you collected yourself are not paid out. You already hold that money. Any fees you owe are taken from a later payout.
- In some cases UnieMax may choose to pay part of an order before delivery. This is at UnieMax's choice and is not guaranteed.

**When a payout can be delayed**
- Your payout bank account is missing or not verified.
- The bank or payment provider is down. We retry in the next window.
- The transfer fails or comes back. We tell you and retry after the problem is fixed.
- The order is cancelled, refunded or under dispute.`,
  },
}
