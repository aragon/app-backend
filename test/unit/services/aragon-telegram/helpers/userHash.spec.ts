import { createHash } from 'node:crypto'
import config from '@config'
import { telegramRecipientHash, telegramUserLogHash } from '@services/aragon-telegram/helpers/userHash'
import { expect } from 'chai'
import * as sinon from 'sinon'

describe('AragonTelegram: userHash', () => {
  it('produces a stable hex digest for the same user', () => {
    expect(telegramRecipientHash(100)).to.eq(telegramRecipientHash(100))
    expect(telegramRecipientHash(100)).to.match(/^[0-9a-f]{64}$/)
  })

  it('gives different users different digests', () => {
    expect(telegramRecipientHash(100)).to.not.eq(telegramRecipientHash(101))
  })

  it('keys the digest with the server secret instead of plain hashing', () => {
    // A plain unkeyed hash of the small Telegram id space can be brute-forced back to the id.
    expect(telegramRecipientHash(100)).to.not.eq(createHash('sha256').update('100').digest('hex'))
  })

  it('derives the short log hash from the same keyed digest', () => {
    expect(telegramUserLogHash(100)).to.eq(telegramRecipientHash(100).slice(0, 8))
  })

  it('refuses to hash when the secret is missing', () => {
    const stub = sinon.stub(config.SERVICES.ARAGON_TELEGRAM, 'USER_HASH_SECRET').value(null as any)
    try {
      expect(() => telegramRecipientHash(100)).to.throw('SERVICES_ARAGON_TELEGRAM_USER_HASH_SECRET')
    } finally {
      stub.restore()
    }
  })
})
