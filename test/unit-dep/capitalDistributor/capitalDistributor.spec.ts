import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Capital Distributor', () => {
  let sandbox: SinonSandbox
  let rabbitMQ: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    rabbitMQ = sandbox.stub(RabbitMQHelper, 'sendMessage')
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should sync the capital distributor event', async () => {
    const txHashes = [
      '0x5aaabf7b94e33d015c2bf8f542b7622cae69628dc6a4ddc975905c83b85fa377',
      '0x45cdc71ef2a57be0829d75b5ed2d8dfc74313f65f4d735b1fae46d6e27de2d8a',
    ]

    await LibUtils.handleEventsFromTxHashes(txHashes, NetworksEnum.ethereumSepolia)

    const campaign = await Models.Campaign.findOne({})
    expect(campaign).to.be.exist

    expect(campaign.merkleRoot).to.be.not.empty
  })
})
