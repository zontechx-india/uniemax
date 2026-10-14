// Gate blockers → links. Pure logic, no browser: `npm run test:unit`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  gateBlockers,
  groupBySection,
  setupAnchor,
} from '../src/storefront/features/stores/gateBlockers'
import type {
  Gate,
  Readiness,
  RequirementState,
  StepKey,
  StepState,
} from '../src/storefront/features/stores/storeProfile'

// The registry's shape as `GET /stores/:id` returns it (docs/API.md).
const REQUIREMENTS: Record<StepKey, [key: string, label: string][]> = {
  store: [['store.name', 'Store name'], ['store.logo', 'Store logo']],
  business: [
    ['business.name', 'Business name'],
    ['business.phone', 'Contact phone number'],
  ],
  catalog: [['catalog.product', 'At least one live product']],
  address: [['address.business', 'Business address']],
  // PAN and GSTIN are optional: the step exists (its card does) but
  // requires nothing.
  tax: [],
  payout: [['payout.bankAccount', 'Primary payout bank account']],
}
const HREFS: Record<StepKey, string> = {
  store: 'details',
  business: 'business',
  catalog: 'products',
  address: 'business',
  tax: 'business',
  payout: 'bank-accounts',
}

function readiness(blocking: Partial<Record<Gate, string[]>>): Readiness {
  const steps: StepState[] = (Object.keys(HREFS) as StepKey[]).map((key) => {
    const requirements: RequirementState[] = REQUIREMENTS[key].map(
      ([reqKey, label]) => ({ key: reqKey, label, step: key, gates: [], met: true }),
    )
    return {
      key,
      title: key,
      blurb: '',
      wizard: false,
      href: HREFS[key],
      stepNumber: null,
      requirements,
      complete: true,
      metCount: requirements.length,
      totalCount: requirements.length,
    }
  })
  const gate = (name: Gate) => ({
    gate: name,
    allowed: (blocking[name] ?? []).length === 0,
    blockers: [],
    blockerKeys: blocking[name] ?? [],
  })
  return {
    steps,
    gates: {
      PUBLISH: gate('PUBLISH'),
      PAYOUT_SETUP: gate('PAYOUT_SETUP'),
      ONLINE_PAYMENT: gate('ONLINE_PAYMENT'),
      PICKUP: gate('PICKUP'),
    },
    complete: false,
    metCount: 0,
    totalCount: 0,
  }
}

const OWNER = '/mystores/zonemax'

test('online payment: the bank account links straight to its page', () => {
  // What the server reports today: online payment waits on the bank account
  // alone (PAN and GST are optional; the bank page asks for the address).
  const r = readiness({ ONLINE_PAYMENT: ['payout.bankAccount'] })

  assert.deepEqual(gateBlockers(r, 'ONLINE_PAYMENT', OWNER, []), [
    {
      key: 'payout.bankAccount',
      label: 'Primary payout bank account',
      section: 'bank-accounts',
      // One step on that page — no anchor needed.
      to: `${OWNER}/bank-accounts`,
    },
  ])
})

test('one button per screen, in order, opening on the first card to fill', () => {
  const r = readiness({
    PUBLISH: ['business.name', 'business.phone', 'catalog.product'],
    PICKUP: ['address.business'],
  })

  assert.deepEqual(groupBySection(gateBlockers(r, 'PUBLISH', OWNER, [])), [
    {
      section: 'business',
      to: `${OWNER}/business#setup-business`,
      labels: ['Business name', 'Contact phone number'],
    },
    {
      section: 'products',
      to: `${OWNER}/products`,
      labels: ['At least one live product'],
    },
  ])
  // The address card is its own anchor on the same page.
  assert.equal(
    gateBlockers(r, 'PICKUP', OWNER, [])[0]?.to,
    `${OWNER}/business#setup-address`,
  )
})

test('only the screens that still need something get a button', () => {
  const r = readiness({ ONLINE_PAYMENT: ['payout.bankAccount'] })
  const groups = groupBySection(gateBlockers(r, 'ONLINE_PAYMENT', OWNER, []))

  assert.deepEqual(
    groups.map((g) => g.section),
    ['bank-accounts'],
  )
})

test('admin scope: sections it cannot open come back unlinked', () => {
  const r = readiness({ PUBLISH: ['business.phone', 'catalog.product'], ONLINE_PAYMENT: ['payout.bankAccount'] })
  const hidden = ['bank-accounts', 'business']
  const base = '/stores/zonemax/manage'

  assert.deepEqual(
    gateBlockers(r, 'PUBLISH', base, hidden).map((b) => b.to),
    [null, `${base}/products`],
  )
  // Still named, so the admin sees what the seller must do.
  assert.deepEqual(
    groupBySection(gateBlockers(r, 'ONLINE_PAYMENT', base, hidden)),
    [{ section: 'bank-accounts', to: null, labels: ['Primary payout bank account'] }],
  )
})

test('publish blockers: only Business details carries an anchor', () => {
  const r = readiness({
    PUBLISH: ['store.logo', 'business.phone', 'catalog.product'],
  })

  assert.deepEqual(
    gateBlockers(r, 'PUBLISH', OWNER, []).map((b) => b.to),
    [
      `${OWNER}/details`,
      `${OWNER}/business#setup-business`,
      `${OWNER}/products`,
    ],
  )
})

test('an unknown key is shown by key, unlinked, and never merged', () => {
  const r = readiness({ PUBLISH: ['future.one', 'future.two'] })
  const blockers = gateBlockers(r, 'PUBLISH', OWNER, [])

  assert.deepEqual(blockers[0], {
    key: 'future.one',
    label: 'future.one',
    section: null,
    to: null,
  })
  assert.equal(groupBySection(blockers).length, 2)
})

test('setupAnchor matches the ids the Business page gives its cards', () => {
  assert.equal(setupAnchor('tax'), 'setup-tax')
  assert.equal(setupAnchor('address'), 'setup-address')
  assert.equal(setupAnchor('business'), 'setup-business')
})
