import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import Logger from '@logger'
import { EnumQueueName, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import { Models } from '@dbModels'
import Web3 from '@helpers/web3'
import Web3Helper from '@helpers/web3'
import ProxyContractHelper from '@helpers/proxyContract'
import { MetadataHandler } from '@handlers/metadataHandler'
import { ProxyMember } from '@modules/proxyMember'
import Utils from '@helpers/utils'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Utils from '@helpers/web3Utils'
import DbOperations from '@models/utils/dbOperations'
import { DaoList } from '@test/mock/fakeDao'
import EnsHelper from '@helpers/ens'

describe('Indexer: DaoRegistryHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    // Stub wait to speed up tests
    sandbox.stub(Utils, 'wait').resolves()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('daoRegistered', () => {
    it('should process dao registered', async () => {
      const network = NetworksEnum.ethereumMainnet

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
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
      const findTxHashSpy = sandbox.spy(Models.Dao, 'findExistingLog')
      const loggerStub = sandbox.stub(logger, 'verbose')
      const proxyUtils = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves('0x123')
      const getSubdomainEnsStub = sandbox.stub(EnsHelper, 'getDaoEns').resolves('test.dao.eth')
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1123213)
      const getDaoOsVersionStub = sandbox.stub(Web3Helper, 'getDaoOsVersion').resolves('1.0.0')
      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves()
      const RabbitMQHelperStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      await DaoRegistryHandler.daoRegistered(fakeEvent as any, logInfo)

      expect(
        findTxHashSpy.calledOnceWith({
          network: logInfo.network,
          address: fakeEvent.args.dao,
        }),
      ).to.be.true

      expect(loggerStub.calledOnce).to.be.true
      expect(RabbitMQHelperStub.calledOnce).to.be.true
      const savedDaoLog = await Models.Dao.findExistingLog({
        network: logInfo.network,
        address: fakeEvent.args.dao,
      })
      expect(!!savedDaoLog).to.be.true

      expect(savedDaoLog.network).to.eq(network)
      expect(savedDaoLog.address).to.eq(fakeEvent.args.dao)
      expect(savedDaoLog.creatorAddress).to.eq(fakeEvent.args.creator)
      expect(savedDaoLog.subdomain).to.eq(fakeEvent.args.subdomain)
      expect(savedDaoLog.ens).to.eq(`test.dao.eth`)
      expect(savedDaoLog.blockNumber).to.eq(logInfo.blockNumber)
      expect(savedDaoLog.transactionHash).to.eq(logInfo.transactionHash)
      expect(initNewDaoStub.calledOnce).to.be.true
      expect(initNewDaoStub.calledWith(logInfo)).to.be.true
      expect(proxyUtils.calledWith(fakeEvent.args.dao, network)).to.be.true
      expect(
        getSubdomainEnsStub.calledWith({
          daoAddress: fakeEvent.args.dao,
          subdomain: fakeEvent.args.subdomain,
        }),
      ).to.be.true
      expect(getBlockTimestampStub.calledWith(logInfo.blockNumber, network)).to.be.true
      expect(getDaoOsVersionStub.calledWith(fakeEvent.args.dao, network)).to.be.true
      expect(createMemberStub.calledWith(fakeEvent.args.creator)).to.be.true
    })

    it('should not process existing dao registered', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
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
      const findTxHashStub = sandbox.stub(Models.Dao, 'findExistingLog').resolves({ transactionHash: '0x00' })

      const createStub = sandbox.stub(Models.Dao, 'create')

      await DaoRegistryHandler.daoRegistered(fakeEvent as any, logInfo)

      expect(
        findTxHashStub.calledOnceWith({
          network: logInfo.network,
          address: fakeEvent.args.dao,
        }),
      ).to.be.true
      expect(createStub.notCalled).to.be.true
    })
  })

  describe('initiateNewDaoCreation', () => {
    it('should fails if tx not found', async () => {
      const web3Stub = sandbox.stub(Web3, 'getTransactionReceipt').resolves(null)
      const _metadataHandlerStub = sandbox.stub(DaoRegistryHandler, '_metadataHandler')

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      await DaoRegistryHandler.initiateNewDaoCreation(logInfo, '0x00')

      expect(web3Stub.calledOnce).to.be.true
      expect(_metadataHandlerStub.notCalled).to.be.true
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

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      const rabbitMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await DaoRegistryHandler.initiateNewDaoCreation(logInfo, '0x00')

      expect(web3Stub.calledOnce).to.be.true
      expect(metadataHandlerStub.calledOnce).to.be.true

      expect(rabbitMqStub.calledTwice).to.be.true
      expect(rabbitMqStub.args[0][0]).to.eq(EnumQueueName.daoTransactions)
      expect(rabbitMqStub.args[0][1]).to.deep.eq({
        id: '0x00',
        params: { address: '0x00', network: logInfo.network },
      })
      expect(rabbitMqStub.args[1][0]).to.eq(EnumQueueName.daoAssets)
      expect(rabbitMqStub.args[1][1]).to.deep.eq({
        id: '0x00',
        params: { address: '0x00', network: logInfo.network },
      })
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
      const stubFind = sandbox.stub(Web3Utils, 'findLogsByName').returns([
        {
          parsed: 'test',
          txLog: {
            network: NetworksEnum.ethereumMainnet,
            address: '0x0000000000000000000000000000000000000000',
            blockNumber: 122,
            transactionHash: '0x0123123',
            transactionIndex: 1,
            logIndex: 1,
            eventName: 'test',
          },
        },
      ] as any)

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 1,
        logIndex: 1,
        blockNumber: 3,
        transactionHash: '0x0123123',
        address: '0x0000000000000000000000000000000000000000',
        eventName: 'test',
      }

      await DaoRegistryHandler._metadataHandler(txReceipt as any, logInfo)

      expect(stubMetadata.calledOnce).to.be.true
      expect(stubFind.calledOnce).to.be.true
    })

    it('should call metadataSet', async () => {
      const txReceipt = {
        transactionHash: '0x123',
        address: '0x123',
        topics: ['0x456'],
        data: '0x789',
        blockNumber: 1,
      }

      const stubLogger = sandbox.stub(Logger, 'warn')
      const stubMetadata = sandbox.stub(MetadataHandler, 'metadataSet')
      const stubFind = sandbox.stub(Web3Utils, 'findLogsByName').returns([])

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: '0x0000000000000000000000000000000000000000',
        eventName: 'test',
      }

      await DaoRegistryHandler._metadataHandler(txReceipt as any, logInfo)

      expect(stubMetadata.notCalled).to.be.true
      expect(stubFind.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
    })
  })

  describe('nativeTransfer', () => {
    it('should call nativeTransfer', async () => {
      sandbox
        .stub(Models.Dao, 'findByAddress')
        .resolves({ address: '0x', network: NetworksEnum.ethereumMainnet } as any)
      const stubRabbitMQ = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 1,
        logIndex: 1,
        blockNumber: 3,
        transactionHash: '0x0123123',
        address: '0x0000000000000000000000000000000000000000',
        eventName: 'test',
      }

      await DaoRegistryHandler.nativeTransfer({} as any, logInfo)

      expect(stubRabbitMQ.calledThrice).to.be.true
    })

    it('should call nativeTransfer and return if dao not found', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const stubRabbitMQ = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 1,
        logIndex: 1,
        blockNumber: 3,
        transactionHash: '0x0123123',
        address: '0x0000000000000000000000000000000000000000',
        eventName: 'test',
      }

      await DaoRegistryHandler.nativeTransfer({} as any, logInfo)

      expect(stubRabbitMQ.notCalled).to.be.true
    })
  })

  describe('handleVersionUpgrade', () => {
    it('should update dao version on upgrade', async () => {
      const daoAddress = '0x123456789abcdef'
      const network = NetworksEnum.ethereumMainnet
      const mockDao = {
        id: 'dao-id-123',
        address: daoAddress,
        network,
        version: '1.0.0',
        implementationAddress: '0xoldImplementation',
      }

      const mockTxReceipt = {
        logs: [
          { address: '0xotherAddress', topics: ['0x123'] },
          { address: daoAddress, topics: ['0x456'] },
        ],
      }

      const mockUpgradeLogs = [
        {
          txLog: { address: daoAddress },
          parsed: { args: { implementation: '0xnewImplementation' } },
        },
      ]

      const findByAddressStub = sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao)
      const getReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(mockTxReceipt as any)
      const findLogsStub = sandbox.stub(Web3Utils, 'findLogsByName').returns(mockUpgradeLogs as any)
      const getVersionStub = sandbox.stub(Web3Helper, 'getDaoOsVersion').resolves('2.0.0')
      const updateStub = sandbox.stub(DbOperations, 'updateDocument').resolves()

      const info = {
        network,
        transactionHash: '0xtxhash',
        blockNumber: 123456,
      }

      await DaoRegistryHandler.handleVersionUpgrade(daoAddress, info)

      expect(findByAddressStub.calledWith(daoAddress, network)).to.be.true
      expect(getReceiptStub.calledWith(info.transactionHash, network)).to.be.true
      expect(findLogsStub.calledOnce).to.be.true
      expect(getVersionStub.calledWith('0xnewImplementation', network)).to.be.true
      expect(updateStub.calledOnce).to.be.true
      expect(updateStub.firstCall.args[1]).to.deep.equal({
        version: '2.0.0',
        implementationAddress: '0xnewImplementation',
      })
    })

    it('should not update if dao not found', async () => {
      const findByAddressStub = sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({} as any)
      const loggerStub = sandbox.stub(logger, 'warn')

      await DaoRegistryHandler.handleVersionUpgrade('0xdao', { network: NetworksEnum.ethereumMainnet })

      expect(findByAddressStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Dao not found or tx receipt not found' as any)).to.be.true
    })

    it('should not update if transaction receipt not found', async () => {
      const findByAddressStub = sandbox.stub(Models.Dao, 'findByAddress').resolves({} as any)
      const getReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)
      const loggerStub = sandbox.stub(logger, 'warn')

      await DaoRegistryHandler.handleVersionUpgrade('0xdao', {
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xtxhash',
      })

      expect(findByAddressStub.calledOnce).to.be.true
      expect(getReceiptStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
    })

    it('should not update if no upgrade logs are found', async () => {
      const daoAddress = '0x123456789abcdef'
      const mockDao = { version: '1.0.0', implementationAddress: '0xoldImpl' }

      sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao as any)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({} as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([])

      const updateStub = sandbox.stub(DbOperations, 'updateDocument')

      await DaoRegistryHandler.handleVersionUpgrade(daoAddress, {
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xtxhash',
      })

      expect(updateStub.called).to.be.false
    })

    it('should not update if upgrade log does not match dao address', async () => {
      const daoAddress = '0x123456789abcdef'
      const mockDao = { version: '1.0.0', implementationAddress: '0xoldImpl' }

      sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao as any)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({} as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([{ txLog: { address: '0xdifferentAddress' } }] as any)

      const updateStub = sandbox.stub(DbOperations, 'updateDocument')

      await DaoRegistryHandler.handleVersionUpgrade(daoAddress, {
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xtxhash',
      })

      expect(updateStub.called).to.be.false
    })

    it('should not update if version is the same', async () => {
      const daoAddress = '0x123456789abcdef'
      const mockDao = {
        version: '1.0.0',
        implementationAddress: '0xoldImplementation',
      }

      sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao as any)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({} as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([
        {
          txLog: { address: daoAddress },
          parsed: { args: { implementation: '0xnewImplementation' } },
        },
      ] as any)
      sandbox.stub(Web3Helper, 'getDaoOsVersion').resolves('1.0.0')

      const updateStub = sandbox.stub(DbOperations, 'updateDocument')

      await DaoRegistryHandler.handleVersionUpgrade(daoAddress, {
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xtxhash',
      })

      expect(updateStub.called).to.be.false
    })

    it('should not update if implementation address is the same', async () => {
      const daoAddress = '0x123456789abcdef'
      const implementationAddress = '0xsameImplementation'
      const mockDao = {
        version: '1.0.0',
        implementationAddress,
      }

      sandbox.stub(Models.Dao, 'findByAddress').resolves(mockDao as any)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({} as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([
        {
          txLog: { address: daoAddress },
          parsed: { args: { implementation: implementationAddress } },
        },
      ] as any)
      sandbox.stub(Web3Helper, 'getDaoOsVersion').resolves('2.0.0')

      const updateStub = sandbox.stub(DbOperations, 'updateDocument')

      await DaoRegistryHandler.handleVersionUpgrade(daoAddress, {
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xtxhash',
      })

      expect(updateStub.called).to.be.false
    })

    it('should update dao version and implementation without stubbing database operations', async () => {
      const daoAddress = '0x123456789abcdef123456'
      const oldImplementation = '0xoldImplementation123'
      const newImplementation = '0xnewImplementation456'
      const newVersion = '2.0.0'

      await Models.Dao.create({
        ...DaoList[0],
        network: NetworksEnum.ethereumMainnet,
        address: daoAddress,
        implementationAddress: oldImplementation,
        version: '1.0.0',
      })

      const stubLogger = sandbox.stub(logger, 'verbose')

      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
        logs: [{ address: daoAddress }],
      } as any)

      sandbox.stub(Web3Utils, 'findLogsByName').returns([
        {
          txLog: { address: daoAddress },
          parsed: { args: { implementation: newImplementation } },
        },
      ] as any)

      sandbox.stub(Web3Helper, 'getDaoOsVersion').resolves(newVersion)

      await DaoRegistryHandler.handleVersionUpgrade(daoAddress, {
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xupgradetxhash',
      })

      const updatedDao = await Models.Dao.findByAddress(daoAddress, NetworksEnum.ethereumMainnet)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Updated document - DaoVersion Upgraded' as any)).to.be.true
      expect(updatedDao).to.not.be.null
      expect(updatedDao?.version).to.equal(newVersion)
      expect(updatedDao?.implementationAddress).to.equal(newImplementation)
    })
  })
})
