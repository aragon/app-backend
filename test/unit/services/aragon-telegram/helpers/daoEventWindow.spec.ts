import { DaoEventWindow } from '@services/aragon-telegram/helpers/daoEventWindow'
import { TELEGRAM_DAO_EVENT_WINDOW_MS } from '@types'
import { expect } from 'chai'

describe('AragonTelegram: DaoEventWindow', () => {
  const T0 = Date.UTC(2026, 8, 2, 14, 37, 12)

  it('hands out send slots below the cap, the notice slot at the cap, and mutes past it', () => {
    const window = new DaoEventWindow()
    const slots = [1, 2, 3, 4].map(n => window.claimSlot('sepolia-0xdao', `msg-${n}`, 2, T0))
    expect(slots).to.deep.eq(['send', 'send-with-mute-notice', 'muted', 'muted'])
  })

  it('gives a retried message the answer it got the first time without spending another slot', () => {
    const window = new DaoEventWindow()
    expect(window.claimSlot('sepolia-0xdao', 'msg-1', 2, T0)).to.eq('send')
    expect(window.claimSlot('sepolia-0xdao', 'msg-1', 2, T0 + 1)).to.eq('send')
    expect(window.claimSlot('sepolia-0xdao', 'msg-1', 2, T0 + 2)).to.eq('send')

    expect(window.claimSlot('sepolia-0xdao', 'msg-2', 2, T0 + 3)).to.eq('send-with-mute-notice')
  })

  it('counts each organization on its own', () => {
    const window = new DaoEventWindow()
    window.claimSlot('sepolia-0xdao', 'msg-1', 1, T0)
    window.claimSlot('sepolia-0xdao', 'msg-2', 1, T0)
    expect(window.claimSlot('sepolia-0xother', 'msg-3', 1, T0)).to.eq('send-with-mute-notice')
  })

  it('stays muted until the clock hour ends, then starts counting again', () => {
    const window = new DaoEventWindow()
    window.claimSlot('sepolia-0xdao', 'msg-1', 1, T0)
    expect(window.claimSlot('sepolia-0xdao', 'msg-2', 1, T0 + 20 * 60 * 1000)).to.eq('muted')

    const nextHour =
      Math.floor(T0 / TELEGRAM_DAO_EVENT_WINDOW_MS) * TELEGRAM_DAO_EVENT_WINDOW_MS + TELEGRAM_DAO_EVENT_WINDOW_MS
    expect(window.claimSlot('sepolia-0xdao', 'msg-3', 1, nextHour)).to.eq('send-with-mute-notice')
  })
})
