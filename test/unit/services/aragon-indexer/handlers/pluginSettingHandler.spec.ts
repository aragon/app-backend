import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { ITokenType, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { PluginSettingHandler } from '@services/aragon-indexer/handlers/pluginSettingHandler'
import { Models } from '@dbModels'
import { ProxyToken } from '@modules/proxyToken'
import { LogGovernanceErc20 } from '@indexer/logGovernanceErc20'
import { LogTokenVoting } from '@indexer/logTokenVoting'
import { LogMultisig } from '@indexer/logMultisig'
import Web3Helper from '@helpers/web3'

describe('Indexer: PluginSettingHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('syncPluginData', () => {
    it('should return if plugin passed is null', async () => {
      const returned = await PluginSettingHandler.syncPluginData(null as any)
      expect(returned).to.be.undefined
    })

    it('should return if dao not found', async () => {
      const plugin = {
        daoAddress: '0x123',
        network: NetworksEnum.ethereumMainnet,
      }
      const stubFindByAddress = sandbox.stub(Models.Dao, 'findByAddress').resolves(false)
      const stubLogger = sandbox.stub(logger, 'error')

      await PluginSettingHandler.syncPluginData(plugin as any)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Dao not found' as any)).to.be.true
    })

    it('should handle if the plugin has token address', async () => {
      const plugin = {
        daoAddress: '0x123',
        network: NetworksEnum.ethereumMainnet,
        tokenAddress: '0x456',
      }

      const findDaoStub = sandbox.stub(Models.Dao, 'findByAddress').resolves({
        isSupported: false,
        id: '123',
        update: sandbox.stub(),
      })

      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        type: ITokenType.GovernanceERC20,
        address: '0x456',
      } as any)

      const LogGovernanceErc20Stub = sandbox.stub(LogGovernanceErc20, 'start').resolves()
      const LogTokenVotingStub = sandbox.stub(LogTokenVoting, 'start').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')
      await PluginSettingHandler.syncPluginData(plugin as any)

      expect(findDaoStub.calledOnce).to.be.true
      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(LogGovernanceErc20Stub.calledOnce).to.be.true
      expect(LogTokenVotingStub.calledOnce).to.be.true

      expect(findDaoStub.calledOnceWith('0x123', NetworksEnum.ethereumMainnet)).to.be.true
      expect(saveAndGetTokenStub.calledOnceWith('0x456', NetworksEnum.ethereumMainnet)).to.be.true

      expect(LogGovernanceErc20Stub.calledOnceWith(plugin)).to.be.true
      expect(LogTokenVotingStub.calledOnceWith(plugin)).to.be.true
      expect(verboseStub.calledOnceWith('Updated document - Dao Supported - setting fetched' as any)).to.be.true
    })

    it('should handle if the plugin has no token address and it is multisig', async () => {
      const plugin = {
        daoAddress: '0x123',
        network: NetworksEnum.ethereumMainnet,
      }

      const findDaoStub = sandbox.stub(Models.Dao, 'findByAddress').resolves({
        isSupported: false,
        id: '123',
        update: sandbox.stub(),
      })

      const LogMultisigStub = sandbox.stub(LogMultisig, 'start').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')
      await PluginSettingHandler.syncPluginData(plugin as any)

      expect(findDaoStub.calledOnce).to.be.true
      expect(LogMultisigStub.calledOnce).to.be.true

      expect(findDaoStub.calledOnceWith('0x123', NetworksEnum.ethereumMainnet)).to.be.true
      expect(LogMultisigStub.calledOnceWith(plugin)).to.be.true
      expect(verboseStub.calledOnceWith('Updated document - Dao Supported - setting fetched' as any)).to.be.true
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
        network: NetworksEnum.ethereumMainnet,
      }
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress').resolves(false)
      const stubLogger = sandbox.stub(logger, 'warn')

      await PluginSettingHandler.votingSettingsUpdated(parsedEvent as any, info as any)

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
        network: NetworksEnum.ethereumMainnet,
      }
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress').resolves(true)
      const stubFindExistingLog = sandbox.stub(Models.Setting, 'findExistingLog').resolves(false)
      const stubFindActive = sandbox.stub(Models.Setting, 'findActive').resolves(false)
      const stubLogger = sandbox.stub(logger, 'verbose')
      const syncPluginDataStub = sandbox.stub(PluginSettingHandler, 'syncPluginData').resolves()
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123123123)

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

      expect(syncPluginDataStub.calledOnce).to.be.true
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
        network: NetworksEnum.ethereumMainnet,
      }
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress').resolves(true)
      const stubFindExistingLog = sandbox.stub(Models.Setting, 'findExistingLog').resolves(false)
      const stubFindActive = sandbox.stub(Models.Setting, 'findActive').resolves(false)
      const stubLogger = sandbox.stub(logger, 'verbose')
      const syncPluginDataStub = sandbox.stub(PluginSettingHandler, 'syncPluginData').resolves()

      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123123123)

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

      expect(syncPluginDataStub.calledOnce).to.be.true
      expect(getBlockTimestampStub.calledOnce).to.be.true
    })
  })
})
