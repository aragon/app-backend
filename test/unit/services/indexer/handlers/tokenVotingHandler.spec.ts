import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { TokenVotingHandler } from '@services/indexer/handlers/tokenVotingHandler'

describe('Indexer: TokenVotingHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('votingSettingsUpdated', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await TokenVotingHandler.votingSettingsUpdated(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })
})
