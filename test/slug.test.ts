import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { generateStickerSlug, looksLikeUuid, slugifyName } from '../app/data/slug.ts'

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

describe('looksLikeUuid', () => {
  it('returns true for canonical lowercase UUIDs', () => {
    assert.equal(looksLikeUuid('5a2077e8-ef49-446b-aa27-dca99e15a9b4'), true)
  })

  it('returns true for uppercase UUIDs', () => {
    assert.equal(looksLikeUuid('5A2077E8-EF49-446B-AA27-DCA99E15A9B4'), true)
  })

  it('returns false for sticker slugs', () => {
    assert.equal(looksLikeUuid('dino-sticker-k3p9aq'), false)
    assert.equal(looksLikeUuid('a3f9b1'), false)
  })

  it('returns false for empty / partial strings', () => {
    assert.equal(looksLikeUuid(''), false)
    assert.equal(looksLikeUuid('5a2077e8-ef49-446b-aa27'), false)
  })
})
