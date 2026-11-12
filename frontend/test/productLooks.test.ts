// Photos per look → the product page gallery. Pure logic: `npm run test:unit`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { galleryFor, lookOptionOf } from '../src/storefront/features/stores/productLooks'

const types = [
  { name: 'Colour', values: ['Pink', 'Blue'] },
  { name: 'Size', values: ['S', 'M'] },
]
const photo = (id: string, lookValue: string | null, lookOption: string | null = lookValue ? 'Colour' : null) => ({
  id,
  lookOption,
  lookValue,
})
const ids = (list: { id: string }[]) => list.map((m) => m.id)

const media = [
  photo('pink-front', 'Pink'),
  photo('blue-front', 'Blue'),
  photo('size-chart', null),
  photo('pink-back', 'Pink'),
  photo('blue-back', 'Blue'),
]

test('a picked colour shows its photos, then the shared ones — never another colour', () => {
  assert.deepEqual(ids(galleryFor(media, types, { Colour: 'Blue', Size: 'S' }, null)), [
    'blue-front',
    'blue-back',
    'size-chart',
  ])
})

test("the variant's own photo leads", () => {
  assert.deepEqual(ids(galleryFor(media, types, { Colour: 'Pink', Size: 'M' }, 'pink-back')), [
    'pink-back',
    'pink-front',
    'size-chart',
  ])
})

test('names match without caring about case or spaces', () => {
  const loose = [photo('a', ' pink ', 'colour'), photo('b', 'Blue'), photo('c', null)]
  assert.deepEqual(ids(galleryFor(loose, types, { Colour: 'Pink' }, null)), ['a', 'c'])
})

test('an untagged product shows every photo, as before', () => {
  const plain = [photo('a', null), photo('b', null)]
  assert.equal(lookOptionOf(plain, types), null)
  assert.deepEqual(ids(galleryFor(plain, types, { Colour: 'Pink' }, 'b')), ['a', 'b'])
})

test('a colour with no photos of its own falls back to every photo', () => {
  const onlyPink = [photo('p', 'Pink'), photo('s', null)]
  assert.deepEqual(ids(galleryFor(onlyPink, types, { Colour: 'Blue' }, null)), ['p', 's'])
})

test('a stale tag (value or option gone) counts as shared, so it is never hidden', () => {
  const stale = [photo('p', 'Pink'), photo('old', 'Green'), photo('x', 'Pink', 'Pattern')]
  assert.deepEqual(ids(galleryFor(stale, types, { Colour: 'Pink' }, null)), ['p', 'old', 'x'])
})
