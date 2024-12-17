import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { ISettingStatus, ITokenType, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import { Multisig } from '@artifacts/Multisig'
import { TokenVoting } from '@artifacts/TokenVoting'
import { StagedProposalProcessor } from '@artifacts/stagedProposalProcessor'
import { ProxyToken } from '@modules/proxyToken'
import DbOperations from '@models/utils/dbOperations'

describe('Indexer: PluginSettingHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('handleFromReceipt', () => {
    it('should process multisig, voting, and spp settings logs', async () => {
      const txReceipt = {
        logs: [
          { topics: ['0xmultisig'], data: '0x01' },
          { topics: ['0xvoting'], data: '0x02' },
          { topics: ['0xspp'], data: '0x03' },
        ],
      } as any

      const info = {
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0x123',
        blockNumber: 1,
        transactionIndex: 1,
        logIndex: 1,
      }

      const multisigLogsStub = sandbox
        .stub(Web3Helper, 'findLogsByName')
        .withArgs(txReceipt, 'MultisigSettingsUpdated', Multisig.abi)
        .returns([{ parsed: 'multisigLog', txLog: 'tx1' }] as any)
        .withArgs(txReceipt, 'VotingSettingsUpdated', TokenVoting.abi)
        .returns([{ parsed: 'votingLog', txLog: 'tx2' }] as any)
        .withArgs(txReceipt, 'StagesUpdated', StagedProposalProcessor.abi)
        .returns([{ parsed: 'sppLog', txLog: 'tx3' }] as any)

      const parseInfoStub = sandbox
        .stub(Web3Helper, 'parseInfoLog')
        .withArgs('tx1', 'MultisigSettingsUpdated', info.network)
        .returns('multisigInfo' as any)
        .withArgs('tx2', 'VotingSettingsUpdated', info.network)
        .returns('votingInfo' as any)
        .withArgs('tx3', 'StagesUpdated', info.network)
        .returns('sppInfo' as any)

      const multisigStub = sandbox.stub(PluginSettingHandler, 'multisigSettingsUpdated').resolves({
        address: '0xmultisig-plugin',
      } as any)
      const votingStub = sandbox.stub(PluginSettingHandler, 'votingSettingsUpdated').resolves({
        address: '0xvoting-plugin',
      } as any)
      const sppStub = sandbox.stub(PluginSettingHandler, 'sppSettingsUpdated').resolves({
        address: '0xspp-plugin',
      } as any)

      const result = await PluginSettingHandler.handleFromReceipt(txReceipt as any, info as any)

      expect(multisigLogsStub.calledOnce).to.be.true
      expect(parseInfoStub.calledOnce).to.be.true

      expect(multisigStub.calledOnceWith('multisigLog' as any, 'multisigInfo' as any)).to.be.true
      expect(votingStub.calledOnceWith('votingLog' as any, 'votingInfo' as any)).to.be.true
      expect(sppStub.calledOnceWith('sppLog' as any, 'sppInfo' as any)).to.be.true

      expect(result).to.deep.equal([
        { address: '0xmultisig-plugin' },
        { address: '0xvoting-plugin' },
        { address: '0xspp-plugin' },
      ])
    })

    it('should return an empty array if no logs are found', async () => {
      const txReceipt = { logs: [] } as any
      const info = {
        network: NetworksEnum.ethereumMainnet,
        transactionHash: '0x123',
        blockNumber: 1,
      }

      sandbox.stub(Web3Helper, 'findLogsByName').returns([]) // No logs
      const multisigStub = sandbox.stub(PluginSettingHandler, 'multisigSettingsUpdated').resolves(undefined)
      const votingStub = sandbox.stub(PluginSettingHandler, 'votingSettingsUpdated').resolves(undefined)
      const sppStub = sandbox.stub(PluginSettingHandler, 'sppSettingsUpdated').resolves(undefined)

      const result = await PluginSettingHandler.handleFromReceipt(txReceipt as any, info as any)

      expect(result).to.deep.equal([])
      expect(multisigStub.notCalled).to.be.true
      expect(votingStub.notCalled).to.be.true
      expect(sppStub.notCalled).to.be.true
    })
  })

  describe('votingSettingsUpdated', () => {
    it('should return if plugin not found', async () => {
      const parsedEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }
      const info = {
        address: '0x456',
        transactionHash: '0x789',
        blockNumber: 1,
        transactionIndex: 1,
        logIndex: 1,
        network: NetworksEnum.ethereumMainnet,
      }
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress').resolves(false)
      const stubLogger = sandbox.stub(logger, 'warn')
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.GovernanceERC20,
      } as any)
      await PluginSettingHandler.votingSettingsUpdated(parsedEvent as any, info as any)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Plugin not found' as any)).to.be.true
      expect(saveAndGetTokenStub.calledOnce).to.be.false
    })

    it('should return if already existing log', async () => {
      const parsedEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }
      const info = {
        address: '0x456',
        transactionHash: '0x789',
        blockNumber: 1,
        transactionIndex: 1,
        logIndex: 1,
        network: NetworksEnum.ethereumMainnet,
      }
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress').resolves(true)
      const stubFindExistingLog = sandbox.stub(Models.Setting, 'findExistingLog').resolves(true)

      await PluginSettingHandler.votingSettingsUpdated(parsedEvent as any, info as any)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
    })

    it('should handle votingSettingsUpdated', async () => {
      const parsedEvent = {
        args: {
          votingMode: 2n,
          supportThreshold: 150n,
          minParticipation: 222n,
          minDuration: 1312312125n,
          minProposerVotingPower: 10n,
        },
      }
      const info = {
        address: '0x456',
        transactionHash: '0x789',
        blockNumber: 1,
        transactionIndex: 1,
        logIndex: 1,
        network: NetworksEnum.ethereumMainnet,
      }
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress').resolves(true)
      const stubFindExistingLog = sandbox.stub(Models.Setting, 'findExistingLog').resolves(false)
      const stubFindActive = sandbox.stub(Models.Setting, 'findActive').resolves(false)
      const stubLogger = sandbox.stub(logger, 'verbose')
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123123123)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.GovernanceERC20,
      } as any)
      const isSupportedStub = sandbox.stub(PluginSettingHandler, 'isSupported').resolves()
      await PluginSettingHandler.votingSettingsUpdated(parsedEvent as any, info as any)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
      expect(stubFindActive.calledOnce).to.be.true
      expect(
        stubFindActive.calledOnceWith({
          network: NetworksEnum.ethereumMainnet,
          pluginAddress: '0x456',
        }),
      ).to.be.true

      expect(stubLogger.calledOnce).to.be.true
      expect(getBlockTimestampStub.calledOnce).to.be.true
      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(isSupportedStub.calledOnce).to.be.true
    })

    it('should update active plugin setting to inactive', async () => {
      const parsedEvent = {
        args: {
          votingMode: 2n,
          supportThreshold: 150n,
          minParticipation: 222n,
          minDuration: 1312312125n,
          minProposerVotingPower: 10n,
        },
      }
      const info = {
        address: '0x456',
        transactionHash: '0x789',
        blockNumber: 1,
        network: NetworksEnum.ethereumMainnet,
      }

      const activeSetting = { id: 'active-setting-id' }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves({ daoAddress: '0xdao', tokenAddress: '0xtoken' } as any)
      sandbox.stub(Models.Setting, 'findExistingLog').resolves(false)
      sandbox.stub(Models.Setting, 'findActive').resolves(activeSetting)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123123123)
      const createDocumentStub = sandbox.stub(DbOperations, 'createDocument').resolves()
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ type: ITokenType.GovernanceERC20 } as any)

      const isSupportedStub = sandbox.stub(PluginSettingHandler, 'isSupported').resolves()

      await PluginSettingHandler.votingSettingsUpdated(parsedEvent as any, info as any)

      expect(createDocumentStub.calledOnce).to.be.true
      expect(updateDocumentStub.calledOnce).to.be.true
      expect(
        updateDocumentStub.calledWith(
          activeSetting,
          { inactiveAtBlockNumber: 1, status: ISettingStatus.inactive },
          { logId: 'active-setting-id', info },
          'Update tokenVoting inactive plugin',
        ),
      ).to.be.true
      expect(isSupportedStub.calledOnce).to.be.true
    })

    it('should not call isSupported if tokenDb is null', async () => {
      const parsedEvent = {
        args: {
          votingMode: 2n,
          supportThreshold: 150n,
          minParticipation: 222n,
          minDuration: 1312312125n,
          minProposerVotingPower: 10n,
        },
      }
      const info = {
        address: '0x456',
        transactionHash: '0x789',
        blockNumber: 1,
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves({ daoAddress: '0xdao', tokenAddress: '0xtoken' } as any)
      sandbox.stub(Models.Setting, 'findExistingLog').resolves(false)
      sandbox.stub(Models.Setting, 'findActive').resolves(false)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123123123)
      sandbox.stub(DbOperations, 'createDocument').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)

      const isSupportedStub = sandbox.stub(PluginSettingHandler, 'isSupported')

      await PluginSettingHandler.votingSettingsUpdated(parsedEvent as any, info as any)

      expect(isSupportedStub.notCalled).to.be.true
    })
  })

  describe('multisigSettingsUpdated', () => {
    it('should return if plugin not found', async () => {
      const parsedEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }
      const info = {
        address: '0x456',
        transactionHash: '0x789',
        blockNumber: 1,
        transactionIndex: 1,
        logIndex: 1,
        network: NetworksEnum.ethereumMainnet,
      }
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress').resolves(false)
      const stubLogger = sandbox.stub(logger, 'warn')

      await PluginSettingHandler.multisigSettingsUpdated(parsedEvent as any, info as any)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Plugin not found' as any)).to.be.true
    })

    it('should return if already existing log', async () => {
      const parsedEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }
      const info = {
        address: '0x456',
        transactionHash: '0x789',
        blockNumber: 1,
        transactionIndex: 1,
        logIndex: 1,
        network: NetworksEnum.ethereumMainnet,
      }
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress').resolves(true)
      const stubFindExistingLog = sandbox.stub(Models.Setting, 'findExistingLog').resolves(true)

      await PluginSettingHandler.multisigSettingsUpdated(parsedEvent as any, info as any)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
    })

    it('should handle multisigSettingsUpdated', async () => {
      const parsedEvent = {
        args: {
          onlyListed: true,
          minApprovals: 3n,
        },
      }
      const info = {
        address: '0x456',
        transactionHash: '0x789',
        blockNumber: 1,
        transactionIndex: 1,
        logIndex: 1,
        network: NetworksEnum.ethereumMainnet,
      }
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        update: sandbox.stub(),
      })
      const stubFindExistingLog = sandbox.stub(Models.Setting, 'findExistingLog').resolves(false)
      const stubFindActive = sandbox.stub(Models.Setting, 'findActive').resolves(false)
      const stubLogger = sandbox.stub(logger, 'verbose')

      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123123123)
      const stubIsSupported = sandbox.stub(PluginSettingHandler, 'isSupported').resolves()

      await PluginSettingHandler.multisigSettingsUpdated(parsedEvent as any, info as any)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
      expect(stubFindActive.calledOnce).to.be.true
      expect(
        stubFindActive.calledOnceWith({
          network: NetworksEnum.ethereumMainnet,
          pluginAddress: '0x456',
        }),
      ).to.be.true

      expect(stubLogger.calledOnce).to.be.true
      expect(getBlockTimestampStub.calledOnce).to.be.true
      expect(stubIsSupported.calledOnce).to.be.true
    })

    it('should update active multisig setting to inactive and mark plugin as supported', async () => {
      const parsedEvent = {
        args: { onlyListed: true, minApprovals: 3n },
      }
      const info = {
        address: '0x456',
        transactionHash: '0x789',
        blockNumber: 1,
        network: NetworksEnum.ethereumMainnet,
      }

      const activeSetting = { id: 'active-setting-id' }
      const relatedPlugin = { daoAddress: '0xdao', isSupported: false, id: 'plugin-id' }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(relatedPlugin)
      sandbox.stub(Models.Setting, 'findExistingLog').resolves(false)
      sandbox.stub(Models.Setting, 'findActive').resolves(activeSetting)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123123123)

      const createDocumentStub = sandbox.stub(DbOperations, 'createDocument').resolves()
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()

      await PluginSettingHandler.multisigSettingsUpdated(parsedEvent as any, info as any)

      expect(createDocumentStub.calledOnce).to.be.true
      expect(updateDocumentStub.calledTwice).to.be.true
      expect(
        updateDocumentStub.firstCall.calledWith(
          activeSetting,
          { inactiveAtBlockNumber: 1, status: ISettingStatus.inactive },
          { logId: 'active-setting-id', info },
          'Update multisig inactive plugin',
        ),
      ).to.be.true

      expect(
        updateDocumentStub.secondCall.calledWith(
          relatedPlugin,
          { isSupported: true },
          { logId: 'plugin-id', info },
          'Update plugin isSupported',
        ),
      ).to.be.true
    })
  })
})
