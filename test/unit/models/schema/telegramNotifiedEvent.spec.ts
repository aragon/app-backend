import { Models } from '@dbModels'
import { expect } from 'chai'

describe('Model: TelegramNotifiedEvent', () => {
  it('claim returns true for a new key and false once the key is taken', async () => {
    const first = await Models.TelegramNotifiedEvent.claim('proposal-ending:0xabc-0x1-1')
    const second = await Models.TelegramNotifiedEvent.claim('proposal-ending:0xabc-0x1-1')

    expect(first).to.be.true
    expect(second).to.be.false
  })

  it('claims for different keys are independent', async () => {
    const a = await Models.TelegramNotifiedEvent.claim('proposal-ending:a')
    const b = await Models.TelegramNotifiedEvent.claim('proposal-ending:b')

    expect(a).to.be.true
    expect(b).to.be.true
  })

  it('stores a recipient hash so delivery markers can be exported and deleted', async () => {
    await Models.TelegramNotifiedEvent.claim('delivered:a', 'recipient-hash')

    const marker = await Models.TelegramNotifiedEvent.findOne({ id: 'delivered:a' })
    expect(marker?.recipientHash).to.eq('recipient-hash')
  })

  it('rethrows non duplicate-key errors', async () => {
    let error: any
    try {
      await Models.TelegramNotifiedEvent.claim(null as any)
    } catch (err) {
      error = err
    }
    expect(error).to.exist
    expect(error.code).to.not.eq(11000)
  })
})
