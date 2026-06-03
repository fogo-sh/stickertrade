import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { generateStickerSlug, slugifyName } from '../app/data/slug.ts'

describe('slugifyName', () => {
  it('lowercases and hyphenates spaces', () => {
    assert.equal(slugifyName('Dino Sticker'), 'dino-sticker')
  })

  it('strips non-alphanumeric chars and collapses runs of hyphens', () => {
    assert.equal(slugifyName('coffee & code'), 'coffee-code')
    assert.equal(slugifyName('foo!!!bar???baz'), 'foo-bar-baz')
  })

  it('trims leading and trailing hyphens', () => {
    assert.equal(slugifyName('---hello---'), 'hello')
    assert.equal(slugifyName('   spaced   '), 'spaced')
  })

  it('returns an empty string for all-non-ASCII names', () => {
    assert.equal(slugifyName('🦖'), '')
    assert.equal(slugifyName('🦖 🔥 🦖'), '')
  })

  it('caps at 40 chars and re-trims trailing hyphen left by the cut', () => {
    const longName = 'a'.repeat(200)
    assert.equal(slugifyName(longName), 'a'.repeat(40))
    const oddCut = 'a'.repeat(39) + ' ' + 'b'.repeat(50)
    // 'aaaa...aaa-bbbb...' — first 40 chars is 39 a's + '-' which trims to 39 a's
    assert.equal(slugifyName(oddCut), 'a'.repeat(39))
  })
})

describe('generateStickerSlug', () => {
  it('produces <slug-part>-<6 lowercase alphanumerics>', () => {
    const slug = generateStickerSlug('Dino Sticker')
    assert.match(slug, /^dino-sticker-[a-z0-9]{6}$/)
  })

  it('produces just the suffix when the name slugifies to empty', () => {
    const slug = generateStickerSlug('🦖')
    assert.match(slug, /^[a-z0-9]{6}$/)
  })

  it('produces different suffixes across calls', () => {
    const a = generateStickerSlug('test')
    const b = generateStickerSlug('test')
    assert.notEqual(a, b)
  })
})
