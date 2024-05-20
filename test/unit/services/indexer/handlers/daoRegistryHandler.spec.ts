import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { DaoRegistryHandler } from '@services/indexer/handlers/daoRegistryHandler'
import { Models } from '@dbModels'
import Web3 from '@helpers/web3'
import { PluginSetupProcessorHandler } from '@services/indexer/handlers/pluginSetupProcessorHandler'
import { MemberHandler } from '@services/indexer/handlers/memberHandler'

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

  describe('_pluginSetup', () => {
    it('should fails to save plugin setup logs if not found', async () => {
      const verboseStub = sandbox.stub(logger, 'verbose')
      const fakeTx = {
        logs: [
          {
            transactionHash: '0x123',
            address: '0x123',
            topics: ['0x456'],
            data: '0x789',
            blockNumber: 1,
          },
        ],
      } as any
      const web3Stub = sandbox.stub(Web3, 'findLogsByName').returns(null)
      const installationPreparedStub = sandbox.stub(PluginSetupProcessorHandler, 'installationPrepared')
      await DaoRegistryHandler._pluginSetup(fakeTx, '0x123', NetworksEnum.mainnet)

      expect(web3Stub.calledOnce).to.be.true
      expect(installationPreparedStub.notCalled).to.be.true
      expect(verboseStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('PluginSetupProcessor not found' as any)).to.be.true
    })

    it('should save plugin setup logs', async () => {
      const findLogsByNameStub = sandbox.stub(Web3, 'findLogsByName').resolves({
        parsed: {
          dao: '0x123',
          plugin: '0x456',
        },
        txLog: {
          transactionHash: '0x123',
          address: '0x123',
          topics: ['0x456'],
          data: '0x789',
          blockNumber: 1,
        },
      } as any)

      const fakeTx = {
        logs: [
          {
            transactionHash: '0x123',
            address: '0x123',
            topics: ['0x456'],
            data: '0x789',
            blockNumber: 1,
          },
        ],
      } as any

      const installationPreparedStub = sandbox.stub(PluginSetupProcessorHandler, 'installationPrepared')
      await DaoRegistryHandler._pluginSetup(fakeTx, '0x123', NetworksEnum.mainnet)

      expect(findLogsByNameStub.calledOnce).to.be.true
      expect(installationPreparedStub.calledOnce).to.be.true
    })
  })

  describe('_memberAdded', () => {
    it('should fails to save member logs if not found all', async () => {
      const verboseStub = sandbox.stub(logger, 'verbose')
      const fakeTx = {
        logs: [
          {
            transactionHash: '0x123',
            address: '0x123',
            topics: ['0x456'],
            data: '0x789',
            blockNumber: 1,
          },
        ],
      } as any

      const findLogsByNameStub = sandbox
        .stub(Web3, 'findLogsByName')
        .onFirstCall()
        .returns(null)
        .onSecondCall()
        .returns(null)

      const delegateChangedStub = sandbox.stub(MemberHandler, 'delegateChanged')

      await DaoRegistryHandler._memberAdded(fakeTx, '0x123', NetworksEnum.mainnet)

      expect(findLogsByNameStub.calledTwice).to.be.true
      expect(verboseStub.calledOnce).to.be.true

      expect(verboseStub.calledWith('Invalid member log' as any)).to.be.true
      expect(delegateChangedStub.notCalled).to.be.true
    })

    it('should save delegation member logs', async () => {
      const fakeTx = {
        logs: [
          {
            transactionHash: '0x123',
            address: '0x123',
            topics: ['0x456'],
            data: '0x789',
            blockNumber: 1,
          },
        ],
      } as any

      const verboseStub = sandbox.stub(logger, 'verbose')
      const web3Stub = sandbox
        .stub(Web3, 'findLogsByName')
        .onFirstCall()
        .returns(null)
        .onSecondCall()
        .returns({
          parsed: {
            dao: '0x123',
            member: '0x456',
          },
          txLog: {
            transactionHash: '0x123',
            address: '0x123',
            topics: ['0x456'],
            data: '0x789',
            blockNumber: 1,
          },
        } as any)

      const memberAddedStub = sandbox.stub(MemberHandler, 'membersAdded')
      const delegateChangedStub = sandbox.stub(MemberHandler, 'delegateChanged')

      await DaoRegistryHandler._memberAdded(fakeTx, '0x123', NetworksEnum.mainnet)
      expect(web3Stub.calledTwice).to.be.true
      expect(delegateChangedStub.calledOnce).to.be.true

      expect(memberAddedStub.notCalled).to.be.true
      expect(verboseStub.notCalled).to.be.true
    })

    it('should save member logs', async () => {
      const fakeTx = {
        logs: [
          {
            transactionHash: '0x123',
            address: '0x123',
            topics: ['0x456'],
            data: '0x789',
            blockNumber: 1,
          },
        ],
      } as any

      const verboseStub = sandbox.stub(logger, 'verbose')
      const web3Stub = sandbox
        .stub(Web3, 'findLogsByName')
        .onFirstCall()
        .returns({
          parsed: {
            dao: '0x123',
            member: '0x456',
          },
          txLog: {
            transactionHash: '0x123',
            address: '0x123',
            topics: ['0x456'],
            data: '0x789',
            blockNumber: 1,
          },
        } as any)
        .onSecondCall()
        .returns(null)

      const memberAddedStub = sandbox.stub(MemberHandler, 'membersAdded')
      const delegateChangedStub = sandbox.stub(MemberHandler, 'delegateChanged')

      await DaoRegistryHandler._memberAdded(fakeTx, '0x123', NetworksEnum.mainnet)
      expect(web3Stub.callCount).to.be.eq(1)
      expect(memberAddedStub.calledOnce).to.be.true

      expect(delegateChangedStub.notCalled).to.be.true
      expect(verboseStub.notCalled).to.be.true
    })
  })
})
