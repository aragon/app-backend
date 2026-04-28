import { DescriptionCache } from '@services/aragon-telegram/helpers/descriptionCache'
import { expect } from 'chai'

describe('AragonTelegram: DescriptionCache', () => {
  it('returns a 12-char hex token (fits 64-byte callback_data)', () => {
    const cache = new DescriptionCache()
    const token = cache.put('hello')
    expect(token).to.match(/^[a-f0-9]{12}$/)
  })

  it('round-trips put → get', () => {
    const cache = new DescriptionCache()
    const token = cache.put('a long proposal body')
    expect(cache.get(token)).to.eq('a long proposal body')
  })

  it('returns undefined for unknown tokens', () => {
    const cache = new DescriptionCache()
    expect(cache.get('0123456789ab')).to.be.undefined
  })

  it('mints distinct tokens for distinct bodies', () => {
    const cache = new DescriptionCache()
    const t1 = cache.put('one')
    const t2 = cache.put('two')
    expect(t1).to.not.eq(t2)
  })

  it('evicts the oldest entry once over the limit', () => {
    // CACHE_LIMIT = 500. Put 501 entries; the very first one must have been evicted.
    const cache = new DescriptionCache()
    const firstToken = cache.put('first')
    for (let i = 0; i < 500; i++) cache.put(`body-${i}`)
    expect(cache.get(firstToken)).to.be.undefined
  })
})
