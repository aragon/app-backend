import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { DaoRegistryHandler } from '@services/indexer/handlers/daoRegistryHandler'
import { Models } from '@dbModels'

describe('Indexer: DaoRegistryHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('should process dao registered', async () => {
    const network = NetworksEnum.mainnet

    const txLog = {
      transactionHash: '0x123',
      address: '0x456',
      data: '0x789',
      topics: ['0xabc'],
      blockNumber: 1,
    }

    const fakeEvent = {
      args: {
        dao: '0x123',
        creator: '0x456',
        subdomain: 'test',
      },
    }

    const findTxHashSpy = sandbox.spy(Models.LogDaoRegistry, 'findTxHash')

    const loggerVerboseStub = sandbox.stub(logger, 'verbose')

    await DaoRegistryHandler.daoRegistered(fakeEvent as any, txLog as any, network)

    expect(findTxHashSpy.calledOnce).to.be.true
    expect(findTxHashSpy.calledWith(txLog.transactionHash)).to.be.true
    expect(loggerVerboseStub.calledTwice).to.be.true

    const savedDaoLog = await Models.LogDaoRegistry.findTxHash(txLog.transactionHash)
    expect(!!savedDaoLog).to.be.true

    expect(savedDaoLog.network).to.eq(network)
    expect(savedDaoLog.address).to.eq(fakeEvent.args.dao)
    expect(savedDaoLog.creatorAddress).to.eq(fakeEvent.args.creator)
    expect(savedDaoLog.ens).to.eq(fakeEvent.args.subdomain)
    expect(savedDaoLog.blockNumber).to.eq(txLog.blockNumber)
    expect(savedDaoLog.transactionHash).to.eq(txLog.transactionHash)
  })

  it('should not process existing dao registered', async () => {
    const network = NetworksEnum.mainnet
    const txLog = {
      transactionHash: '0x123',
      address: '0x456',
      data: '0x789',
      topics: ['0xabc'],
      blockNumber: 1,
    }
    const fakeEvent = {
      args: {
        dao: '0x123',
        creator: '0x456',
        subdomain: 'test',
      },
    }
    const findTxHashStub = sandbox.stub(Models.LogDaoRegistry, 'findTxHash').resolves({ transactionHash: '0x00' })

    const createStub = sandbox.stub(Models.LogDaoRegistry, 'create')

    await DaoRegistryHandler.daoRegistered(fakeEvent as any, txLog, network)

    expect(findTxHashStub.calledOnceWith(txLog.transactionHash)).to.be.true
    expect(createStub.notCalled).to.be.true
  })
})
