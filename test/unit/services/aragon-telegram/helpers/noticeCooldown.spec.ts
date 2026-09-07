import { NoticeCooldown } from '@services/aragon-telegram/helpers/noticeCooldown'
import { expect } from 'chai'

describe('AragonTelegram: NoticeCooldown', () => {
  const T0 = 1_000_000
  const size = (cooldown: NoticeCooldown): number => (cooldown as any).lastNoticeAt.size

  it('allows one reply per user per window', () => {
    const cooldown = new NoticeCooldown(60_000)
    expect(cooldown.shouldNotify(1, T0)).to.be.true
    expect(cooldown.shouldNotify(1, T0 + 30_000)).to.be.false
    expect(cooldown.shouldNotify(1, T0 + 60_000)).to.be.true
  })

  it('tracks users separately', () => {
    const cooldown = new NoticeCooldown(60_000)
    expect(cooldown.shouldNotify(1, T0)).to.be.true
    expect(cooldown.shouldNotify(2, T0)).to.be.true
    expect(cooldown.shouldNotify(1, T0 + 1)).to.be.false
  })

  it('drops expired users as it goes', () => {
    const cooldown = new NoticeCooldown(60_000)
    for (let userId = 1; userId <= 100; userId++) cooldown.shouldNotify(userId, T0 + userId)

    cooldown.shouldNotify(500, T0 + 60_000 + 50)
    expect(size(cooldown)).to.eq(51)
  })

  it('never holds more than its cap even when nobody has expired', () => {
    const cooldown = new NoticeCooldown(60_000)
    for (let userId = 1; userId <= 10_000; userId++) cooldown.shouldNotify(userId, T0)

    expect(cooldown.shouldNotify(10_001, T0 + 1)).to.be.true
    expect(size(cooldown)).to.eq(10_000)
    expect(cooldown.shouldNotify(1, T0 + 2)).to.be.true
    expect(size(cooldown)).to.eq(10_000)
    expect(cooldown.shouldNotify(5_000, T0 + 2)).to.be.false
  })
})
