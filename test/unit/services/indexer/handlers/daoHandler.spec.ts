import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { DaoHandler } from '@services/indexer/handlers/daoHandler'

describe('Indexer: DaoHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('callbackReceived', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await DaoHandler.callbackReceived(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('deposited', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await DaoHandler.deposited(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('executed', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await DaoHandler.executed(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('granted', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await DaoHandler.granted(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('nativeTokenDeposited', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await DaoHandler.nativeTokenDeposited(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('newURI', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await DaoHandler.newURI(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('revoked', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await DaoHandler.revoked(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('standardCallbackRegistered', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await DaoHandler.standardCallbackRegistered(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })

  it('trustedForwarderSet', async () => {
    const event = { name: 'test' }
    const txLog = { name: 'test' }
    const network = NetworksEnum.mainnet

    const stubLogger = sandbox.stub(logger, 'verbose')
    await DaoHandler.trustedForwarderSet(event as any, txLog, network)
    expect(stubLogger.calledOnce).to.be.true
  })
})
