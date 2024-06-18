import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { DaoRegistryHandler } from '@services/aragon-indexer/handlers/daoRegistryHandler'
import { Models } from '@dbModels'
import Web3 from '@helpers/web3'
import { PluginSetupProcessorHandler } from '@services/aragon-indexer/handlers/pluginSetupProcessorHandler'
import { MemberHandler } from '@services/aragon-indexer/handlers/memberHandler'
import ProxyContractHelper from '@helpers/proxyContract'
import Web3Helper from '@helpers/web3'
import { MetadataHandler } from '@services/aragon-indexer/handlers/metadataHandler'
import Logger from '@logger'

describe('Indexer: DaoRegistryHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('daoRegistered', () => {
    it('should process dao registered', async () => {
      const network = NetworksEnum.mainnet
      const logInfo = {
        network: NetworksEnum.mainnet,
        blockNumber: 3,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
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
      const loggerStub = sandbox.stub(logger, 'verbose')
      const proxyUtils = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves('0x123')

      await DaoRegistryHandler.daoRegistered(fakeEvent as any, logInfo)

      expect(
        findTxHashSpy.calledOnceWith({
          transactionHash: logInfo.transactionHash,
          address: fakeEvent.args.dao,
        }),
      ).to.be.true
      expect(loggerStub.calledOnce).to.be.true

      const savedDaoLog = await Models.LogDaoRegistry.findExistingLog({
        transactionHash: logInfo.transactionHash,
        address: fakeEvent.args.dao,
      })
      expect(!!savedDaoLog).to.be.true

      expect(savedDaoLog.network).to.eq(network)
      expect(savedDaoLog.address).to.eq(fakeEvent.args.dao)
      expect(savedDaoLog.creatorAddress).to.eq(fakeEvent.args.creator)
      expect(savedDaoLog.subdomain).to.eq(fakeEvent.args.subdomain)
      expect(savedDaoLog.blockNumber).to.eq(logInfo.blockNumber)
      expect(savedDaoLog.transactionHash).to.eq(logInfo.transactionHash)
      expect(initNewDaoStub.calledOnce).to.be.true
      expect(initNewDaoStub.calledWith(logInfo)).to.be.true
      expect(proxyUtils.calledOnce).to.be.true
      expect(proxyUtils.calledWith(fakeEvent.args.dao, network)).to.be.true
    })

    it('should not process existing dao registered', async () => {
      const logInfo = {
        network: NetworksEnum.mainnet,
        blockNumber: 3,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          dao: '0x123',
          creator: '0x456',
          subdomain: 'test',
        },
      }
      const findTxHashStub = sandbox
        .stub(Models.LogDaoRegistry, 'findExistingLog')
        .resolves({ transactionHash: '0x00' })

      const createStub = sandbox.stub(Models.LogDaoRegistry, 'create')

      await DaoRegistryHandler.daoRegistered(fakeEvent as any, logInfo)

      expect(
        findTxHashStub.calledOnceWith({
          transactionHash: logInfo.transactionHash,
          address: fakeEvent.args.dao,
        }),
      ).to.be.true
      expect(createStub.notCalled).to.be.true
    })

    it('daoRegistered throw error', async () => {
      const logInfo = {
        network: NetworksEnum.mainnet,
        blockNumber: 3,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      sandbox.stub(Models.LogDaoRegistry, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await DaoRegistryHandler.daoRegistered(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Error DaoRegister' as any)).to.be.true
    })
  })

  describe('initiateNewDaoCreation', () => {
    it('should fails if tx not found', async () => {
      const web3Stub = sandbox.stub(Web3, 'getTransactionReceipt').resolves(null)
      const _metadataHandlerStub = sandbox.stub(DaoRegistryHandler, '_metadataHandler')
      const _pluginSetupStub = sandbox.stub(DaoRegistryHandler, '_pluginSetup')
      const _memberAddedStub = sandbox.stub(DaoRegistryHandler, '_memberAdded')

      const logInfo = {
        network: NetworksEnum.mainnet,
        blockNumber: 3,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      await DaoRegistryHandler.initiateNewDaoCreation(logInfo)

      expect(web3Stub.calledOnce).to.be.true
      expect(_metadataHandlerStub.notCalled).to.be.true
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
      const metadataHandlerStub = sandbox.stub(DaoRegistryHandler, '_metadataHandler')
      const pluginSetupStub = sandbox.stub(DaoRegistryHandler, '_pluginSetup')
      const memberAddedStub = sandbox.stub(DaoRegistryHandler, '_memberAdded')

      const logInfo = {
        network: NetworksEnum.mainnet,
        blockNumber: 3,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      await DaoRegistryHandler.initiateNewDaoCreation(logInfo)

      expect(web3Stub.calledOnce).to.be.true
      expect(metadataHandlerStub.calledOnce).to.be.true
      expect(pluginSetupStub.calledOnce).to.be.true
      expect(memberAddedStub.calledOnce).to.be.true
    })
  })

  describe('_pluginSetup', () => {
    it('should fails to save plugin setup logs if not found', async () => {
      const stubLogger = sandbox.stub(logger, 'warn')
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
      const web3Stub = sandbox.stub(Web3, 'findLogsByName').returns([])
      const installationPreparedStub = sandbox.stub(PluginSetupProcessorHandler, 'installationPrepared')

      const logInfo = {
        network: NetworksEnum.mainnet,
        blockNumber: 3,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      await DaoRegistryHandler._pluginSetup(fakeTx, logInfo)

      expect(web3Stub.calledOnce).to.be.true
      expect(installationPreparedStub.notCalled).to.be.true
      expect(stubLogger.calledOnce).to.be.true
    })

    it('should save plugin setup logs', async () => {
      const findLogsByNameStub = sandbox.stub(Web3, 'findLogsByName').returns([
        {
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
        },
      ] as any)

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

      const logInfo = {
        network: NetworksEnum.mainnet,
        blockNumber: 3,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      await DaoRegistryHandler._pluginSetup(fakeTx, logInfo)

      expect(findLogsByNameStub.calledOnce).to.be.true
      expect(installationPreparedStub.calledOnce).to.be.true
    })
  })

  describe('_memberAdded', () => {
    it('should fails to save member logs if not found all', async () => {
      const verboseStub = sandbox.stub(logger, 'warn')
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
        .returns([])
        .onSecondCall()
        .returns([])

      const delegateChangedStub = sandbox.stub(MemberHandler, 'delegateChanged')

      const logInfo = {
        network: NetworksEnum.mainnet,
        blockNumber: 3,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      await DaoRegistryHandler._memberAdded(fakeTx, logInfo)

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
        .returns([])
        .onSecondCall()
        .returns([
          {
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
          },
        ] as any)

      const memberAddedStub = sandbox.stub(MemberHandler, 'membersAdded')
      const delegateChangedStub = sandbox.stub(MemberHandler, 'delegateChanged')

      const logInfo = {
        network: NetworksEnum.mainnet,
        blockNumber: 3,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      await DaoRegistryHandler._memberAdded(fakeTx, logInfo)

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
        .returns([
          {
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
          },
        ] as any)
        .onSecondCall()
        .returns([])

      const memberAddedStub = sandbox.stub(MemberHandler, 'membersAdded')
      const delegateChangedStub = sandbox.stub(MemberHandler, 'delegateChanged')

      const logInfo = {
        network: NetworksEnum.mainnet,
        blockNumber: 3,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      await DaoRegistryHandler._memberAdded(fakeTx, logInfo)

      expect(web3Stub.callCount).to.be.eq(1)
      expect(memberAddedStub.calledOnce).to.be.true

      expect(delegateChangedStub.notCalled).to.be.true
      expect(verboseStub.notCalled).to.be.true
    })
  })

  describe('_metadataHandler', () => {
    it('should call metadataSet', async () => {
      const txReceipt = {
        transactionHash: '0x123',
        address: '0x123',
        topics: ['0x456'],
        data: '0x789',
        blockNumber: 1,
      }

      const stubMetadata = sandbox.stub(MetadataHandler, 'metadataSet').resolves()
      const stubFind = sandbox.stub(Web3Helper, 'findLogsByName').returns([{ parsed: 'test', txLog: 'test2' }] as any)

      const logInfo = {
        network: NetworksEnum.mainnet,
        blockNumber: 3,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      await DaoRegistryHandler._metadataHandler(txReceipt as any, logInfo)

      expect(stubMetadata.calledOnce).to.be.true
      expect(stubFind.calledOnce).to.be.true
    })

    it('should call metadataSet', async () => {
      const transactionHash = '0x0'
      const network = NetworksEnum.mainnet
      const txReceipt = {
        transactionHash: '0x123',
        address: '0x123',
        topics: ['0x456'],
        data: '0x789',
        blockNumber: 1,
      }

      const stubLogger = sandbox.stub(Logger, 'warn')
      const stubMetadata = sandbox.stub(MetadataHandler, 'metadataSet')
      const stubFind = sandbox.stub(Web3Helper, 'findLogsByName').returns([])

      const logInfo = {
        network: NetworksEnum.mainnet,
        blockNumber: 3,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      await DaoRegistryHandler._metadataHandler(txReceipt as any, logInfo)

      expect(stubMetadata.notCalled).to.be.true
      expect(stubFind.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
    })
  })
})
