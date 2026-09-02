import AragonTelegramService from '@services/aragon-telegram/index'
import { EnumConnection } from '@types'
import { expect } from 'chai'

describe('AragonTelegram: service wiring', () => {
  it('boots without a blockchain connection, the block gap comes from the dao service over the queue', () => {
    expect(AragonTelegramService.NEED_CONNECTIONS).to.not.include(EnumConnection.BLOCKCHAIN)
  })
})
