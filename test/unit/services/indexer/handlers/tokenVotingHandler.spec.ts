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

  it('membersAdded', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await TokenVotingHandler.membersAdded(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('membersRemoved', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await TokenVotingHandler.membersRemoved(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('membershipContractAnnounced', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await TokenVotingHandler.membershipContractAnnounced(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('proposalCreated', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await TokenVotingHandler.proposalCreated(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('proposalExecuted', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await TokenVotingHandler.proposalExecuted(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('voteCast', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await TokenVotingHandler.voteCast(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('voteCastForbidden', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await TokenVotingHandler.voteCastForbidden(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })
})
