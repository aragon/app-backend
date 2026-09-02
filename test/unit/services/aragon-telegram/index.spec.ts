import AragonTelegramService from '@services/aragon-telegram/index'
import { EnumConnection } from '@types'
import { expect } from 'chai'

describe('AragonTelegram: service wiring', () => {
  it('opens a blockchain connection so the block gap gauges can read chain heads', () => {
    expect(AragonTelegramService.NEED_CONNECTIONS).to.include(EnumConnection.BLOCKCHAIN)
  })
})
