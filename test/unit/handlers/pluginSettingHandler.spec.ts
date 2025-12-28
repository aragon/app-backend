import { Models } from '@dbModels'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import GovernanceVeHelper from '@helpers/governanceVe'
import MultisigHelper from '@helpers/multisig'
import PluginDetector from '@helpers/pluginDetector'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import DbOperations from '@models/utils/dbOperations'
import { ProxyToken } from '@modules/proxyToken'
import {
  ILogInfo,
  IPluginInterfaceType,
  ISettingStatus,
  ITokenType,
  NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'
import { expect } from 'chai'
import { beforeEach } from 'mocha'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Indexer: PluginSettingHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('handlePluginSettingByType', () => {
    it('should process tokenVoting settings log', async () => {
      const txReceipt = { logs: [{ topics: ['0xvoting'], data: '0x02' }] } as any
      const plugin = {
        address: '0xplugin',
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xtoken',
      } as any
      const info = { network: NetworksEnum.ethereumMainnet } as any

      sandbox
        .stub(Web3Utils, 'findLogsByName')
        .returns([{ parsed: 'votingLog', txLog: { address: '0xplugin' } }] as any)
      sandbox.stub(Web3Utils, 'parseInfoLog').returns('votingInfo' as any)
      const votingStub = sandbox
        .stub(PluginSettingHandler, 'votingSettingsUpdated')
        .resolves({ address: '0xvoting-plugin' } as any)

      const result = await PluginSettingHandler.handlePluginSettingByType(plugin, txReceipt, info)

      expect(votingStub.calledOnceWith('votingLog' as any, 'votingInfo' as any)).to.be.true
      expect(result).to.deep.equal({ address: '0xvoting-plugin' })
    })

    it('should process multisig settings log', async () => {
      const txReceipt = { logs: [{ topics: ['0xmultisig'], data: '0x01' }] } as any
      const plugin = { address: '0xplugin', interfaceType: IPluginInterfaceType.multisig } as any
      const info = { network: NetworksEnum.ethereumMainnet } as any

      sandbox.stub(Web3Utils, 'findLogsByName').returns([
        {
          parsed: 'multisigLog',
          txLog: { address: '0xplugin' },
        },
      ] as any)
      sandbox.stub(Web3Utils, 'parseInfoLog').returns('multisigInfo' as any)
      const multisigStub = sandbox
        .stub(PluginSettingHandler, 'multisigSettingsUpdated')
        .resolves({ address: '0xmultisig-plugin' } as any)

      const result = await PluginSettingHandler.handlePluginSettingByType(plugin, txReceipt, info)

      expect(multisigStub.calledOnceWith('multisigLog' as any, 'multisigInfo' as any)).to.be.true
      expect(result).to.deep.equal({ address: '0xmultisig-plugin' })
    })

    it('should process multisig v2 settings log', async () => {
      const txReceipt = { logs: [{ topics: ['0xmultisig'], data: '0x01' }] } as any
      const plugin = { address: '0xplugin', interfaceType: IPluginInterfaceType.multisig } as any
      const info = { network: NetworksEnum.ethereumMainnet } as any

      sandbox
        .stub(Web3Utils, 'findLogsByName')
        .onFirstCall()
        .returns([])
        .onSecondCall()
        .returns([
          {
            parsed: 'multisigLog',
            txLog: { address: '0xplugin' },
          } as any,
        ])
      sandbox.stub(Web3Utils, 'parseInfoLog').returns('multisigInfo' as any)
      const multisigStub = sandbox
        .stub(PluginSettingHandler, 'multisigSettingsUpdated')
        .resolves({ address: '0xmultisig-plugin' } as any)

      const result = await PluginSettingHandler.handlePluginSettingByType(plugin, txReceipt, info)

      expect(multisigStub.calledOnceWith('multisigLog' as any, 'multisigInfo' as any)).to.be.true
      expect(result).to.deep.equal({ address: '0xmultisig-plugin' })
    })

    it('should process spp settings log', async () => {
      const txReceipt = { logs: [{ topics: ['0xspp'], data: '0x03' }] } as any
      const plugin = { address: '0xplugin', interfaceType: IPluginInterfaceType.spp } as any
      const info = { network: NetworksEnum.ethereumMainnet } as any

      sandbox.stub(Web3Utils, 'findLogsByName').returns([{ parsed: 'sppLog', txLog: { address: '0xplugin' } }] as any)
      sandbox.stub(Web3Utils, 'parseInfoLog').returns('sppInfo' as any)
      const sppStub = sandbox
        .stub(PluginSettingHandler, 'sppSettingsUpdated')
        .resolves({ address: '0xspp-plugin' } as any)

      const result = await PluginSettingHandler.handlePluginSettingByType(plugin, txReceipt, info)

      expect(sppStub.calledOnceWith('sppLog' as any, 'sppInfo' as any)).to.be.true
      expect(result).to.deep.equal({ address: '0xspp-plugin' })
    })

    it('should process lockToVote settings log', async () => {
      const txReceipt = { logs: [{ topics: ['0xlockToVote'], data: '0x04' }] } as any
      const plugin = {
        address: '0xplugin',
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0xlockManager123',
      } as any
      const info = { network: NetworksEnum.ethereumMainnet } as any

      sandbox
        .stub(Web3Utils, 'findLogsByName')
        .returns([{ parsed: 'lockToVoteLog', txLog: { address: '0xplugin' } }] as any)
      sandbox.stub(Web3Utils, 'parseInfoLog').returns('lockToVoteInfo' as any)
      const lockToVoteStub = sandbox
        .stub(PluginSettingHandler, 'lockToVoteSettingsUpdated')
        .resolves({ address: '0xlockToVote-plugin' } as any)

      const result = await PluginSettingHandler.handlePluginSettingByType(plugin, txReceipt, info)

      expect(lockToVoteStub.calledOnceWith('lockToVoteLog' as any, 'lockToVoteInfo' as any)).to.be.true
      expect(result).to.deep.equal({ address: '0xlockToVote-plugin' })
    })

    it('should process not a supported type', async () => {
      const txReceipt = { logs: [{ topics: ['0xspp'], data: '0x03' }] } as any
      const plugin = { address: '0xplugin', interfaceType: IPluginInterfaceType.unknown } as any
      const info = { network: NetworksEnum.ethereumMainnet } as any

      const stubFind = sandbox.stub(Web3Utils, 'findLogsByName')

      const result = await PluginSettingHandler.handlePluginSettingByType(plugin, txReceipt, info)

      expect(result).to.be.undefined
      expect(stubFind.notCalled).to.be.true
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
        type: ITokenType.ERC20,
        isGovernance: true,
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
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0x123',
      })
      const stubFindExistingLog = sandbox.stub(Models.Setting, 'findExistingLog').resolves(true)

      await PluginSettingHandler.votingSettingsUpdated(parsedEvent as any, info as any)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
    })

    it('should return if the plugin is not supported when votingSettingsUpdated', async () => {
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
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.unknown,
        tokenAddress: '0x123',
      })
      const stubFindExistingLog = sandbox.stub(Models.Setting, 'findExistingLog').resolves(false)
      const stubFindActive = sandbox.stub(Models.Setting, 'findActive').resolves(false)
      const stubWarn = sandbox.stub(logger, 'warn')
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123123123)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC20,
        isGovernance: true,
      } as any)
      const isSupportedStub = sandbox.stub(PluginSettingHandler, 'isSupported').resolves()
      await PluginSettingHandler.votingSettingsUpdated(parsedEvent as any, info as any)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.false
      expect(stubFindActive.calledOnce).to.be.false
      expect(
        stubFindActive.calledOnceWith({
          network: NetworksEnum.ethereumMainnet,
          pluginAddress: '0x456',
        }),
      ).to.be.false

      expect(stubWarn.calledOnceWith('Plugin is not a token voting' as any)).to.be.true
      expect(getBlockTimestampStub.calledOnce).to.be.false
      expect(saveAndGetTokenStub.calledOnce).to.be.false
      expect(isSupportedStub.calledOnce).to.be.false
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
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0x123',
        votingEscrow: {},
      })
      const stubFindExistingLog = sandbox.stub(Models.Setting, 'findExistingLog').resolves(false)
      const stubFindActive = sandbox.stub(Models.Setting, 'findActive').resolves(false)
      const stubLogger = sandbox.stub(logger, 'verbose')
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123123123)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.ERC20,
        isGovernance: true,
      } as any)
      const votingEscrowSettingsStub = sandbox.stub(PluginSettingHandler, 'votingEscrowSettings').resolves({
        minDeposit: '100',
        minLockTime: 3600,
        cooldown: 3600,
        maxTime: 7200,
        slope: '0.1',
        bias: '1000',
        feePercent: '1000',
        minFeePercent: '500',
        minCooldown: 1800,
      })
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
      expect(votingEscrowSettingsStub.calledOnce).to.be.true

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

      sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xdao',
        tokenAddress: '0xtoken',
        interfaceType: IPluginInterfaceType.tokenVoting,
      } as any)
      sandbox.stub(Models.Setting, 'findExistingLog').resolves(false)
      sandbox.stub(Models.Setting, 'findActive').resolves(activeSetting)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123123123)
      const createDocumentStub = sandbox.stub(DbOperations, 'createDocument').resolves()
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ type: ITokenType.ERC20, isGovernance: true } as any)

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

      sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xdao',
        tokenAddress: '0xtoken',
        interfaceType: IPluginInterfaceType.tokenVoting,
      } as any)
      sandbox.stub(Models.Setting, 'findExistingLog').resolves(false)
      sandbox.stub(Models.Setting, 'findActive').resolves(false)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123123123)
      sandbox.stub(DbOperations, 'createDocument').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)
      const stubError = sandbox.stub(logger, 'error')

      const isSupportedStub = sandbox.stub(PluginSettingHandler, 'isSupported')

      await PluginSettingHandler.votingSettingsUpdated(parsedEvent as any, info as any)

      expect(isSupportedStub.notCalled).to.be.true
      expect(stubError.calledOnceWith('votingSettingsUpdated token not found' as any)).to.be.true
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

      sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xdao',
        tokenAddress: '0xtoken',
        interfaceType: IPluginInterfaceType.tokenVoting,
      } as any)
      sandbox.stub(Models.Setting, 'findExistingLog').resolves(false)
      sandbox.stub(Models.Setting, 'findActive').resolves(false)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123123123)
      sandbox.stub(DbOperations, 'createDocument').resolves()
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)
      const stubError = sandbox.stub(logger, 'error')

      const isSupportedStub = sandbox.stub(PluginSettingHandler, 'isSupported')

      await PluginSettingHandler.votingSettingsUpdated(parsedEvent as any, info as any)

      expect(isSupportedStub.notCalled).to.be.true
      expect(stubError.calledOnceWith('votingSettingsUpdated token not found' as any)).to.be.true
    })
  })

  describe('lockToVoteSettingsUpdated', () => {
    it('should return if plugin not found', async () => {
      const parsedEvent = {
        args: {
          votingMode: 2n,
          supportThresholdRatio: 150n,
          minParticipationRatio: 222n,
          minApprovalRatio: 100n,
          proposalDuration: 1312312125n,
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
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      const stubLogger = sandbox.stub(logger, 'warn')

      await PluginSettingHandler.lockToVoteSettingsUpdated(parsedEvent as any, info as any)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Plugin not found' as any)).to.be.true
    })

    it('should return if plugin is not lockToVote type', async () => {
      const parsedEvent = {
        args: {
          votingMode: 2n,
          supportThresholdRatio: 150n,
          minParticipationRatio: 222n,
          minApprovalRatio: 100n,
          proposalDuration: 1312312125n,
          minProposerVotingPower: 10n,
        },
      }
      const info = {
        address: '0x456',
        transactionHash: '0x789',
        blockNumber: 1,
        network: NetworksEnum.ethereumMainnet,
      }
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.tokenVoting,
        lockManagerAddress: '0xlockManager123',
      })
      const stubLogger = sandbox.stub(logger, 'warn')

      await PluginSettingHandler.lockToVoteSettingsUpdated(parsedEvent as any, info as any)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Plugin is not a lockToVote' as any)).to.be.true
    })

    it('should return if plugin has no lockManagerAddress', async () => {
      const parsedEvent = {
        args: {
          votingMode: 2n,
          supportThresholdRatio: 150n,
          minParticipationRatio: 222n,
          minApprovalRatio: 100n,
          proposalDuration: 1312312125n,
          minProposerVotingPower: 10n,
        },
      }
      const info = {
        address: '0x456',
        transactionHash: '0x789',
        blockNumber: 1,
        network: NetworksEnum.ethereumMainnet,
      }
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: null,
      })
      const stubLogger = sandbox.stub(logger, 'warn')

      await PluginSettingHandler.lockToVoteSettingsUpdated(parsedEvent as any, info as any)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Plugin is not a lockToVote' as any)).to.be.true
    })

    it('should return if already existing log', async () => {
      const parsedEvent = {
        args: {
          votingMode: 2n,
          supportThresholdRatio: 150n,
          minParticipationRatio: 222n,
          minApprovalRatio: 100n,
          proposalDuration: 1312312125n,
          minProposerVotingPower: 10n,
        },
      }
      const info = {
        address: '0x456',
        transactionHash: '0x789',
        blockNumber: 1,
        network: NetworksEnum.ethereumMainnet,
      }
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0xlockManager123',
      })
      const stubFindExistingLog = sandbox.stub(Models.Setting, 'findExistingLog').resolves(true)

      await PluginSettingHandler.lockToVoteSettingsUpdated(parsedEvent as any, info as any)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
    })

    it('should handle lockToVoteSettingsUpdated and create new setting', async () => {
      const parsedEvent = {
        args: {
          votingMode: 2n,
          supportThresholdRatio: 150n,
          minParticipationRatio: 222n,
          minApprovalRatio: 100n,
          proposalDuration: 1312312125n,
          minProposerVotingPower: 10n,
        },
      }
      const info = {
        address: '0x456',
        transactionHash: '0x789',
        blockNumber: 1,
        network: NetworksEnum.ethereumMainnet,
      }

      const relatedPlugin = {
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0xlockManager123',
        daoAddress: '0xdao123',
        subdomain: 'test.dao',
        tokenAddress: '0xtoken123',
      }

      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress').resolves(relatedPlugin)
      const stubFindExistingLog = sandbox.stub(Models.Setting, 'findExistingLog').resolves(false)
      const stubFindActive = sandbox.stub(Models.Setting, 'findActive').resolves(false)
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123123123)
      const createDocumentStub = sandbox.stub(DbOperations, 'createDocument').resolves()
      const isSupportedStub = sandbox.stub(PluginSettingHandler, 'isSupported').resolves()
      const stubFindSppPlugin = sandbox.stub(Models.Plugin, 'findOne').resolves(null)

      await PluginSettingHandler.lockToVoteSettingsUpdated(parsedEvent as any, info as any)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
      expect(stubFindActive.calledOnce).to.be.true
      expect(getBlockTimestampStub.calledOnce).to.be.true
      expect(isSupportedStub.calledOnce).to.be.true
      expect(stubFindSppPlugin.calledOnce).to.be.true

      expect(createDocumentStub.calledOnce).to.be.true
      const settingData = createDocumentStub.firstCall.args[1]
      expect(settingData.votingMode).to.eq(2)
      expect(settingData.supportThreshold).to.eq(150)
      expect(settingData.minParticipation).to.eq(222)
      expect(settingData.approvalThreshold).to.eq(100)
      expect(settingData.minDuration).to.eq(1312312125)
      expect(settingData.minProposerVotingPower).to.eq('10')
      expect(settingData.status).to.eq(ISettingStatus.active)
      expect(settingData.daoAddress).to.eq('0xdao123')
      expect(settingData.pluginAddress).to.eq('0x456')
      expect(settingData.tokenAddress).to.eq('0xtoken123')
    })

    it('should update active plugin setting to inactive when creating new lockToVote setting', async () => {
      const parsedEvent = {
        args: {
          votingMode: 1n,
          supportThresholdRatio: 200n,
          minParticipationRatio: 300n,
          minApprovalRatio: 150n,
          proposalDuration: 86400n,
          minProposerVotingPower: 100n,
        },
      }
      const info = {
        address: '0x456',
        transactionHash: '0x789',
        blockNumber: 1,
        network: NetworksEnum.ethereumMainnet,
      }

      const relatedPlugin = {
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0xlockManager123',
        daoAddress: '0xdao123',
        subdomain: 'test.dao',
        tokenAddress: '0xtoken123',
      }

      const activeSetting = { id: 'active-setting-id' }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(relatedPlugin)
      sandbox.stub(Models.Setting, 'findExistingLog').resolves(false)
      sandbox.stub(Models.Setting, 'findActive').resolves(activeSetting)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123123123)
      const createDocumentStub = sandbox.stub(DbOperations, 'createDocument').resolves()
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      sandbox.stub(PluginSettingHandler, 'isSupported').resolves()
      sandbox.stub(Models.Plugin, 'findOne').resolves(null)

      await PluginSettingHandler.lockToVoteSettingsUpdated(parsedEvent as any, info as any)

      expect(createDocumentStub.calledOnce).to.be.true
      expect(updateDocumentStub.calledOnce).to.be.true
      expect(
        updateDocumentStub.calledWith(
          activeSetting,
          { inactiveAtBlockNumber: 1, status: ISettingStatus.inactive },
          { logId: 'active-setting-id', info },
          'Update lockToVote inactive plugin',
        ),
      ).to.be.true
    })

    it('should handle SPP plugin pairing for lockToVote settings', async () => {
      const parsedEvent = {
        args: {
          votingMode: 1n,
          supportThresholdRatio: 200n,
          minParticipationRatio: 300n,
          minApprovalRatio: 150n,
          proposalDuration: 86400n,
          minProposerVotingPower: 100n,
        },
      }
      const info = {
        address: '0xlockToVotePlugin',
        transactionHash: '0x789',
        blockNumber: 1,
        network: NetworksEnum.ethereumMainnet,
      }

      const relatedPlugin = {
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0xlockManager123',
        daoAddress: '0xdao123',
        subdomain: 'test.dao',
        tokenAddress: '0xtoken123',
      }

      const sppPlugin = {
        address: '0xsppPlugin',
        interfaceType: IPluginInterfaceType.spp,
      }

      const sppSettings = {
        id: 'spp-settings-id',
        stages: [],
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(relatedPlugin)
      sandbox.stub(Models.Setting, 'findExistingLog').resolves(false)
      sandbox
        .stub(Models.Setting, 'findActive')
        .onFirstCall()
        .resolves(false) // for lockToVote plugin
        .onSecondCall()
        .resolves(sppSettings) // for SPP plugin
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123123123)
      sandbox.stub(DbOperations, 'createDocument').resolves()
      sandbox.stub(PluginSettingHandler, 'isSupported').resolves()
      sandbox.stub(Models.Plugin, 'findOne').resolves(sppPlugin)
      const pairSppPluginsStub = sandbox.stub(PluginSettingHandler, 'pairSppPlugins').resolves()

      await PluginSettingHandler.lockToVoteSettingsUpdated(parsedEvent as any, info as any)

      expect(pairSppPluginsStub.calledOnceWith(sppPlugin, sppSettings, info)).to.be.true
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
      const stubSettings = sandbox.stub(MultisigHelper, 'findSettings').resolves({
        minApprovals: 1,
        onlyListed: true,
      })

      await PluginSettingHandler.multisigSettingsUpdated(parsedEvent as any, info as any)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
      expect(stubFindActive.calledOnce).to.be.true
      expect(stubSettings.calledOnceWith(info.address, info.network)).to.be.true
      expect(
        stubFindActive.calledOnceWith({
          network: NetworksEnum.ethereumMainnet,
          pluginAddress: info.address,
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
      const stubSettings = sandbox.stub(MultisigHelper, 'findSettings').resolves({
        minApprovals: 1,
        onlyListed: true,
      })

      await PluginSettingHandler.multisigSettingsUpdated(parsedEvent as any, info as any)

      expect(createDocumentStub.calledOnce).to.be.true
      expect(updateDocumentStub.calledTwice).to.be.true
      expect(stubSettings.calledOnceWith(info.address, info.network)).to.be.true
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

  describe('sppSettingsUpdated', () => {
    it('should return if the plugin is not found', async () => {
      const parsedEvent = { args: { stages: [] } } as any
      const info = { address: '0xplugin', network: NetworksEnum.ethereumMainnet } as any

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      const loggerStub = sandbox.stub(logger, 'warn')

      const result = await PluginSettingHandler.sppSettingsUpdated(parsedEvent, info)

      expect(loggerStub.calledOnceWith('Plugin not found' as any)).to.be.true
      expect(result).to.be.undefined
    })

    it('should return if an existing log is found', async () => {
      const parsedEvent = { args: { stages: [] } } as any
      const info = { transactionHash: '0x123', address: '0xplugin', network: NetworksEnum.ethereumMainnet } as any

      sandbox.stub(Models.Plugin, 'findByAddress').resolves({ address: '0xplugin' } as any)
      sandbox.stub(Models.Setting, 'findExistingLog').resolves(true)
      const createDocumentStub = sandbox.stub(DbOperations, 'createDocument')

      const result = await PluginSettingHandler.sppSettingsUpdated(parsedEvent, info)

      expect(createDocumentStub.notCalled).to.be.true
      expect(result).to.be.undefined
    })

    it('should handle metadata stage names and create a new setting', async () => {
      const parsedEvent = {
        args: {
          stages: [
            {
              minAdvance: 10,
              maxAdvance: 20,
              approvalThreshold: 50,
              vetoThreshold: 60,
              cancelable: true,
              plugins: [{ address: '0xsub-plugin', isManual: false, allowedBody: true, proposalType: 1 }],
            },
          ],
        },
      } as any

      const info = {
        address: '0xplugin',
        transactionHash: '0x123',
        blockNumber: 1,
        network: NetworksEnum.ethereumMainnet,
      } as any

      const plugin = {
        address: '0xplugin',
        daoAddress: '0xdao',
        subdomain: 'sub.plugin',
        tokenAddress: '0xtoken',
      } as any

      const sppMetadata = {
        stageNames: ['Stage 1'],
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin)
      sandbox.stub(Models.Setting, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findActive').resolves({ id: 'active-setting-id' })
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)
      sandbox.stub(Models.LogMetadata, 'getLatestMetadata').resolves(sppMetadata)

      const createDocumentStub = sandbox.stub(DbOperations, 'createDocument').resolves({ id: 'new-setting-id' })
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      const pairSppPluginsStub = sandbox.stub(PluginSettingHandler, 'pairSppPlugins').resolves()
      const isSupportedStub = sandbox.stub(PluginSettingHandler, 'isSupported').resolves()

      const result = await PluginSettingHandler.sppSettingsUpdated(parsedEvent, info)

      expect(createDocumentStub.args[0][3]).to.eq('New Setting - sppSettingsUpdated')
      expect(updateDocumentStub.args[0][3]).to.eq('Update SPP inactive plugin')
      expect(pairSppPluginsStub.calledOnce).to.be.true
      expect(isSupportedStub.calledOnce).to.be.true
      expect(result).to.deep.equal(plugin)
    })

    it('should detect and add address type to plugins in SPP stages', async () => {
      const parsedEvent = {
        args: {
          stages: [
            {
              minAdvance: 10,
              maxAdvance: 20,
              approvalThreshold: 50,
              vetoThreshold: 60,
              cancelable: true,
              plugins: [
                { pluginAddress: '0xsafe-address', isManual: false, allowedBody: true, proposalType: 1 },
                { pluginAddress: '0xeoa-address', isManual: true, allowedBody: false, proposalType: 2 },
                { pluginAddress: '0xother-address', isManual: false, allowedBody: true, proposalType: 3 },
              ],
            },
          ],
        },
      } as any

      const info = {
        address: '0xplugin',
        transactionHash: '0x123',
        blockNumber: 1,
        network: NetworksEnum.ethereumMainnet,
      } as any

      const plugin = {
        address: '0xplugin',
        daoAddress: '0xdao',
        subdomain: 'sub.plugin',
        tokenAddress: '0xtoken',
      } as any

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin)
      sandbox.stub(Models.Setting, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findActive').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)
      sandbox.stub(Models.LogMetadata, 'getLatestMetadata').resolves(null)

      const detectAddressTypeStub = sandbox.stub(PluginDetector, 'detectAddressType')
      detectAddressTypeStub.withArgs('0xsafe-address', info.network).resolves(VotingBodyBrandIdentity.SAFE)
      detectAddressTypeStub.withArgs('0xeoa-address', info.network).resolves(VotingBodyBrandIdentity.EOA)
      detectAddressTypeStub.withArgs('0xother-address', info.network).resolves(VotingBodyBrandIdentity.OTHER)

      const createDocumentStub = sandbox.stub(DbOperations, 'createDocument')
      sandbox.stub(PluginSettingHandler, 'pairSppPlugins').resolves()
      sandbox.stub(PluginSettingHandler, 'isSupported').resolves()

      await PluginSettingHandler.sppSettingsUpdated(parsedEvent, info)

      expect(detectAddressTypeStub.callCount).to.equal(3)

      expect(createDocumentStub.calledOnce).to.be.true
      const savedSettings = createDocumentStub.firstCall.args[1]
      expect(savedSettings.stages).to.have.length(1)
      expect(savedSettings.stages[0].plugins).to.have.length(3)

      expect(savedSettings.stages[0].plugins[0].brandId).to.equal(VotingBodyBrandIdentity.SAFE)
      expect(savedSettings.stages[0].plugins[1].brandId).to.equal(VotingBodyBrandIdentity.EOA)
      expect(savedSettings.stages[0].plugins[2].brandId).to.equal(VotingBodyBrandIdentity.OTHER)
    })
  })

  describe('formatSppSetings', () => {
    it('should format SPP settings correctly', () => {
      const inputStages = [
        {
          minAdvance: '10',
          maxAdvance: '20',
          stageDuration: '30',
          approvalThreshold: '50',
          vetoThreshold: '60',
          cancelable: true,
          editable: false,
          plugins: [
            { pluginAddress: '0xplugin1', isManual: true, allowedBody: true, resultType: '1' },
            { pluginAddress: '0xplugin2', isManual: false, tryAdvance: false, proposalType: '2' },
          ],
        },
        {
          minAdvance: '15',
          maxAdvance: '25',
          voteDuration: '35',
          approvalThreshold: '55',
          vetoThreshold: '65',
          cancelable: false,
          editable: true,
          plugins: [{ addr: '0xplugin3', isManual: true, resultType: '3' }],
        },
      ]

      const result = PluginSettingHandler.formatSppSetings(inputStages)

      expect(result).to.deep.equal([
        {
          stageIndex: 0,
          minAdvance: 10,
          maxAdvance: 20,
          voteDuration: 30,
          approvalThreshold: 50,
          vetoThreshold: 60,
          cancelable: true,
          editable: false,
          plugins: [
            { address: '0xplugin1', isManual: true, allowedBody: true, proposalType: 1 },
            { address: '0xplugin2', isManual: false, allowedBody: false, proposalType: 2 },
          ],
        },
        {
          stageIndex: 1,
          minAdvance: 15,
          maxAdvance: 25,
          voteDuration: 35,
          approvalThreshold: 55,
          vetoThreshold: 65,
          cancelable: false,
          editable: true,
          plugins: [{ address: '0xplugin3', isManual: true, allowedBody: undefined, proposalType: 3 }],
        },
      ])
    })
  })

  describe('updateStageNamesOnSppSettings', () => {
    it('should return if an existing log is found', async () => {
      const plugin = { address: '0xplugin-address' } as any
      const stageNames = ['Stage 1', 'Stage 2']
      const info = { transactionHash: '0x123', network: NetworksEnum.ethereumMainnet } as any

      sandbox.stub(Models.Setting, 'findExistingLog').resolves({} as any)
      const findActiveStub = sandbox.stub(Models.Setting, 'findActive')
      const createDocumentStub = sandbox.stub(DbOperations, 'createDocument')
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument')

      await PluginSettingHandler.updateStageNamesOnSppSettings(plugin, stageNames, info)

      expect(findActiveStub.notCalled).to.be.true
      expect(createDocumentStub.notCalled).to.be.true
      expect(updateDocumentStub.notCalled).to.be.true
    })

    it('should return if no active plugin setting is found', async () => {
      const plugin = { address: '0xplugin-address' } as any
      const stageNames = ['Stage 1', 'Stage 2']
      const info = { transactionHash: '0x123', network: NetworksEnum.ethereumMainnet } as any

      sandbox.stub(Models.Setting, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findActive').resolves(null)
      const createDocumentStub = sandbox.stub(DbOperations, 'createDocument')
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument')

      await PluginSettingHandler.updateStageNamesOnSppSettings(plugin, stageNames, info)

      expect(createDocumentStub.notCalled).to.be.true
      expect(updateDocumentStub.notCalled).to.be.true
    })

    it('should log an error if stage names length mismatches', async () => {
      const plugin = { address: '0xplugin-address' } as any
      const stageNames = ['Stage 1']
      const info = { transactionHash: '0x123', network: NetworksEnum.ethereumMainnet } as any

      const activePluginSetting = {
        stages: [{ stageIndex: 0 }, { stageIndex: 1 }],
      }

      sandbox.stub(Models.Setting, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findActive').resolves(activePluginSetting)
      const loggerStub = sandbox.stub(logger, 'error')
      const createDocumentStub = sandbox.stub(DbOperations, 'createDocument')
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument')

      await PluginSettingHandler.updateStageNamesOnSppSettings(plugin, stageNames, info)

      expect(loggerStub.calledOnceWith('Stage names length mismatch' as any)).to.be.true
      expect(createDocumentStub.notCalled).to.be.true
      expect(updateDocumentStub.notCalled).to.be.true
    })

    it('should update stage names and mark active settings as inactive', async () => {
      const plugin = {
        address: '0xplugin-address',
        daoAddress: '0xdao-address',
        subdomain: 'plugin.subdomain',
      } as any

      const stageNames = ['Stage 1', 'Stage 2']
      const info = {
        transactionHash: '0x123',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 100,
      } as any

      const activePluginSetting = {
        id: 'active-setting-id',
        stages: [{ stageIndex: 0 }, { stageIndex: 1 }],
      }

      sandbox.stub(Models.Setting, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findActive').resolves(activePluginSetting)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)
      const createDocumentStub = sandbox.stub(DbOperations, 'createDocument').resolves()
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()

      await PluginSettingHandler.updateStageNamesOnSppSettings(plugin, stageNames, info)

      expect(createDocumentStub.args[0][3]).to.eq('New Setting - sppSettingsUpdated')
      expect(updateDocumentStub.args[0][3]).to.eq('Update SPP inactive plugin')
    })

    it('should update the existing setting and create an inactive one if blockNumber is less than the active setting', async () => {
      const plugin = {
        address: '0xplugin-address',
        daoAddress: '0xdao-address',
        subdomain: 'plugin.subdomain',
      } as any

      const stageNames = ['Stage 1', 'Stage 2']
      const info = {
        transactionHash: '0x123',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 50, // less than activePluginSetting.blockNumber
      } as any

      const activePluginSetting = {
        id: 'active-setting-id',
        blockNumber: 100,
        stages: [{ stageIndex: 0 }, { stageIndex: 1 }],
      }

      sandbox.stub(Models.Setting, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findActive').resolves(activePluginSetting)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)

      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      const createDocumentStub = sandbox.stub(DbOperations, 'createDocument').resolves()

      await PluginSettingHandler.updateStageNamesOnSppSettings(plugin, stageNames, info)

      // Assert updateDocument is called for activePluginSetting with updated stages
      expect(
        updateDocumentStub.calledOnceWith(
          activePluginSetting,
          {
            stages: [
              { stageIndex: 0, name: 'Stage 1' },
              { stageIndex: 1, name: 'Stage 2' },
            ],
          },
          { logId: activePluginSetting.id, info },
          'Update SPP stage names',
        ),
      ).to.be.true

      // Assert createDocument is called for the inactive setting
      expect(
        createDocumentStub.calledOnceWith(
          Models.Setting,
          {
            blockNumber: info.blockNumber,
            blockTimestamp: 1620000000,
            transactionHash: info.transactionHash,
            daoAddress: plugin.daoAddress,
            pluginAddress: plugin.address,
            pluginSubdomain: plugin.subdomain,
            network: info.network,
            stages: [
              { stageIndex: 0, name: 'Stage 1' },
              { stageIndex: 1, name: 'Stage 2' },
            ],
            status: ISettingStatus.inactive,
          },
          info,
          'Update SPP inactive plugin',
        ),
      ).to.be.true
    })
  })

  describe('pairSppPlugins', () => {
    it('should update the main plugin and its sub-plugins', async () => {
      const plugin = {
        id: 'plugin-id',
        address: '0xmain-plugin',
        parentPlugin: null,
      } as any

      const settings = {
        stages: [
          {
            stageIndex: 0,
            plugins: [{ address: '0xsub-plugin1' }, { address: '0xsub-plugin2' }],
          },
          {
            stageIndex: 1,
            plugins: [{ address: '0xsub-plugin3' }],
          },
        ],
      } as any

      const info = { network: NetworksEnum.ethereumMainnet, blockNumber: 1 } as any

      sandbox
        .stub(Models.Plugin, 'findByAddress')
        .onFirstCall()
        .resolves({ id: 'sub-plugin1', interfaceType: 'spp' })
        .onSecondCall()
        .resolves({ id: 'sub-plugin2', interfaceType: 'spp' })
        .onThirdCall()
        .resolves({ id: 'sub-plugin3', interfaceType: 'custom' })

      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()

      await PluginSettingHandler.pairSppPlugins(plugin, settings, info)

      expect(updateDocumentStub.firstCall.args[3]).to.equal('Update spp plugin')
      expect(updateDocumentStub.secondCall.args[3]).to.equal('Update sub-plugin')
      expect(updateDocumentStub.thirdCall.args[3]).to.deep.equal('Update sub-plugin')
    })

    it('should log an warn if sub-plugin is not found', async () => {
      const plugin = { address: '0xmain-plugin' } as any
      const settings = {
        stages: [
          {
            stageIndex: 0,
            plugins: [{ address: '0xmissing-plugin' }],
          },
        ],
      } as any

      const info = { network: NetworksEnum.ethereumMainnet } as any

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      const loggerStub = sandbox.stub(logger, 'warn')
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument')

      await PluginSettingHandler.pairSppPlugins(plugin, settings, info)

      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.firstCall.args[0]).to.equal('Plugin not found - pairSppPlugins. External Address')
      expect(updateDocumentStub.calledOnce).to.be.true
    })
  })

  describe('isSupported', () => {
    it('should update plugin to be supported', async () => {
      const plugin = {
        id: 'plugin-id',
        isSupported: false,
      } as any

      const info = { blockNumber: 1 } as any

      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()

      await PluginSettingHandler.isSupported(plugin, info)

      expect(updateDocumentStub.args[0][3]).to.equal
    })

    it('should not update plugin if already supported', async () => {
      const plugin = {
        id: 'plugin-id',
        isSupported: true,
      } as any

      const info = { blockNumber: 1 } as any

      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument')

      await PluginSettingHandler.isSupported(plugin, info)

      expect(updateDocumentStub.notCalled).to.be.true
    })
  })

  describe('votingEscrowSettings', () => {
    it('should return voting escrow settings with all required fields', async () => {
      const plugin = {
        votingEscrow: {
          escrowAddress: '0xescrow123',
          exitQueueAddress: '0xexitqueue456',
          curveAddress: '0xcurve789',
        },
      } as unknown as Plugin

      const info = {
        network: NetworksEnum.ethereumMainnet,
        address: '0x456',
        transactionHash: '0x789',
        blockNumber: 1,
      } as ILogInfo

      // Mock all the GovernanceVeHelper functions
      const getMinDepositStub = sandbox
        .stub(GovernanceVeHelper, 'getMinDeposit')
        .resolves(BigInt('1000000000000000000')) // 1 ETH in wei
      const getMinLockStub = sandbox.stub(GovernanceVeHelper, 'getMinLock').resolves(BigInt('86400')) // 1 day in seconds
      const getCooldownStub = sandbox.stub(GovernanceVeHelper, 'getCooldown').resolves(BigInt('3600')) // 1 hour in seconds
      const getMaxTimeStub = sandbox.stub(GovernanceVeHelper, 'getMaxTime').resolves(BigInt('31536000')) // 1 year in seconds
      const getSlopeStub = sandbox
        .stub(GovernanceVeHelper, 'getSettingFromCoefficients')
        .resolves({ bias: BigInt('100'), slope: BigInt('100') })
      const getFeePercentStub = sandbox.stub(GovernanceVeHelper, 'getFeePercent').resolves(BigInt('1000'))
      const getMinFeePercentStub = sandbox.stub(GovernanceVeHelper, 'getMinFeePercent').resolves(BigInt('500'))
      const getMinCooldownStub = sandbox.stub(GovernanceVeHelper, 'getMinCooldown').resolves(BigInt('1800'))

      const result = await PluginSettingHandler.votingEscrowSettings(plugin, info)

      // Verify all helper functions were called with correct parameters
      expect(getMinDepositStub.calledOnceWith('0xescrow123', NetworksEnum.ethereumMainnet)).to.be.true
      expect(getMinLockStub.calledOnceWith('0xexitqueue456', NetworksEnum.ethereumMainnet)).to.be.true
      expect(getCooldownStub.calledOnceWith('0xexitqueue456', NetworksEnum.ethereumMainnet)).to.be.true
      expect(getMaxTimeStub.calledOnceWith('0xcurve789', NetworksEnum.ethereumMainnet)).to.be.true
      expect(getSlopeStub.calledOnceWith('0xcurve789', NetworksEnum.ethereumMainnet)).to.be.true
      expect(getFeePercentStub.calledOnceWith('0xexitqueue456', NetworksEnum.ethereumMainnet)).to.be.true
      expect(getMinFeePercentStub.calledOnceWith('0xexitqueue456', NetworksEnum.ethereumMainnet)).to.be.true
      expect(getMinCooldownStub.calledOnceWith('0xexitqueue456', NetworksEnum.ethereumMainnet)).to.be.true

      // Verify the returned object structure and values
      expect(result).to.deep.equal({
        minDeposit: '1000000000000000000',
        minLockTime: 86400,
        cooldown: 3600,
        maxTime: 31536000,
        slope: '100',
        bias: '100',
        feePercent: '1000',
        minFeePercent: '500',
        minCooldown: 1800,
      })
    })
  })
})
