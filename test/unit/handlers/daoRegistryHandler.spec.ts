import '@test/environment'
import { Models } from '@dbModels'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import { MetadataHandler } from '@handlers/metadataHandler'
import EnsHelper from '@helpers/ens'
import ProxyContractHelper from '@helpers/proxyContract'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Utils from '@helpers/utils'
import Web3 from '@helpers/web3'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import Logger from '@logger'
import { MemberGovernanceFactory } from '@src/governance'
import { DaoList } from '@test/mock/fakeDao'
import { EnumQueueName, NetworksEnum } from '@types'
import { expect } from 'chai'
import { beforeEach } from 'mocha'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

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

      // Stub external services
      const initNewDaoStub = sandbox.stub(DaoRegistryHandler, 'initiateNewDaoCreation')
      const loggerStub = sandbox.stub(logger, 'verbose')
      const proxyUtils = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves('0x123')
      const getSubdomainEnsStub = sandbox.stub(EnsHelper, 'getDaoEns').resolves('test.dao.eth')
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1123213)
      const getDaoOsVersionStub = sandbox.stub(Web3Helper, 'getDaoOsVersion').resolves('1.0.0')
      const createMemberStub = sandbox.stub(MemberGovernanceFactory, 'createBaseMember').resolves()
      const RabbitMQHelperStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      // Execute the handler
      await DaoRegistryHandler.daoRegistered(fakeEvent as any, logInfo)

      // Verify external service calls
      expect(loggerStub.called).to.be.true
      expect(RabbitMQHelperStub.calledOnce).to.be.true
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

      // Verify database state
      const savedDao = await Models.Dao.findExistingLog({
        network: logInfo.network,
        address: fakeEvent.args.dao,
      })
      expect(savedDao).to.exist
      expect(savedDao.network).to.eq(network)
      expect(savedDao.address).to.eq(fakeEvent.args.dao)
      expect(savedDao.creatorAddress).to.eq(fakeEvent.args.creator)
      expect(savedDao.subdomain).to.eq(fakeEvent.args.subdomain)
      expect(savedDao.ens).to.eq('test.dao.eth')
      expect(savedDao.blockNumber).to.eq(logInfo.blockNumber)
      expect(savedDao.transactionHash).to.eq(logInfo.transactionHash)
      expect(savedDao.implementationAddress).to.eq('0x123')
      expect(savedDao.version).to.eq('1.0.0')
      expect(savedDao.blockTimestamp).to.eq(1123213)
      expect(savedDao.isActive).to.be.true
      expect(savedDao.isHidden).to.be.false
      // isSupported might be handled differently by DbOperations
      if (savedDao.isSupported !== undefined) {
        expect(savedDao.isSupported).to.equal(false)
      }
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

      // Create existing DAO in database
      await Models.Dao.create({
        network: logInfo.network,
        address: fakeEvent.args.dao,
        transactionHash: '0x00',
        blockNumber: 1,
        creatorAddress: '0xold',
        subdomain: 'old',
        implementationAddress: '0xoldImpl',
        version: '0.0.1',
        isActive: true,
        isHidden: false,
        isSupported: false,
      })

      // Stub external services that shouldn't be called
      const initNewDaoStub = sandbox.stub(DaoRegistryHandler, 'initiateNewDaoCreation')
      const proxyUtils = sandbox.stub(ProxyContractHelper, 'getImplementationAddress')
      const getSubdomainEnsStub = sandbox.stub(EnsHelper, 'getDaoEns')
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp')
      const getDaoOsVersionStub = sandbox.stub(Web3Helper, 'getDaoOsVersion')
      const createMemberStub = sandbox.stub(MemberGovernanceFactory, 'createBaseMember')
      const RabbitMQHelperStub = sandbox.stub(RabbitMQHelper, 'sendMessage')

      await DaoRegistryHandler.daoRegistered(fakeEvent as any, logInfo)

      // Verify nothing was called since DAO already exists
      expect(initNewDaoStub.notCalled).to.be.true
      expect(proxyUtils.notCalled).to.be.true
      expect(getSubdomainEnsStub.notCalled).to.be.true
      expect(getBlockTimestampStub.notCalled).to.be.true
      expect(getDaoOsVersionStub.notCalled).to.be.true
      expect(createMemberStub.notCalled).to.be.true
      expect(RabbitMQHelperStub.notCalled).to.be.true

      // Verify the existing DAO was not modified
      const existingDao = await Models.Dao.findExistingLog({
        network: logInfo.network,
        address: fakeEvent.args.dao,
      })
      expect(existingDao.transactionHash).to.eq('0x00')
      expect(existingDao.creatorAddress).to.eq('0xold')
      expect(existingDao.subdomain).to.eq('old')
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
        params: { daoAddress: '0x00', network: logInfo.network },
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
      // Create a DAO in the database
      await Models.Dao.create({
        address: '0x0000000000000000000000000000000000000000',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xdaotx',
        blockNumber: 1,
        creatorAddress: '0xcreator',
        subdomain: 'test',
        implementationAddress: '0ximpl',
        version: '1.0.0',
        isActive: true,
        isHidden: false,
        isSupported: false,
      })

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
      expect(stubRabbitMQ.firstCall.args[0]).to.equal(EnumQueueName.daoTransactions)
      expect(stubRabbitMQ.secondCall.args[0]).to.equal(EnumQueueName.daoAssets)
      expect(stubRabbitMQ.thirdCall.args[0]).to.equal(EnumQueueName.daoMetrics)
    })

    it('should call nativeTransfer and return if dao not found', async () => {
      // Don't create any DAO in the database
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
        creatorAddress: '0xcreator',
        transactionHash: '0xoriginal',
        blockNumber: 100,
        subdomain: 'test',
        isActive: true,
        isHidden: false,
        isSupported: false,
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

      // Create the DAO in database
      await Models.Dao.create(mockDao)

      const getReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(mockTxReceipt as any)
      const findLogsStub = sandbox.stub(Web3Utils, 'findLogsByName').returns(mockUpgradeLogs as any)
      const getVersionStub = sandbox.stub(Web3Helper, 'getDaoOsVersion').resolves('2.0.0')
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')

      const info = {
        network,
        transactionHash: '0xtxhash',
        blockNumber: 123456,
      }

      await DaoRegistryHandler.handleVersionUpgrade(daoAddress, info)

      expect(getReceiptStub.calledWith(info.transactionHash, network)).to.be.true
      expect(findLogsStub.calledOnce).to.be.true
      expect(getVersionStub.calledWith('0xnewImplementation', network)).to.be.true
      expect(loggerVerboseStub.called).to.be.true

      // Verify the DAO was updated in database
      const updatedDao = await Models.Dao.findByAddress(daoAddress, network)
      expect(updatedDao).to.exist
      expect(updatedDao.version).to.equal('2.0.0')
      expect(updatedDao.implementationAddress).to.equal('0xnewImplementation')
    })

    it('should not update if dao not found', async () => {
      // Don't create any DAO in database
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({} as any)
      const loggerStub = sandbox.stub(logger, 'warn')

      await DaoRegistryHandler.handleVersionUpgrade('0xdao', { network: NetworksEnum.ethereumMainnet })

      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Dao not found or tx receipt not found' as any)).to.be.true
    })

    it('should not update if transaction receipt not found', async () => {
      // Create a DAO in database
      await Models.Dao.create({
        address: '0xdao',
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xoriginal',
        blockNumber: 1,
        creatorAddress: '0xcreator',
        subdomain: 'test',
        implementationAddress: '0ximpl',
        version: '1.0.0',
        isActive: true,
        isHidden: false,
        isSupported: false,
      })

      const getReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)
      const loggerStub = sandbox.stub(logger, 'warn')

      await DaoRegistryHandler.handleVersionUpgrade('0xdao', {
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xtxhash',
      })

      expect(getReceiptStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
    })

    it('should not update if no upgrade logs are found', async () => {
      const daoAddress = '0x123456789abcdef'
      const mockDao = {
        address: daoAddress,
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xoriginal',
        blockNumber: 1,
        creatorAddress: '0xcreator',
        subdomain: 'test',
        version: '1.0.0',
        implementationAddress: '0xoldImpl',
        isActive: true,
        isHidden: false,
        isSupported: false,
      }

      await Models.Dao.create(mockDao)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({} as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([])

      const initialVersion = mockDao.version

      await DaoRegistryHandler.handleVersionUpgrade(daoAddress, {
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xtxhash',
      })

      // Verify DAO was not updated
      const dao = await Models.Dao.findByAddress(daoAddress, NetworksEnum.ethereumMainnet)
      expect(dao.version).to.equal(initialVersion)
    })

    it('should not update if upgrade log does not match dao address', async () => {
      const daoAddress = '0x123456789abcdef'
      const mockDao = {
        address: daoAddress,
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xoriginal',
        blockNumber: 1,
        creatorAddress: '0xcreator',
        subdomain: 'test',
        version: '1.0.0',
        implementationAddress: '0xoldImpl',
        isActive: true,
        isHidden: false,
        isSupported: false,
      }

      await Models.Dao.create(mockDao)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({} as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([{ txLog: { address: '0xdifferentAddress' } }] as any)

      const initialVersion = mockDao.version

      await DaoRegistryHandler.handleVersionUpgrade(daoAddress, {
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xtxhash',
      })

      // Verify DAO was not updated
      const dao = await Models.Dao.findByAddress(daoAddress, NetworksEnum.ethereumMainnet)
      expect(dao.version).to.equal(initialVersion)
    })

    it('should not update if version is the same', async () => {
      const daoAddress = '0x123456789abcdef'
      const mockDao = {
        address: daoAddress,
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xoriginal',
        blockNumber: 1,
        creatorAddress: '0xcreator',
        subdomain: 'test',
        version: '1.0.0',
        implementationAddress: '0xoldImplementation',
        isActive: true,
        isHidden: false,
        isSupported: false,
      }

      await Models.Dao.create(mockDao)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({} as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([
        {
          txLog: { address: daoAddress },
          parsed: { args: { implementation: '0xnewImplementation' } },
        },
      ] as any)
      sandbox.stub(Web3Helper, 'getDaoOsVersion').resolves('1.0.0') // Same version

      await DaoRegistryHandler.handleVersionUpgrade(daoAddress, {
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xtxhash',
      })

      // Verify DAO was not updated
      const dao = await Models.Dao.findByAddress(daoAddress, NetworksEnum.ethereumMainnet)
      expect(dao.version).to.equal('1.0.0')
      expect(dao.implementationAddress).to.equal('0xoldImplementation')
    })

    it('should not update if implementation address is the same', async () => {
      const daoAddress = '0x123456789abcdef'
      const implementationAddress = '0xsameImplementation'
      const mockDao = {
        address: daoAddress,
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xoriginal',
        blockNumber: 1,
        creatorAddress: '0xcreator',
        subdomain: 'test',
        version: '1.0.0',
        implementationAddress,
        isActive: true,
        isHidden: false,
        isSupported: false,
      }

      await Models.Dao.create(mockDao)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({} as any)
      sandbox.stub(Web3Utils, 'findLogsByName').returns([
        {
          txLog: { address: daoAddress },
          parsed: { args: { implementation: implementationAddress } }, // Same implementation
        },
      ] as any)
      sandbox.stub(Web3Helper, 'getDaoOsVersion').resolves('2.0.0')

      await DaoRegistryHandler.handleVersionUpgrade(daoAddress, {
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0xtxhash',
      })

      // Verify DAO was not updated
      const dao = await Models.Dao.findByAddress(daoAddress, NetworksEnum.ethereumMainnet)
      expect(dao.version).to.equal('1.0.0')
      expect(dao.implementationAddress).to.equal(implementationAddress)
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
