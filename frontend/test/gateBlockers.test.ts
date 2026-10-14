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
  tax: [['tax.pan', 'PAN'], ['tax.gst', 'GST registration status']],
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

test('online payment: GST links to the Tax card, the bank account to its page', () => {
  // The production report: the server lists the GST answer the bank
  // account is waiting on, ahead of the account itself.
  const r = readiness({ ONLINE_PAYMENT: ['tax.gst', 'payout.bankAccount'] })

  assert.deepEqual(gateBlockers(r, 'ONLINE_PAYMENT', OWNER, []), [
    {
      key: 'tax.gst',
      label: 'GST registration status',
      section: 'business',
      to: `${OWNER}/business#setup-tax`,
    },
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
    ONLINE_PAYMENT: ['address.business', 'tax.pan', 'tax.gst', 'payout.bankAccount'],
  })

  assert.deepEqual(groupBySection(gateBlockers(r, 'ONLINE_PAYMENT', OWNER, [])), [
    {
      section: 'business',
      to: `${OWNER}/business#setup-address`,
      labels: ['Business address', 'PAN', 'GST registration status'],
    },
    {
      section: 'bank-accounts',
      to: `${OWNER}/bank-accounts`,
      labels: ['Primary payout bank account'],
    },
  ])
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
  const r = readiness({ ONLINE_PAYMENT: ['tax.gst', 'payout.bankAccount'] })
  const blockers = gateBlockers(r, 'ONLINE_PAYMENT', '/stores/zonemax/manage', [
    'bank-accounts',
    'business',
  ])

  assert.deepEqual(
    blockers.map((b) => b.to),
    [null, null],
  )
  // Still grouped by section, so the admin sees what the seller must do.
  assert.deepEqual(
    groupBySection(blockers).map((g) => g.labels),
    [['GST registration status'], ['Primary payout bank account']],
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
