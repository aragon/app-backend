import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { DaoRegistryHandler } from '@services/indexer/handlers/daoRegistryHandler'
import { Models } from '@dbModels'
import Web3 from '@helpers/web3'

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

    const initNewDaoStub = sandbox.stub(DaoRegistryHandler, 'initiateNewDaoCreation')

    const findTxHashSpy = sandbox.spy(Models.LogDaoRegistry, 'findExistingLog')

    const loggerVerboseStub = sandbox.stub(logger, 'verbose')

    await DaoRegistryHandler.daoRegistered(fakeEvent as any, txLog as any, network)

    expect(findTxHashSpy.calledOnce).to.be.true
    expect(findTxHashSpy.calledWith(txLog.transactionHash, fakeEvent.args.dao)).to.be.true
    expect(loggerVerboseStub.calledTwice).to.be.true

    const savedDaoLog = await Models.LogDaoRegistry.findExistingLog(txLog.transactionHash, fakeEvent.args.dao)
    expect(!!savedDaoLog).to.be.true

    expect(savedDaoLog.network).to.eq(network)
    expect(savedDaoLog.address).to.eq(fakeEvent.args.dao)
    expect(savedDaoLog.creatorAddress).to.eq(fakeEvent.args.creator)
    expect(savedDaoLog.ens).to.eq(fakeEvent.args.subdomain)
    expect(savedDaoLog.blockNumber).to.eq(txLog.blockNumber)
    expect(savedDaoLog.transactionHash).to.eq(txLog.transactionHash)

    expect(initNewDaoStub.calledOnce).to.be.true
    expect(initNewDaoStub.calledWith('0x123', network)).to.be.true
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
    const findTxHashStub = sandbox.stub(Models.LogDaoRegistry, 'findExistingLog').resolves({ transactionHash: '0x00' })

    const createStub = sandbox.stub(Models.LogDaoRegistry, 'create')

    await DaoRegistryHandler.daoRegistered(fakeEvent as any, txLog, network)

    expect(findTxHashStub.calledOnceWith(txLog.transactionHash, fakeEvent.args.dao)).to.be.true
    expect(createStub.notCalled).to.be.true
  })

  describe('initiateNewDaoCreation', () => {
    it('should fails if tx not found', async () => {
      const web3Stub = sandbox.stub(Web3, 'getTransactionReceipt').resolves(null)
      const _pluginSetupStub = sandbox.stub(DaoRegistryHandler, '_pluginSetup')
      const _memberAddedStub = sandbox.stub(DaoRegistryHandler, '_memberAdded')

      await DaoRegistryHandler.initiateNewDaoCreation('0x123', NetworksEnum.mainnet)

      expect(web3Stub.calledOnce).to.be.true
      expect(_pluginSetupStub.notCalled).to.be.true
      expect(_memberAddedStub.notCalled).to.be.true
    })
    it('should initiate new dao creation', async () => {
      const web3Stub = sandbox.stub(Web3, 'getTransactionReceipt').resolves({
        logs: [
          {
            address: '0x123',
            topics: ['0x456'],
            data: '0x789',
            blockNumber: 1,
          },
        ],
      } as any)
      const _pluginSetupStub = sandbox.stub(DaoRegistryHandler, '_pluginSetup')
      const _memberAddedStub = sandbox.stub(DaoRegistryHandler, '_memberAdded')

      await DaoRegistryHandler.initiateNewDaoCreation('0x123', NetworksEnum.mainnet)

      expect(web3Stub.calledOnce).to.be.true
      expect(_pluginSetupStub.calledOnce).to.be.true
      expect(_memberAddedStub.calledOnce).to.be.true
    })
  })
})
