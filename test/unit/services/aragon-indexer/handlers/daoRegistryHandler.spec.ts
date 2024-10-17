import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import Logger from '@logger'
import { EnumQueueName, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { DaoRegistryHandler } from '@services/aragon-indexer/handlers/daoRegistryHandler'
import { Models } from '@dbModels'
import Web3 from '@helpers/web3'
import Web3Helper from '@helpers/web3'
import { PluginSetupProcessorHandler } from '@services/aragon-indexer/handlers/pluginSetupProcessorHandler'
import { MultisigHandler } from '@indexer/handlers/multisigHandler'
import ProxyContractHelper from '@helpers/proxyContract'
import { MetadataHandler } from '@services/aragon-indexer/handlers/metadataHandler'
import { PluginSettingHandler } from '@indexer/handlers/pluginSettingHandler'
import { ProxyMember } from '@modules/proxyMember'
import Utils from '@helpers/utils'
import { GovernanceErc20Handler } from '@indexer/handlers/governanceErc20Handler'
import { LogTokenVoting } from '@indexer/logTokenVoting'
import { RabbitMQHelper } from '@helpers/redditMQ'

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
      const subdomainExistsStub = sandbox.stub(Web3Helper, 'subdomainExists').resolves(true)
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1123213)
      const getDaoOsVersionStub = sandbox.stub(Web3Helper, 'getDaoOsVersion').resolves('1.0.0')
      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves()

      await DaoRegistryHandler.daoRegistered(fakeEvent as any, logInfo)

      expect(
        findTxHashSpy.calledOnceWith({
          network: logInfo.network,
          address: fakeEvent.args.dao,
        }),
      ).to.be.true

      expect(loggerStub.calledOnce).to.be.true

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
      const _pluginSetupStub = sandbox.stub(DaoRegistryHandler, '_pluginSetup')
      const _memberAddedStub = sandbox.stub(DaoRegistryHandler, '_memberAdded')
      const _pluginSettingsStub = sandbox.stub(DaoRegistryHandler, '_pluginSettings')

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
      expect(_pluginSetupStub.notCalled).to.be.true
      expect(_memberAddedStub.notCalled).to.be.true
      expect(_pluginSettingsStub.notCalled).to.be.true
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

      const pluginSettingStub = sandbox.stub(DaoRegistryHandler, '_pluginSettings').resolves([
        {
          tokenAddress: '0x123',
        },
      ] as any)

      const logTokenVotingStartStub = sandbox.stub(LogTokenVoting, 'start')

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
      expect(pluginSetupStub.calledOnce).to.be.true
      expect(pluginSettingStub.calledOnce).to.be.true
      expect(logTokenVotingStartStub.calledOnce).to.be.true

      expect(
        logTokenVotingStartStub.calledOnceWith({
          tokenAddress: '0x123',
        }),
      ).to.be.true

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
      const installationAppliedStub = sandbox.stub(PluginSetupProcessorHandler, 'installationApplied')

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      await DaoRegistryHandler._pluginSetup(fakeTx, logInfo)

      expect(web3Stub.calledTwice).to.be.true
      expect(installationPreparedStub.notCalled).to.be.true
      expect(installationAppliedStub.notCalled).to.be.true
      expect(stubLogger.calledTwice).to.be.true
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
      const installationAppliedStub = sandbox.stub(PluginSetupProcessorHandler, 'installationApplied')

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      await DaoRegistryHandler._pluginSetup(fakeTx, logInfo)

      expect(findLogsByNameStub.calledTwice).to.be.true
      expect(installationPreparedStub.calledOnce).to.be.true
      expect(installationAppliedStub.calledOnce).to.be.true
    })
  })

  describe('_pluginSettings', () => {
    it('should save plugin settings for multisig', async () => {
      const findLogsByNameStub = sandbox.stub(Web3, 'findLogsByName')
      findLogsByNameStub.onFirstCall().returns([
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
      findLogsByNameStub.onSecondCall().returns([])

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

      const votingSettingsUpdatedStub = sandbox.stub(PluginSettingHandler, 'votingSettingsUpdated')
      const multisigSettingsUpdatedStub = sandbox.stub(PluginSettingHandler, 'multisigSettingsUpdated')

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      await DaoRegistryHandler._pluginSettings(fakeTx, logInfo)
      expect(votingSettingsUpdatedStub.notCalled).to.be.true
      expect(multisigSettingsUpdatedStub.calledOnce).to.be.true
    })

    it('should save plugin settings for voting', async () => {
      const findLogsByNameStub = sandbox.stub(Web3, 'findLogsByName')
      findLogsByNameStub.onFirstCall().returns([])
      findLogsByNameStub.onSecondCall().returns([
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

      const votingSettingsUpdatedStub = sandbox.stub(PluginSettingHandler, 'votingSettingsUpdated')
      const multisigSettingsUpdatedStub = sandbox.stub(PluginSettingHandler, 'multisigSettingsUpdated')

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      await DaoRegistryHandler._pluginSettings(fakeTx, logInfo)
      expect(votingSettingsUpdatedStub.calledOnce).to.be.true
      expect(multisigSettingsUpdatedStub.notCalled).to.be.true
    })
  })

  describe('_memberAdded', () => {
    it('should fails to save member logs if not found all', async () => {
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

      const delegateChangedStub = sandbox.stub(MultisigHandler, 'membersRemoved')

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      await DaoRegistryHandler._memberAdded(fakeTx, logInfo, {} as any)

      expect(findLogsByNameStub.calledTwice).to.be.true
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

      const memberAddedStub = sandbox.stub(MultisigHandler, 'membersAdded')
      const delegateChangedStub = sandbox.stub(MultisigHandler, 'membersRemoved')
      const delegateVotesChangedStub = sandbox.stub(GovernanceErc20Handler, 'delegateVotesChanged')

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      await DaoRegistryHandler._memberAdded(fakeTx, logInfo, {} as any)

      expect(web3Stub.calledTwice).to.be.true
      expect(delegateChangedStub.notCalled).to.be.true
      expect(memberAddedStub.notCalled).to.be.true
      expect(delegateVotesChangedStub.calledOnce).to.be.true
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
              transactionIndex: 1,
              index: 2,
              blockNumber: 1,
            },
          },
        ] as any)
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
              transactionIndex: 1,
              index: 1,
            },
          },
        ] as any)

      const memberAddedStub = sandbox.stub(MultisigHandler, 'membersAdded')
      const delegateVotesChangedStub = sandbox.stub(GovernanceErc20Handler, 'delegateVotesChanged')

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x0123123',
        address: '0x0123123',
        eventName: 'test',
      }

      await DaoRegistryHandler._memberAdded(fakeTx, logInfo, {} as any)

      expect(web3Stub.callCount).to.be.eq(2)
      expect(memberAddedStub.calledOnce).to.be.true
      expect(memberAddedStub.args[0][0]).to.deep.eq({ dao: fakeTx.logs[0].address, member: '0x456' } as any)
      expect(memberAddedStub.args[0][1]).to.deep.eq({
        network: NetworksEnum.ethereumMainnet,
        address: '0x123',
        blockNumber: 1,
        logIndex: 2,
        transactionIndex: 1,
        transactionHash: '0x123',
        eventName: 'MembersAdded',
      } as any)
      expect(delegateVotesChangedStub.calledOnce).to.be.true
      expect(delegateVotesChangedStub.args[0][0]).to.deep.eq({ dao: fakeTx.logs[0].address, member: '0x456' } as any)
      expect(delegateVotesChangedStub.args[0][1]).to.deep.eq({
        network: NetworksEnum.ethereumMainnet,
        address: '0x123',
        blockNumber: 1,
        transactionHash: '0x123',
        eventName: 'DelegateVotesChanged',
        logIndex: 1,
        transactionIndex: 1,
      } as any)
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
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 1,
        logIndex: 1,
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
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 3,
        transactionIndex: 1,
        logIndex: 1,
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
