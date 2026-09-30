import { ChevronDownIcon } from '../../layout/icons'

/**
 * The questions that stop a seller starting — each answer is what the
 * platform does today, not what it plans to. The requirement answers mirror
 * the backend's capability registry (`storeReadiness.ts`): what publishing
 * needs, what online payment needs, and that GSTIN is never mandatory. When a
 * rule there changes, the matching answer here has to change with it.
 */
const FAQS = [
  {
    q: 'Is it really free?',
    a: 'Yes. Creating your store, adding products and publishing it cost nothing, and you don’t need a card to sign up.',
  },
  {
    q: 'Do I need a GST number?',
    a: 'No — GSTIN is optional on UnieMax; add it if you have one. You need a PAN only if you want to accept online payments.',
  },
  {
    q: 'How do I get paid?',
    a: 'Cash on Delivery orders are paid to you by your customer when you deliver. To accept online payments, add your PAN and a bank account: UnieMax collects the payment and pays it out to your verified account.',
  },
  {
    q: 'How do I deliver orders?',
    a: 'With your own courier or delivery staff. You choose the pincodes you deliver to, whether customers can pick up from your shop, and what shipping costs — flat, free, or free above an amount.',
  },
  {
    q: 'What do I need before my store goes live?',
    a: 'Your store name and logo, your business and seller name, a contact phone and email, your business address, and at least one product. Your dashboard keeps a checklist of exactly what’s left.',
  },
  {
    q: 'Can I run it all from my phone?',
    a: 'Yes. Creating your store, adding products with photos and managing orders all work in your phone’s browser — there’s nothing to install.',
  },
  {
    q: 'How will customers find my store?',
    a: 'Share your store link on WhatsApp, Instagram and Facebook, and customers order from it directly. Published stores are also listed on the UnieMax marketplace, where shoppers search across every store.',
  },
] as const

/** Native `<details>` — accessible and keyboard-operable with no script. */
export function SellFaq() {
  return (
    <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {FAQS.map((item) => (
        <details key={item.q} className="group px-5 sm:px-7">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-base font-semibold text-fg [&::-webkit-details-marker]:hidden">
            {item.q}
            <ChevronDownIcon className="h-5 w-5 shrink-0 text-muted transition-transform duration-300 group-open:rotate-180" />
          </summary>
          <p className="-mt-1 pb-5 pr-6 text-sm leading-relaxed text-muted sm:text-base">
            {item.a}
          </p>
        </details>
      ))}
    </div>
  )
}
