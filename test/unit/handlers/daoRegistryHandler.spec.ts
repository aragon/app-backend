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
      const subdomainExistsStub = sandbox.stub(Web3Helper, 'ensSubdomainExists').resolves(true)
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
      expect(savedDaoLog.blockNumber).to.eq(logInfo.blockNumber)
      expect(savedDaoLog.transactionHash).to.eq(logInfo.transactionHash)
      expect(initNewDaoStub.calledOnce).to.be.true
      expect(initNewDaoStub.calledWith(logInfo)).to.be.true
      expect(proxyUtils.calledWith(fakeEvent.args.dao, network)).to.be.true
      expect(subdomainExistsStub.calledWith(fakeEvent.args.subdomain, network)).to.be.true
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

      await Utils.wait(500)

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

  it('should call nativeTransfer', async () => {
    sandbox.stub(Models.Dao, 'findByAddress').resolves({ address: '0x', network: NetworksEnum.ethereumMainnet } as any)
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
})
