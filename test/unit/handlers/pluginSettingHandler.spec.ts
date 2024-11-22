import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import {ITokenType, NetworksEnum} from '@types'
import { beforeEach } from 'mocha'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import {ProxyToken} from "@modules/proxyToken";

describe.only('Indexer: PluginSettingHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
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
        type: ITokenType.GovernanceERC20
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
        type: ITokenType.GovernanceERC20
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
  })
})
