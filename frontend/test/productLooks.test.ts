// Photos per variant → the product page gallery. Pure logic: `npm run test:unit`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { galleryFor } from '../src/storefront/features/stores/productLooks'

const media = ['pink-front', 'pink-back', 'blue-front', 'size-chart', 'video'].map((id) => ({ id }))
const ids = (list: { id: string }[]) => list.map((m) => m.id)
const pink = { mediaIds: ['pink-front', 'pink-back'] }
const blue = { mediaIds: ['blue-front'] }
const green = { mediaIds: ['pink-front'] } // reuses a Pink photo
const variants = [pink, blue, green]

test("a picked colour shows its photos in order, then the photos no colour lists", () => {
  assert.deepEqual(ids(galleryFor(media, variants, pink)), ['pink-front', 'pink-back', 'size-chart', 'video'])
})

test("another colour's own photos are hidden", () => {
  assert.deepEqual(ids(galleryFor(media, variants, blue)), ['blue-front', 'size-chart', 'video'])
})

test('one photo can show two colours', () => {
  assert.deepEqual(ids(galleryFor(media, variants, green)), ['pink-front', 'size-chart', 'video'])
})

test('the list order wins over the gallery order', () => {
  assert.deepEqual(ids(galleryFor(media, variants, { mediaIds: ['pink-back', 'pink-front'] })).slice(0, 2), [
    'pink-back',
    'pink-front',
  ])
})

test('no variant, or a variant without photos, shows every photo', () => {
  assert.deepEqual(ids(galleryFor(media, variants, null)), ids(media))
  assert.deepEqual(ids(galleryFor(media, variants, { mediaIds: [] })), ids(media))
})

test('a listed photo that was deleted is skipped', () => {
  assert.deepEqual(ids(galleryFor(media, variants, { mediaIds: ['gone', 'blue-front'] })), [
    'blue-front',
    'size-chart',
    'video',
  ])
})
